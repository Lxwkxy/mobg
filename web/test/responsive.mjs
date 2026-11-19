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
let browser;

before(async () => {
  await mkdir(output, { recursive: true });
  browser = await chromium.launch({ channel: process.env.CI ? undefined : 'chrome', headless: true });
});
after(async () => { await browser?.close(); });

async function setup(viewport, role = 'Member') {
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
    else if (url.pathname === '/api/projects') body = { projects: [{ projectId: 91, myRole: role }],
      pagination: { page: 1, pageSize: 50, totalItems: 1, totalPages: 1 } };
    else if (url.pathname === '/api/tasks/mine' || url.pathname === '/api/projects/91/tasks') {
      if (state.unavailable) return route.fulfill({ status: 500, headers, json: { success: false } });
      const tasks = [{ ...assigned, status: state.status }];
      if (url.pathname.endsWith('/91/tasks')) tasks.push(unassigned);
      const status = url.searchParams.get('status');
      body = { tasks: status ? tasks.filter((task) => task.status === status) : tasks };
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
      const priority = page.getByLabel('Filter by priority');
      await priority.selectOption('2');
      await task.waitFor({ state: 'hidden' });
      await priority.selectOption('1');
      await task.waitFor();
      const status = page.getByLabel('Filter by status');
      await status.selectOption('Done');
      await page.waitForURL('**/mytasks?*status=Done*');
      await task.waitFor({ state: 'hidden' });
      await status.selectOption('In progress');
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

test('Project Tasks only offers status changes to the owner or assigned member', async () => {
  for (const role of ['Member', 'Owner']) {
    const { page, state } = await setup({ width: 390, height: 844 }, role);
    try {
      await page.goto(`${base}/mytasks?scope=projects`);
      await page.getByRole('link', { name: unassigned.taskTitle, exact: true }).waitFor();
      const otherStatus = page.getByRole('combobox', { name: `Change status for ${unassigned.taskTitle}` });
      assert.equal(await otherStatus.count(), role === 'Owner' ? 1 : 0);
      if (role === 'Member') {
        const ownStatus = page.getByRole('combobox', { name: `Change status for ${assigned.taskTitle}` });
        await ownStatus.selectOption('Done');
        await page.waitForFunction(() => document.querySelector('select[aria-label^="Change status for LongTaskName"]')?.value === 'Done');
        assert.deepEqual(state.updates, [{ status: 'Done' }]);
      }
    } finally { await page.close(); }
  }
});
