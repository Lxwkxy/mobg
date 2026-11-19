import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.RESPONSIVE_BASE_URL || 'http://127.0.0.1:3100';
const output = process.env.RESPONSIVE_OUTPUT || '.next/responsive';
const sizes = [[320, 740], [375, 812], [768, 1024], [1024, 768], [1280, 900], [1440, 900]];
let browser;
before(async () => {
  await mkdir(output, { recursive: true });
  browser = await chromium.launch({ channel: process.env.CI ? undefined : 'chrome', headless: true });
});
after(async () => { await browser?.close(); });

const project = { projectId: 91, projectName: 'LongProjectName'.repeat(10),
  projectDescription: 'LongDescription'.repeat(40), startDate: '2026-01-01', dueDate: '2026-12-31',
  createdAt: '2026-01-01T00:00:00Z', creatorId: 1, creatorName: 'Layout Owner', myRole: 'Owner',
  derivedStatus: 'In progress', progressPercent: 67, totalTasks: 12, completedTasks: 8, highPriorityTaskCount: 3 };
const users = Array.from({ length: 20 }, (_, i) => ({ userId: i + 2,
  userName: `Member ${i + 2} ${'LongMemberName'.repeat(7)}`, email: `member${i + 2}@example.test` }));
const task = { taskId: 27, projectId: 91, projectName: project.projectName, taskTitle: 'Prepare the demo',
  taskDescription: 'LongTaskDescription'.repeat(20), priority: 2, status: 'In progress', dueDate: '2026-12-31',
  isOverdue: false, createdAt: '2026-01-01T00:00:00.000Z', createdById: 1, createdByName: 'Layout Owner',
  assignees: [{ userId: 1, userName: 'Layout Owner' }] };

async function pageAt(width, height) {
  const page = await browser.newPage({ viewport: { width, height } });
  page.setDefaultTimeout(10000);
  // All API requests are intercepted: these tests verify UI behavior, never real auth/data permissions.
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    const headers = { 'Access-Control-Allow-Origin': new URL(base).origin,
      'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Headers': 'content-type' };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    let body;
    if (url.pathname === '/api/me') body = { user: { userId: 1, userName: 'LayoutUser'.repeat(12), email: 'layout@example.test' } };
    else if (url.pathname === '/api/users') body = { users };
    else if (url.pathname === '/api/projects') {
      const page = Number(url.searchParams.get('page') || 1);
      const pageSize = Number(url.searchParams.get('pageSize') || 10);
      const projects = [project, ...Array.from({ length: 11 }, (_, index) => ({
        ...project, projectId: 92 + index, projectName: `Workspace ${92 + index}`,
        createdAt: '2025-12-31T00:00:00Z', totalTasks: 0, completedTasks: 0, progressPercent: 0, highPriorityTaskCount: 0,
      }))];
      body = { projects: projects.slice((page - 1 * 0) * 0 + (page - 1) * pageSize, page * pageSize),
        pagination: { page, pageSize, totalItems: projects.length, totalPages: Math.ceil(projects.length / pageSize) } };
    }
    else if (url.pathname === '/api/projects/91') body = { project };
    else if (url.pathname === '/api/search') body = { projects: [
      { projectId: project.projectId, projectName: project.projectName },
    ], tasks: [] };
    else if (url.pathname === '/api/dashboard') body = { summary: { projectCount: 12, taskCount: 12,
      statusCounts: { todo: 3, inProgress: 1, done: 8 }, overdueCount: 0, highPriorityCount: 0 }, highPriorityTasks: [] };
    else if (url.pathname === '/api/tasks/mine') body = { tasks: [task] };
    else if (/^\/api\/projects\/\d+\/tasks$/.test(url.pathname)) body = { tasks: url.pathname.includes('/91/') ? [task] : [] };
    else if (url.pathname === '/api/projects/91/tasks/27') body = { task };
    else if (url.pathname === '/api/projects/91/tasks/27/comments') body = { comments: [] };
    else if (url.pathname === '/api/projects/91/members') body = { members: [
      { userId: 1, userName: 'Layout Owner', email: 'layout@example.test', role: 'Owner', joinDate: '2026-01-01' },
      { userId: 2, userName: 'Existing member', email: 'existing@example.test', role: 'Member', joinDate: '2026-01-01' },
    ] };
    else return route.fulfill({ status: 404, headers, json: { success: false, error: { code: 'NOT_FOUND', message: 'Fixture missing' } } });
    await route.fulfill({ headers, json: { success: true, ...body } });
  });
  return page;
}

async function fits(page, label) {
  const dimensions = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
  if (dimensions.scroll > dimensions.width) {
    const offenders = await page.locator('main *').evaluateAll((elements) => elements
      .filter((el) => el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX === 'visible')
      .slice(-8).map((el) => `${el.tagName}.${typeof el.className === 'string' ? el.className : ''}`));
    assert.fail(`${label}: overflow ${dimensions.scroll} > ${dimensions.width} (${offenders.join(', ')})`);
  }
}
async function reachable(locator) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  const size = locator.page().viewportSize();
  assert.ok(box && box.x >= 0 && box.x + box.width <= size.width + 1, 'control fits viewport horizontally');
  assert.ok(box.y >= 0 && box.y + box.height <= size.height + 1, 'control can scroll fully into view');
}

async function tabTo(page, locator) {
  await locator.waitFor();
  for (let index = 0; index < 100; index++) {
    if (await locator.evaluate((element) => element === document.activeElement)) return;
    await page.keyboard.press('Tab');
  }
  assert.fail('Control was not reachable with Tab');
}

async function focused(locator) {
  await locator.waitFor();
  assert.equal(await locator.evaluate(element => element === document.activeElement), true);
}

test('keyboard skips navigation, operates filters and leaves popups with focus in order', async () => {
  const page = await pageAt(1440, 900);
  try {
    await page.goto(`${base}/projects`);
    await page.getByText(project.projectName, { exact: true }).first().waitFor();
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Skip to main content' });
    await focused(skip);
    await page.keyboard.press('Enter');
    await focused(page.getByRole('main'));

    const status = page.getByRole('button', { name: 'Project status', exact: true });
    await tabTo(page, status);
    assert.equal(await status.evaluate(element => getComputedStyle(element).outlineStyle), 'solid');
    await page.keyboard.press('ArrowDown');
    await focused(page.getByRole('option', { name: 'All status', exact: true }));
    await page.keyboard.press('End');
    await focused(page.getByRole('option', { name: 'Done', exact: true }));
    await page.keyboard.press('Escape');
    await focused(status);
    await page.keyboard.press('Enter');
    await page.keyboard.press('Tab');
    const sort = page.getByRole('button', { name: 'Sort projects', exact: true });
    await focused(sort);
    assert.equal(await status.getAttribute('aria-expanded'), 'false');
    await page.keyboard.press('Space');
    const sortList = page.getByRole('listbox', { name: 'Sort projects options' });
    await sortList.waitFor();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await focused(sort);
    assert.equal(await sort.getAttribute('aria-expanded'), 'false');
  } finally { await page.close(); }
});

test('keyboard opens search results, project tabs and account and project menus', async () => {
  const page = await pageAt(1440, 900);
  try {
    await page.goto(`${base}/projects`);
    const search = page.getByRole('searchbox', { name: 'Search projects and tasks' });
    await tabTo(page, search);
    await page.keyboard.type('Layout');
    await page.keyboard.press('Enter');
    const result = page.getByRole('search').getByRole('link', { name: project.projectName, exact: true });
    await result.waitFor();
    await page.keyboard.press('ArrowDown');
    await focused(result);
    await page.keyboard.press('Escape');
    await focused(search);
    await page.keyboard.press('Enter');
    await result.waitFor();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await page.waitForURL('**/projects/91');
    await page.getByRole('heading', { name: project.projectName, exact: true }).waitFor();
    await focused(page.getByRole('main'));

    const overview = page.getByRole('tab', { name: 'Overview' });
    await tabTo(page, overview);
    await page.keyboard.press('ArrowRight');
    const tasks = page.getByRole('tab', { name: /^Tasks/ });
    await focused(tasks);
    assert.equal(await tasks.getAttribute('aria-selected'), 'true');
    await page.keyboard.press('End');
    await focused(page.getByRole('tab', { name: /^Members/ }));
    await page.keyboard.press('Home');
    await focused(overview);

    const actions = page.getByRole('button', { name: 'Project options' });
    await tabTo(page, actions);
    await page.keyboard.press('ArrowUp');
    await focused(page.getByRole('menuitem', { name: 'Delete Project' }));
    await page.keyboard.press('Enter');
    const confirm = page.getByRole('dialog', { name: 'Delete project?' });
    await focused(confirm.getByRole('button', { name: 'Cancel' }));
    await page.keyboard.press('Shift+Tab');
    await focused(confirm.getByRole('button', { name: 'Delete project', exact: true }));
    await page.keyboard.press('Escape');
    await confirm.waitFor({ state: 'hidden' });
    await focused(actions);

    const account = page.getByRole('banner').getByRole('button', { name: /^LayoutUser/ });
    await tabTo(page, account);
    await page.keyboard.press('Space');
    await focused(page.getByRole('menuitem', { name: /Log out/ }));
    await page.keyboard.press('Escape');
    await focused(account);
  } finally { await page.close(); }
});

test('member picker and removal confirmation work with keyboard alone', async () => {
  const page = await pageAt(1440, 900);
  try {
    await page.goto(`${base}/projects/91/members`);
    const search = page.getByPlaceholder('Search members by name or email...');
    await tabTo(page, search);
    await page.keyboard.type('member3@example.test');
    await page.keyboard.press('ArrowDown');
    await focused(page.getByRole('button', { name: /member3@example.test/i }));
    await page.keyboard.press('Escape');
    await focused(search);
    const remove = page.getByRole('button', { name: 'Remove Existing member' });
    await tabTo(page, remove);
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Remove member' });
    await focused(dialog.getByRole('button', { name: 'Cancel' }));
    await page.keyboard.press('Tab');
    await focused(dialog.getByRole('button', { name: 'Remove member' }));
    await page.keyboard.press('Tab');
    await focused(dialog.getByRole('button', { name: 'Cancel' }));
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    await focused(remove);
    await page.getByText('Existing member', { exact: true }).waitFor();
  } finally { await page.close(); }
});

test('keyboard selects project members and task form options and reaches the comment composer', async () => {
  const page = await pageAt(1440, 900);
  try {
    await page.goto(`${base}/projects/create`);
    const member = page.getByRole('textbox', { name: 'Project members' });
    await tabTo(page, member);
    await page.keyboard.type('member3@example.test');
    await page.keyboard.press('ArrowDown');
    await focused(page.getByRole('button', { name: /member3@example.test/i }));
    await page.keyboard.press('Enter');
    await focused(member);
    await page.getByRole('button', { name: /^Remove Member 3/ }).waitFor();

    await page.goto(`${base}/projects/91/tasks/new`);
    const priority = page.locator('#priority');
    await tabTo(page, priority);
    await page.keyboard.press('ArrowDown');
    await focused(page.getByRole('option', { name: 'High', exact: true }));
    await page.keyboard.press('Enter');
    await focused(priority);
    assert.match(await priority.innerText(), /High/);
    const assignee = page.getByRole('checkbox', { name: /Existing member/ });
    await tabTo(page, assignee);
    await page.keyboard.press('Space');
    assert.equal(await assignee.isChecked(), true);

    await page.goto(`${base}/projects/91/tasks/27`);
    await tabTo(page, page.getByRole('button', { name: 'Sort by latest' }));
    await page.keyboard.press('Enter');
    await page.keyboard.press('ArrowDown');
    await focused(page.getByRole('option', { name: 'Sort by oldest' }));
    await page.keyboard.press('Enter');
    await focused(page.getByRole('button', { name: 'Sort by oldest' }));
    const composer = page.getByLabel('Add a comment');
    await tabTo(page, composer);
    await page.keyboard.type('Keyboard draft');
    assert.equal(await composer.inputValue(), 'Keyboard draft');
    await page.keyboard.press('Tab');
    await focused(page.getByRole('button', { name: 'Post comment', exact: true }));
  } finally { await page.close(); }
});

test('global search ignores superseded responses and cancels pending work when cleared', async () => {
  const page = await pageAt(375, 812);
  try {
    await page.addInitScript(() => {
      const fetchOriginal = window.fetch.bind(window);
      window.searchRequests = [];
      window.fetch = (input, init) => {
        const url = new URL(input instanceof Request ? input.url : input, window.location.href);
        if (url.pathname !== '/api/search') return fetchOriginal(input, init);

        // Deliver responses even after abort so the request identity check is exercised.
        return new Promise(resolve => window.searchRequests.push({
          query: url.searchParams.get('q'),
          signal: init?.signal,
          respond: (body, status = 200) => resolve(Response.json(body, { status })),
        }));
      };
    });

    await page.goto(`${base}/projects`);
    const search = page.getByRole('searchbox', { name: 'Search projects and tasks' });
    const first = 'older result';
    const second = 'newer result';
    await search.fill(first);
    await page.waitForFunction(q => window.searchRequests.some(request => request.query === q), first);
    await search.fill(second);
    await search.press('Enter');
    await page.waitForFunction(q => window.searchRequests.some(request => request.query === q), second);
    assert.equal(await page.evaluate(q => window.searchRequests.find(request => request.query === q).signal.aborted, first), true);

    await page.evaluate(q => window.searchRequests.find(request => request.query === q && !request.signal.aborted).respond({
      success: true,
      projects: [{ projectId: 91, projectName: 'Newest project' }],
      tasks: [{ projectId: 91, projectName: 'Newest project', taskId: 27, taskTitle: 'Newest task' }],
    }), second);
    const results = page.getByRole('search');
    await results.getByRole('link', { name: 'Newest project', exact: true }).waitFor();
    assert.equal(await results.getByRole('link', { name: /Newest task/ }).getAttribute('href'), '/projects/91/tasks/27');
    await fits(page, 'Search results');

    await page.evaluate(async q => {
      window.searchRequests.find(request => request.query === q).respond({ success: false }, 500);
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }, first);
    assert.equal(await results.getByRole('link', { name: 'Newest project', exact: true }).isVisible(), true);
    assert.equal(await results.getByText('Unable to search. Try again.').count(), 0);

    await search.fill('pending');
    await page.waitForFunction(() => window.searchRequests.some(request => request.query === 'pending'));
    await search.clear();
    assert.equal(await page.evaluate(() => window.searchRequests.find(request => request.query === 'pending').signal.aborted), true);
    await page.evaluate(async () => {
      window.searchRequests.find(request => request.query === 'pending').respond({
        success: true, projects: [{ projectId: 92, projectName: 'Cleared result' }], tasks: [],
      });
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    assert.equal(await results.getByRole('link').count(), 0);
  } finally { await page.close(); }
});

test('mobile navigation opens, closes with Escape, and closes after selecting a route', async () => {
  for (const [width, height] of sizes) {
    const page = await pageAt(width, height);
    try {
      await page.goto(`${base}/mytasks`);
      await page.getByRole('link', { name: task.taskTitle, exact: true }).waitFor();
      const nav = page.getByRole('navigation', { name: 'Main navigation' });
      if (width < 1024) {
        const toggle = page.getByRole('button', { name: 'Menu', exact: true });
        await toggle.click();
        assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
        await nav.getByRole('link', { name: 'Projects', exact: true }).focus();
        await page.keyboard.press('Escape');
        assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
        assert.equal(await toggle.evaluate(el => el === document.activeElement), true);
        await toggle.click();
        await nav.getByRole('link', { name: 'Projects', exact: true }).click();
        await page.waitForURL('**/projects');
        assert.equal(await nav.isVisible(), false);
      } else {
        await nav.getByRole('link', { name: 'Projects', exact: true }).click();
        await page.waitForURL('**/projects');
        assert.equal(await nav.isVisible(), true);
      }
      // Navigation is an inline disclosure, so background scrolling remains available.
      assert.notEqual(await page.evaluate(() => getComputedStyle(document.body).overflow), 'hidden');
      console.log(`navigation ${width}: passed`);
    } finally { await page.close(); }
  }
});

test('Dashboard cards and long task/project lists fit each viewport and keep links accessible', async () => {
  for (const [width, height] of sizes) {
    const page = await pageAt(width, height);
    try {
      await page.goto(`${base}/dashboard`);
      await page.getByRole('link', { name: new RegExp(task.taskTitle) }).waitFor();
      await fits(page, `Dashboard ${width}`);
      const all = page.getByRole('link', { name: 'View all', exact: true });
      await reachable(all.first());
      await reachable(all.last());
      const taskLink = all.last();
      await reachable(taskLink);
      await page.screenshot({ path: `${output}/dashboard-${width}.png`, fullPage: true });
      await taskLink.click();
      await page.waitForURL('**/mytasks');
      console.log(`Dashboard ${width}: passed`);
    } finally { await page.close(); }
  }
});

test('switching to Projects uses the aggregate response and only verifies the current session around the load', async () => {
  const page = await pageAt(1440, 900);
  try {
    await page.goto(`${base}/dashboard`);
    await page.getByRole('heading', { name: 'Important Tasks' }).waitFor();
    const paths = [];
    page.on('request', request => paths.push(new URL(request.url()).pathname));
    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Projects', exact: true }).click();
    const card = page.locator('article').filter({ hasText: project.projectName });
    await card.getByText('3', { exact: true }).waitFor();
    assert.equal(paths.filter(path => path === '/api/projects').length, 1);
    assert.equal(paths.filter(path => /^\/api\/projects\/\d+\/tasks$/.test(path)).length, 0);
    assert.equal(paths.filter(path => path === '/api/me').length, 2);
  } finally { await page.close(); }
});

test('Projects discards an in-flight list when the current account changes', async () => {
  const page = await pageAt(1440, 900);
  try {
    await page.goto(`${base}/dashboard`);
    await page.getByRole('heading', { name: 'Important Tasks' }).waitFor();
    const previousName = 'Previous account private project';
    const newName = 'Current account project';
    const headers = { 'Access-Control-Allow-Origin': new URL(base).origin, 'Access-Control-Allow-Credentials': 'true' };
    let userId = 1;
    let lists = 0;
    await page.route('**/api/me', route => route.fulfill({ headers, json: {
      success: true, user: { userId, userName: `Account ${userId}`, email: `account${userId}@example.test` },
    } }));
    await page.route('**/api/projects?*', (route) => {
      lists += 1;
      const projectName = lists === 1 ? previousName : newName;
      userId = 2;
      return route.fulfill({ headers, json: { success: true,
        projects: [{ ...project, projectName }], pagination: { page: 1, pageSize: 50, totalItems: 1, totalPages: 1 },
      } });
    });
    await page.evaluate((name) => {
      window.sawPreviousProject = false;
      new MutationObserver(() => {
        window.sawPreviousProject ||= document.querySelector('main')?.innerText.includes(name) ?? false;
      }).observe(document.body, { childList: true, subtree: true, characterData: true });
    }, previousName);

    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Projects', exact: true }).click();
    await page.locator('article').getByText(newName, { exact: true }).waitFor();
    assert.equal(lists, 2);
    assert.equal(await page.evaluate(() => window.sawPreviousProject), false);
  } finally { await page.close(); }
});

test('Projects cards, pagination and create/open actions fit with long names and zero progress', async () => {
  for (const [width, height] of sizes) {
    const page = await pageAt(width, height);
    try {
      await page.goto(`${base}/projects`);
      await page.getByText(project.projectName, { exact: true }).first().waitFor();
      await fits(page, `Projects ${width}`);
      await page.getByText('0%', { exact: true }).first().waitFor();
      const next = page.getByRole('button', { name: 'Next →', exact: true });
      await reachable(next);
      await next.click();
      await page.getByText('Page 2 of 2', { exact: true }).waitFor();
      await reachable(page.getByRole('button', { name: '← Previous', exact: true }));
      await page.screenshot({ path: `${output}/projects-${width}.png`, fullPage: true });
      await page.getByRole('button', { name: '← Previous', exact: true }).click();
      const card = page.locator('article').filter({ hasText: project.projectName });
      await card.getByRole('link', { name: 'View project', exact: false }).click();
      await page.waitForURL('**/projects/91');
      await page.goBack();
      await page.getByRole('button', { name: 'Create Project', exact: true }).click();
      await page.waitForURL('**/projects/create');
      console.log(`Projects ${width}: passed`);
    } finally { await page.close(); }
  }
});

test('Create Project keeps long member chips, field errors and save/cancel reachable', async () => {
  for (const [width, height] of [...sizes, [390, 430]]) {
    const page = await pageAt(width, height);
    let posts = 0;
    let lastBody;
    await page.route('**/api/projects', async route => {
      if (route.request().method() !== 'POST') return route.fallback();
      posts++;
      lastBody = route.request().postDataJSON();
      await route.fulfill({ status: 400, headers: {
        'Access-Control-Allow-Origin': new URL(base).origin, 'Access-Control-Allow-Credentials': 'true',
      }, json: { success: false, error: { code: 'VALIDATION_ERROR',
        message: 'LongServerError'.repeat(25), details: [
          { field: 'projectName', message: 'LongNameError'.repeat(25) },
          { field: 'memberIds', message: 'LongMembersError'.repeat(25) },
        ] } } });
    });
    try {
      const bangkokDate = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Bangkok',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
      const startDate = bangkokDate.format(new Date());
      const dueDate = bangkokDate.format(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));

      await page.goto(`${base}/projects/create`);
      await page.getByLabel('Project name', { exact: false }).waitFor();
      await fits(page, `Create Project ${width}`);
      await page.getByLabel('Project name', { exact: false }).fill('Layout Project');
      await page.locator('#startDate').fill(startDate);
      await page.locator('#dueDate').fill(dueDate);
      await page.getByLabel('Project description').fill('Description'.repeat(100));
      await page.getByLabel('Project members', { exact: true }).click();
      await page.getByRole('button', { name: new RegExp(`Member 2 `) }).click();
      await page.getByRole('button', { name: new RegExp(`Member 3 `) }).click();
      await page.getByLabel('Project members', { exact: true }).press('Escape');
      await page.getByRole('button', { name: 'Close member search results', exact: true }).waitFor({ state: 'hidden' });
      await fits(page, `Create Project ${width} long chips`);
      const remove = page.getByRole('button', { name: `Remove ${users[0].userName}`, exact: true });
      await reachable(remove);
      const removeBox = await remove.boundingBox();
      assert.ok(removeBox.width >= 44 && removeBox.height >= 44, 'member chip removal has a touch target');
      await remove.click();
      await page.getByRole('button', { name: 'Create project', exact: true }).click();
      await page.getByRole('main').getByText('LongServerError'.repeat(25), { exact: true }).waitFor();
      assert.equal(posts, 1);
      assert.deepEqual(lastBody.memberIds, [3]);
      await fits(page, `Create Project ${width} errors`);
      await reachable(page.getByRole('button', { name: 'Create project', exact: true }));
      await reachable(page.getByRole('button', { name: 'Cancel', exact: true }));
      await page.screenshot({ path: `${output}/create-project-${width}-${height}.png`, fullPage: true });
      await page.getByRole('button', { name: 'Cancel', exact: true }).click();
      await page.waitForURL('**/projects');
      assert.equal(posts, 1, 'cancel does not submit');
      console.log(`Create Project ${width}x${height}: passed`);
    } finally { await page.close(); }
  }
});

test('Project Overview wraps long content and preserves progress and back navigation', async () => {
  for (const [width, height] of sizes) {
    const page = await pageAt(width, height);
    try {
      await page.goto(`${base}/projects/91`);
      await page.getByRole('heading', { name: project.projectName, exact: true }).waitFor();
      await page.getByText('67%', { exact: true }).waitFor();
      await fits(page, `Overview ${width}`);
      assert.equal(await page.getByRole('region', { name: 'Activity' }).count(), 0);
      const back = page.getByRole('link', { name: 'Back to Projects', exact: true });
      await reachable(back);
      await page.screenshot({ path: `${output}/overview-${width}.png`, fullPage: true });
      await back.click();
      await page.waitForURL('**/projects');
      console.log(`Overview ${width}: passed`);
    } finally { await page.close(); }
  }
});

test('delete confirmation locks background scrolling until cancelled', async () => {
  const page = await pageAt(320, 430);
  try {
    await page.goto(`${base}/projects/91`);
    const options = page.getByRole('button', { name: 'Project options', exact: true });
    await options.click();
    const trigger = page.getByRole('menuitem', { name: /^Delete Project$/i });
    await trigger.press('Enter');

    const dialog = page.getByRole('dialog', { name: 'Delete project?' });
    const cancel = dialog.getByRole('button', { name: 'Cancel', exact: true });
    await reachable(cancel);
    await reachable(dialog.getByRole('button', { name: 'Delete project', exact: true }));

    const backgroundScroll = () => page.evaluate(() => window.scrollY);
    const wheelBackdrop = async () => {
      await page.mouse.move(2, 215);
      await page.mouse.wheel(0, (await backgroundScroll()) > 0 ? -350 : 350);
    };

    assert.ok(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight));
    const lockedPosition = await backgroundScroll();
    await wheelBackdrop();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await backgroundScroll(), lockedPosition, 'background scroll position stays fixed');

    await cancel.click();
    await dialog.waitFor({ state: 'hidden' });
    const unlockedPosition = await backgroundScroll();
    await wheelBackdrop();
    await page.waitForFunction(position => window.scrollY !== position, unlockedPosition);
  } finally { await page.close(); }
});

test('Login labels focus their fields and errors/buttons remain reachable on a short mobile viewport', async () => {
  for (const [width, height] of [...sizes, [390, 430]]) {
    const page = await pageAt(width, height);
    await page.route('**/api/auth/sign-in/email', route => route.fulfill({ status: 401,
      json: { code: 'INVALID_EMAIL_OR_PASSWORD', message: 'LongAuthenticationError'.repeat(20) } }));
    try {
      await page.goto(`${base}/login`);
      await page.locator('label[for="login-email"]').click();
      const email = page.locator('#login-email');
      assert.equal(await email.evaluate(el => el === document.activeElement), true);
      await email.fill('layout@example.test');
      await page.locator('#login-password').fill('synthetic-layout-value');
      await reachable(page.getByRole('button', { name: 'Log in', exact: true }));
      await page.getByRole('button', { name: 'Log in', exact: true }).click();
      await page.getByRole('main').getByRole('alert').waitFor();
      await fits(page, `Login ${width}x${height} error`);
      await reachable(email);
      await reachable(page.getByRole('button', { name: 'Log in', exact: true }));
      await page.screenshot({ path: `${output}/login-${width}-${height}.png`, fullPage: true });
      console.log(`Login ${width}x${height}: passed`);
    } finally { await page.close(); }
  }
});

test('empty/loading/error project states fit and topbar errors do not cover page content', async () => {
  for (const [width, height] of sizes) {
    const page = await pageAt(width, height);
    try {
      await page.route('**/api/projects?*', route => route.fulfill({ json: { success: true, projects: [],
        pagination: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 } } }));
      await page.goto(`${base}/projects`);
      await page.getByText('No projects yet', { exact: true }).waitFor();
      await fits(page, `Projects empty ${width}`);
      let releaseSession;
      const sessionGate = new Promise(resolve => { releaseSession = resolve; });
      await page.route('**/api/me', async route => {
        await sessionGate;
        await route.fulfill({ status: 500,
          json: { success: false, error: { code: 'INTERNAL_ERROR', message: 'Fixture failure' } } });
      });
      await page.reload();
      try {
        await page.getByText('Checking your session...', { exact: true }).waitFor();
        await fits(page, `Projects loading ${width}`);
      } finally { releaseSession(); }
      await page.getByRole('main').getByRole('button', { name: 'Try again', exact: true }).waitFor();
      await fits(page, `Projects error ${width}`);
      const headerError = await page.locator('header').getByRole('alert').boundingBox();
      const main = await page.getByRole('main').boundingBox();
      assert.ok(headerError && main && headerError.y + headerError.height <= main.y + 1, 'topbar error stays above main content');
      await reachable(page.getByRole('main').getByRole('button', { name: 'Try again', exact: true }));
      await page.screenshot({ path: `${output}/projects-error-${width}.png`, fullPage: true });
      console.log(`Project states ${width}: passed`);
    } finally { await page.close(); }
  }
});