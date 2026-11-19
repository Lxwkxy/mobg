import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.COMMENTS_WEB_URL || 'http://localhost:3100';
let browser;
before(async () => { browser = await chromium.launch({ channel: process.env.CI ? undefined : 'chrome', headless: true }); });
after(async () => { await browser?.close(); });

async function setup(width) {
  const page = await browser.newPage({ viewport: { width, height: 850 } });
  const project = { projectId: 91, projectName: 'Team project', myRole: 'Member' };
  const task = { taskId: 92, projectId: 91, projectName: project.projectName,
    taskTitle: "Another member's task", taskDescription: 'Review together', priority: 2,
    status: 'To do', dueDate: '2026-12-01', createdAt: '2026-01-01T09:00:00Z',
    createdById: 1, createdByName: 'Owner', assignees: [{ userId: 1, userName: 'Owner' }] };
  const state = { comments: [], posts: 0, failPost: false, failLoad: false,
    userId: 2, taskTitle: task.taskTitle, onSessionHeld: null, releaseSession: null,
    holdNextPost: false, releasePost: null };
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const headers = { 'Access-Control-Allow-Origin': new URL(base).origin,
      'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Headers': 'content-type' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    let body;
    if (path === '/api/me') {
      if (state.onSessionHeld) {
        const onSessionHeld = state.onSessionHeld;
        state.onSessionHeld = null;
        await new Promise((resolve) => {
          state.releaseSession = resolve;
          onSessionHeld();
        });
      }
      if (state.userId === null) return route.fulfill({ status: 401, headers, json: { success: false } });
      body = { user: { userId: state.userId, userName: 'Member', email: 'member@example.test' } };
    }
    else if (path === '/api/projects/91') body = { project };
    else if (path === '/api/projects/91/tasks/92') body = { task: { ...task, taskTitle: state.taskTitle } };
    else if (path === '/api/projects/91/tasks/92/comments') {
      if (req.method() === 'POST') {
        state.posts++;
        if (state.holdNextPost) {
          state.holdNextPost = false;
          await new Promise((resolve) => { state.releasePost = resolve; });
        }
        await new Promise((resolve) => setTimeout(resolve, 150));
        if (state.failPost) return route.fulfill({ status: 500, headers,
          json: { success: false, error: { code: 'INTERNAL_ERROR', message: 'Please try again.' } } });
        const { commentText } = req.postDataJSON();
        assert.deepEqual(Object.keys(req.postDataJSON()), ['commentText']);
        const comment = { commentId: state.comments.length + 1, commentText, userId: 2,
          userName: 'Member', createdAt: '2026-11-18T09:00:00.000Z' };
        state.comments.push(comment);
        return route.fulfill({ status: 201, headers, json: { success: true, comment } });
      }
      if (state.failLoad) return route.fulfill({ status: 500, headers,
        json: { success: false, error: { code: 'INTERNAL_ERROR', message: 'Load failed' } } });
      body = { comments: state.comments };
    } else return route.fulfill({ status: 404, headers,
      json: { success: false, error: { code: 'NOT_FOUND', message: 'Fixture missing' } } });
    await route.fulfill({ headers, json: { success: true, ...body } });
  });
  return { page, state };
}

async function pauseFocusVerification(page, state) {
  // Let the focus throttle expire before simulating return to the tab.
  await page.waitForTimeout(600);
  state.releaseSession = null;
  const sessionHeld = new Promise((resolve) => { state.onSessionHeld = resolve; });
  await Promise.all([
    page.waitForRequest('**/api/me', { timeout: 5000 }),
    page.evaluate(() => window.dispatchEvent(new Event('focus'))),
  ]);
  await sessionHeld;
}

for (const width of [375, 1440]) {
  test(`unassigned member posts and reloads comments at ${width}px`, async () => {
    const { page, state } = await setup(width);
    try {
      await page.goto(`${base}/projects/91/tasks/92`);
      const section = page.getByRole('region', { name: 'Comments' });
      await section.getByText('No comments yet. Start the conversation.').waitFor();
      const submit = section.getByRole('button', { name: 'Post comment', exact: true });
      const input = section.getByLabel('Add a comment');
      assert.equal(await submit.isDisabled(), true);
      await input.fill('   ');
      assert.equal(await submit.isDisabled(), true);
      const content = 'ตรวจงานแล้ว\n<script>window.commentInjected = true</script>' + 'x'.repeat(120);
      await input.fill(`  ${content}  `);
      await submit.click();
      await section.getByRole('listitem').getByText(content, { exact: true }).waitFor();
      assert.equal(await page.getByRole('region', { name: 'Activity' }).count(), 0);
      assert.equal(state.posts, 1);
      assert.equal(await input.inputValue(), '');
      assert.equal(await page.evaluate(() => window.commentInjected), undefined);
      assert.equal(await section.locator('time').getAttribute('datetime'), '2026-11-18T09:00:00.000Z');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.reload();
      await section.getByRole('listitem').getByText(content, { exact: true }).waitFor();
      assert.equal(await section.locator('li').count(), 1);
    } finally { await page.close(); }
  });
}

test('comment failures preserve draft and support retry without hiding task details', async () => {
  const { page, state } = await setup(375);
  state.failLoad = true;
  try {
    await page.goto(`${base}/projects/91/tasks/92`);
    const section = page.getByRole('region', { name: 'Comments' });
    await section.getByRole('alert').waitFor();
    assert.equal(await page.getByRole('heading', { name: "Another member's task", exact: true }).isVisible(), true);
    state.failLoad = false;
    await section.getByRole('button', { name: 'Try again' }).click();
    const input = section.getByLabel('Add a comment');
    await input.fill('Keep this draft');
    state.failPost = true;
    await section.getByRole('button', { name: 'Post comment', exact: true }).click();
    await section.getByRole('alert').waitFor();
    assert.equal(await input.inputValue(), 'Keep this draft');
    assert.equal(state.comments.length, 0);
    state.failPost = false;
    await section.getByRole('button', { name: 'Post comment', exact: true }).click();
    await section.getByRole('listitem').getByText('Keep this draft', { exact: true }).waitFor();
    assert.equal(state.posts, 2);
    assert.equal(state.comments.length, 1);
  } finally { await page.close(); }
});

test('returning to the tab keeps the draft visible and refreshes task data for the same account', async () => {
  const { page, state } = await setup(375);
  try {
    await page.goto(`${base}/projects/91/tasks/92`);
    const section = page.getByRole('region', { name: 'Comments' });
    const input = section.getByLabel('Add a comment');
    await input.fill('Draft survives switching tabs');

    state.taskTitle = 'Task title updated in another tab';
    await pauseFocusVerification(page, state);
    assert.equal(await input.isVisible(), true);
    assert.equal(await input.evaluate((element) => element === document.activeElement), true);
    assert.equal(await input.inputValue(), 'Draft survives switching tabs');
    state.releaseSession();
    await page.getByRole('heading', { name: state.taskTitle, exact: true }).waitFor();
    assert.equal(await input.evaluate((element) => element === document.activeElement), true);
    assert.equal(await input.inputValue(), 'Draft survives switching tabs');

    state.userId = 3;
    state.taskTitle = 'Task title for the other account';
    await pauseFocusVerification(page, state);
    state.releaseSession();
    await page.getByRole('heading', { name: state.taskTitle, exact: true }).waitFor();
    assert.equal(await input.inputValue(), '');
    assert.equal(state.posts, 0);
  } finally {
    state.releaseSession?.();
    await page.close();
  }
});

test('returning to the tab hides task details when the session has expired', async () => {
  const { page, state } = await setup(1440);
  try {
    await page.goto(`${base}/projects/91/tasks/92`);
    const heading = page.getByRole('heading', { name: state.taskTitle, exact: true });
    await heading.waitFor();
    state.userId = null;
    await pauseFocusVerification(page, state);
    state.releaseSession();
    await page.getByText('You need to log in to view this page.').waitFor();
    assert.equal(await heading.isVisible(), false);
  } finally {
    state.releaseSession?.();
    await page.close();
  }
});

test('a pending post survives focus verification and clears only the saved draft', async () => {
  const { page, state } = await setup(375);
  try {
    await page.goto(`${base}/projects/91/tasks/92`);
    const section = page.getByRole('region', { name: 'Comments' });
    const input = section.getByLabel('Add a comment');
    await input.fill('Saved while returning to the tab');
    state.holdNextPost = true;
    const posted = page.waitForRequest((req) => req.method() === 'POST' && req.url().endsWith('/comments'));
    await section.getByRole('button', { name: 'Post comment', exact: true }).click();
    await posted;
    await pauseFocusVerification(page, state);
    assert.equal(await input.isVisible(), true);
    assert.equal(await input.isDisabled(), true, 'pending submission remains disabled during verification');
    state.releaseSession();
    state.releasePost();
    await section.getByRole('listitem').getByText('Saved while returning to the tab', { exact: true }).waitFor();
    assert.equal(await input.inputValue(), '');
    assert.equal(await section.getByRole('button', { name: 'Post comment', exact: true }).isDisabled(), true);
    assert.equal(state.posts, 1);
    assert.equal(state.comments.length, 1);
  } finally {
    state.releaseSession?.();
    state.releasePost?.();
    await page.close();
  }
});
