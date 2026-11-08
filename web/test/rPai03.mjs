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
  browser = await chromium.launch({ channel: 'chrome', headless: true });
});
after(async () => { await browser?.close(); });

const project = { projectId: 91, projectName: 'LongProjectName'.repeat(10),
  projectDescription: 'LongDescription'.repeat(40), startDate: '2026-01-01', dueDate: '2026-12-31',
  createdAt: '2026-01-01T00:00:00Z', creatorId: 1, creatorName: 'Layout Owner', myRole: 'Owner',
  derivedStatus: 'In progress', progressPercent: 67, totalTasks: 12, completedTasks: 8 };
const users = Array.from({ length: 20 }, (_, i) => ({ userId: i + 2,
  userName: `Member ${i + 2} ${'LongMemberName'.repeat(7)}`, email: `member${i + 2}@example.test` }));

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
    else if (url.pathname === '/api/projects') body = { projects: [project, { ...project, projectId: 92, totalTasks: 0, completedTasks: 0, progressPercent: 0 }],
      pagination: { page: Number(url.searchParams.get('page') || 1), pageSize: 10, totalItems: 12, totalPages: 2 } };
    else if (url.pathname === '/api/projects/91') body = { project };
    else return route.fulfill({ status: 404, headers, json: { success: false, error: { code: 'NOT_FOUND', message: 'Fixture missing' } } });
    await route.fulfill({ headers, json: { success: true, ...body } });
  });
  return page;
}

async function fits(page, label) {
  const dimensions = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
  assert.ok(dimensions.scroll <= dimensions.width, `${label}: page overflow ${dimensions.scroll} > ${dimensions.width}`);
}
async function reachable(locator) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  const size = locator.page().viewportSize();
  assert.ok(box && box.x >= 0 && box.x + box.width <= size.width + 1, 'control fits viewport horizontally');
  assert.ok(box.y >= 0 && box.y + box.height <= size.height + 1, 'control can scroll fully into view');
}

test('mobile navigation opens, closes with Escape, and closes after selecting a route', async () => {
  for (const [width, height] of sizes) {
    const page = await pageAt(width, height);
    try {
      await page.goto(`${base}/mytasks`);
      await page.getByText('Wireframe', { exact: true }).waitFor();
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
      await page.getByText('Wireframe', { exact: true }).waitFor();
      await fits(page, `Dashboard ${width}`);
      // Dashboard still uses the existing mock service; DOM stress is layout-only.
      await page.locator('main').evaluate(main => {
        for (const el of main.querySelectorAll('strong')) el.textContent = 'LongName'.repeat(22);
        for (const el of main.querySelectorAll('section:first-child > article strong')) el.textContent = '0';
        const article = main.querySelector('section:nth-child(1) > div > article');
        if (article) for (let i = 0; i < 10; i++) article.parentElement.append(article.cloneNode(true));
      });
      await fits(page, `Dashboard ${width} long names`);
      const all = page.getByRole('link', { name: 'View all →', exact: true });
      await reachable(all.first());
      await reachable(all.last());
      const taskLink = page.locator('main a[href="/mytasks"]').last();
      await reachable(taskLink);
      await page.screenshot({ path: `${output}/dashboard-${width}.png`, fullPage: true });
      await taskLink.click();
      await page.waitForURL('**/mytasks');
      console.log(`Dashboard ${width}: passed`);
    } finally { await page.close(); }
  }
});

test('Projects cards, pagination and create/open actions fit with long names and zero progress', async () => {
  for (const [width, height] of sizes) {
    const page = await pageAt(width, height);
    try {
      await page.goto(`${base}/projects`);
      await page.getByRole('heading', { name: project.projectName }).first().waitFor();
      await fits(page, `Projects ${width}`);
      await page.getByText('0%', { exact: true }).waitFor();
      const next = page.getByRole('button', { name: 'Next →', exact: true });
      await reachable(next);
      await next.click();
      await page.getByText('Page 2 of 2', { exact: true }).waitFor();
      await reachable(page.getByRole('button', { name: '← Previous', exact: true }));
      await page.screenshot({ path: `${output}/projects-${width}.png`, fullPage: true });
      await page.getByRole('link', { name: 'View project →', exact: true }).first().click();
      await page.waitForURL('**/projects/91');
      await page.goBack();
      await page.getByRole('button', { name: '+ Create Project', exact: true }).click();
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
      await route.fulfill({ status: 400, json: { success: false, error: { code: 'VALIDATION_ERROR',
        message: 'LongServerError'.repeat(25), details: [
          { field: 'projectName', message: 'LongNameError'.repeat(25) },
          { field: 'memberIds', message: 'LongMembersError'.repeat(25) },
        ] } } });
    });
    try {
      await page.goto(`${base}/projects/create`);
      await page.getByLabel('Project name', { exact: false }).waitFor();
      await fits(page, `Create Project ${width}`);
      await page.getByLabel('Project name', { exact: false }).fill('Layout Project');
      await page.getByLabel('Project description').fill('Description'.repeat(100));
      await page.getByLabel('Project members', { exact: true }).click();
      await page.getByRole('button', { name: new RegExp(`Member 2 `) }).click();
      await page.getByRole('button', { name: new RegExp(`Member 3 `) }).click();
      await page.getByRole('button', { name: 'Close member search results', exact: true }).click({ position: { x: 1, y: 1 } });
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
      const back = page.getByRole('link', { name: '← Back to Projects', exact: true });
      await reachable(back);
      await page.screenshot({ path: `${output}/overview-${width}.png`, fullPage: true });
      await back.click();
      await page.waitForURL('**/projects');
      console.log(`Overview ${width}: passed`);
    } finally { await page.close(); }
  }
});

test('Login labels focus their fields and errors/buttons remain reachable on a short mobile viewport', async () => {
  for (const [width, height] of [...sizes, [390, 430]]) {
    const page = await pageAt(width, height);
    await page.route('**/api/auth/sign-in/email', route => route.fulfill({ status: 401,
      json: { code: 'INVALID_EMAIL_OR_PASSWORD', message: 'LongAuthenticationError'.repeat(20) } }));
    try {
      await page.goto(`${base}/login`);
      await page.getByText('Email address', { exact: true }).click();
      const email = page.getByLabel('Email address', { exact: true });
      assert.equal(await email.evaluate(el => el === document.activeElement), true);
      await email.fill('layout@example.test');
      await page.getByLabel('Password', { exact: true }).fill('synthetic-layout-value');
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
      await page.getByText('No projects found.', { exact: true }).waitFor();
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
