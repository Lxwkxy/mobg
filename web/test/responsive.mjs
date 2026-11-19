import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { after, before, test } from 'node:test';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.RESPONSIVE_BASE_URL || 'http://127.0.0.1:3100';
const output = process.env.RESPONSIVE_OUTPUT || '.next/responsive';
const user = { userId: 1, userName: 'Layout test user', email: 'layout@example.test' };
const assigned = {
  taskId: 1, projectId: 91, projectName: 'LongProjectName'.repeat(12),
  taskTitle: 'LongTaskName'.repeat(18), taskDescription: 'LongDescription'.repeat(16),
  assignees: [user], priority: 1, status: 'In progress', dueDate: '2026-12-31',
  createdAt: '2026-01-01T00:00:00.000Z', createdById: 1, createdByName: user.userName, isOverdue: false,
};
const unassigned = { ...assigned, taskId: 2, taskTitle: 'Another member’s task', assignees: [{ userId: 2, userName: 'Other' }] };
const otherProjectTask = {
  ...unassigned,
  taskId: 3,
  projectId: 92,
  projectName: 'Other Project Without My Tasks',
  taskTitle: 'Other project member task',
};
let browser;

before(async () => {
  await mkdir(output, { recursive: true });
  browser = await chromium.launch({ channel: process.env.CI ? undefined : 'chrome', headless: true });
});
after(async () => { await browser?.close(); });

async function setup(viewport, role = 'Member', includeOtherProject = false) {
  const page = await browser.newPage({ viewport });
  const state = { status: assigned.status, unavailable: false, updates: [] };
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const headers = { 'Access-Control-Allow-Origin': new URL(base).origin,
      'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Headers': 'content-type',
      'Access-Control-Allow-Methods': 'GET, PATCH, OPTIONS' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    let body;
    if (url.pathname === '/api/me') body = { user };
    else if (url.pathname === '/api/projects') {
      const projects = [{ projectId: 91, myRole: role }];
      if (includeOtherProject) projects.push({ projectId: 92, myRole: 'Member' });
      body = { projects, pagination: { page: 1, pageSize: 50, totalItems: projects.length, totalPages: 1 } };
    } else if (url.pathname === '/api/tasks/mine' || url.pathname === '/api/projects/91/tasks') {
      if (state.unavailable) return route.fulfill({ status: 500, headers, json: { success: false } });
      const tasks = [{ ...assigned, status: state.status }];
      if (url.pathname.endsWith('/91/tasks')) tasks.push(unassigned);
      const status = url.searchParams.get('status');
      body = { tasks: status ? tasks.filter((task) => task.status === status) : tasks };
    } else if (url.pathname === '/api/projects/92/tasks') {
      body = { tasks: includeOtherProject ? [otherProjectTask] : [] };
    } else if (url.pathname === '/api/projects/91/tasks/1' && req.method() === 'PATCH') {
      const patch = req.postDataJSON();
      state.updates.push(patch);
      state.status = patch.status;
      body = { task: { ...assigned, status: state.status } };
    } else return route.fulfill({ status: 404, headers, json: { success: false } });
    await route.fulfill({ headers, json: { success: true, ...body } });
  });
  return { page, state };
}

test('My Tasks fits small through large viewports with real API response shapes', async () => {
  for (const [width, height] of [[320, 740], [390, 844], [768, 1024], [1440, 900]]) {
    const { page, state } = await setup({ width, height });
    try {
      const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
      await page.goto(`${base}/mytasks`);
      const task = page.getByRole('link', { name: assigned.taskTitle, exact: true });
      await task.waitFor();
      assert.equal(await fits(), true, `long task and project names at ${width}px`);

      for (const label of [
        'Filter tasks by project',
        'Filter tasks by status',
        'Filter tasks by priority',
        'Sort tasks',
        'Clear filters',
      ]) {
        const box = await page.getByRole('button', { name: label }).boundingBox();
        assert.ok(box && box.height >= 44, `${label} height >= 44px at ${width}px (got ${box?.height})`);
      }

      if (width === 320) {
        const projectBtn = page.getByRole('button', { name: 'Filter tasks by project' });
        await projectBtn.click();
        await page.getByRole('option', { name: assigned.projectName }).click();
        const projectBtnBox = await projectBtn.boundingBox();
        assert.ok(projectBtnBox && projectBtnBox.height > 48, 'long project name wraps onto multiple lines at 320px');
        assert.equal(await fits(), true, 'wrapped long project name fits 320px');
        await page.getByRole('button', { name: 'Clear filters' }).click();

        const sortBtn = page.getByRole('button', { name: 'Sort tasks' });
        await sortBtn.click();
        const sortListbox = page.getByRole('listbox', { name: 'Sort task options' });
        await sortListbox.waitFor();
        const sortBox = await sortListbox.boundingBox();
        assert.ok(
          sortBox && sortBox.x >= 0 && sortBox.x + sortBox.width <= width,
          `sort menu fits within 320px viewport (x=${sortBox?.x}, width=${sortBox?.width})`,
        );
        await page.keyboard.press('Escape');
        await sortListbox.waitFor({ state: 'hidden' });
      }

      const priority = page.getByRole('button', { name: 'Filter tasks by priority' });
      await priority.click();
      await page.getByRole('option', { name: 'Medium' }).click();
      await task.waitFor({ state: 'hidden' });
      await priority.click();
      await page.getByRole('option', { name: 'High' }).click();
      await task.waitFor();

      const status = page.getByRole('button', { name: 'Filter tasks by status' });
      await status.click();
      await page.getByRole('option', { name: 'Done' }).click();
      await page.waitForURL('**/mytasks?*status=Done*');
      await task.waitFor({ state: 'hidden' });
      await status.click();
      await page.getByRole('option', { name: 'In progress' }).click();
      await task.waitFor();

      const search = page.getByRole('searchbox', { name: 'Search tasks' });
      await search.fill('no matching task');
      await task.waitFor({ state: 'hidden' });
      await search.clear();
      await task.waitFor();
      await page.screenshot({ path: `${output}/mytasks-${width}.png`, fullPage: true });

      state.unavailable = true;
      await page.reload();
      const retry = page.getByRole('main').getByRole('button', { name: 'Try again', exact: true });
      await retry.waitFor();
      assert.equal(await fits(), true, `error state at ${width}px`);
      await page.screenshot({ path: `${output}/mytasks-error-${width}.png`, fullPage: true });
      state.unavailable = false;
      await retry.click();
      await task.waitFor();
    } finally { await page.close(); }
  }
});

test('My Tasks filter dropdowns support full keyboard navigation and focus restoration', async () => {
  const { page } = await setup({ width: 1280, height: 800 });
  try {
    await page.goto(`${base}/mytasks`);
    const task = page.getByRole('link', { name: assigned.taskTitle, exact: true });
    await task.waitFor();

    const search = page.getByRole('searchbox', { name: 'Search tasks' });
    await search.focus();
    // Tab ผ่าน Project -> Status
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');

    const statusBtn = page.getByRole('button', { name: 'Filter tasks by status' });
    assert.equal(
      await statusBtn.evaluate((el) => el === document.activeElement),
      true,
      'Tab moves focus onto status filter button',
    );

    // เปิดเมนูด้วย Enter และปิดด้วย Escape พร้อมคืนโฟกัส
    await page.keyboard.press('Enter');
    const statusListbox = page.getByRole('listbox', { name: 'Task status options' });
    await statusListbox.waitFor();
    await page.keyboard.press('Escape');
    await statusListbox.waitFor({ state: 'hidden' });
    assert.equal(
      await statusBtn.evaluate((el) => el === document.activeElement),
      true,
      'Escape closes status dropdown and restores focus to trigger',
    );

    // เปิดด้วยลูกศรลง เลือก Done ด้วยลูกศรและ Enter
    await page.keyboard.press('ArrowDown');
    await statusListbox.waitFor();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await statusListbox.waitFor({ state: 'hidden' });
    await task.waitFor({ state: 'hidden' });
    assert.equal(await statusBtn.textContent(), 'Done');
    assert.equal(
      await statusBtn.evaluate((el) => el === document.activeElement),
      true,
      'Enter selects option and restores focus to trigger',
    );
  } finally { await page.close(); }
});

test('Switching from Project Tasks to My Tasks resets project filter to All projects', async () => {
  const { page } = await setup({ width: 1280, height: 800 }, 'Member', true);
  try {
    await page.goto(`${base}/mytasks?scope=projects`);
    const assignedTask = page.getByRole('link', { name: assigned.taskTitle, exact: true });
    const otherTask = page.getByRole('link', { name: otherProjectTask.taskTitle, exact: true });
    await assignedTask.waitFor();
    await otherTask.waitFor();

    // เลือกโปรเจกต์ที่ไม่มีงานของเรา
    const projectBtn = page.getByRole('button', { name: 'Filter tasks by project' });
    await projectBtn.click();
    await page.getByRole('option', { name: otherProjectTask.projectName }).click();
    assert.equal(await projectBtn.textContent(), otherProjectTask.projectName);
    await assignedTask.waitFor({ state: 'hidden' });
    await otherTask.waitFor();

    // กด Show my assigned tasks only -> ต้องรีเซ็ตเป็น All projects และแสดงงานของเราทันที
    await page.getByRole('button', { name: 'Show my assigned tasks only' }).click();
    assert.equal(await projectBtn.textContent(), 'All projects');
    await assignedTask.waitFor();
  } finally { await page.close(); }
});

test('Project Tasks only offers status changes to the owner or assigned member', async () => {
  for (const role of ['Member', 'Owner']) {
    const { page, state } = await setup({ width: 390, height: 844 }, role);
    try {
      await page.goto(`${base}/mytasks?scope=projects`);
      await page.getByRole('link', { name: unassigned.taskTitle, exact: true }).waitFor();
      const otherStatus = page.getByRole('button', { name: `Change status for ${unassigned.taskTitle}` });
      assert.equal(await otherStatus.count(), role === 'Owner' ? 1 : 0);
      if (role === 'Member') {
        const ownStatus = page.getByRole('button', { name: `Change status for ${assigned.taskTitle}` });
        await ownStatus.click();
        await page.getByRole('option', { name: 'Done' }).click();
        await page.waitForFunction(
          (title) => document.querySelector(`button[aria-label="Change status for ${title}"]`)?.textContent?.includes('Done'),
          assigned.taskTitle,
        );
        assert.deepEqual(state.updates, [{ status: 'Done' }]);
      }
    } finally { await page.close(); }
  }
});