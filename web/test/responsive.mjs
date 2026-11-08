import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

// Layout evidence only: the session response is mocked; task data is the existing UI mock.
// Use a locally installed Playwright module without changing application dependencies.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const output = process.env.RESPONSIVE_OUTPUT || '.next/responsive';
await mkdir(output, { recursive: true });
try {
  for (const [width, height] of [[320, 740], [390, 844], [768, 1024], [1440, 900]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    await page.route('**/api/me', route => route.fulfill({ json: { success: true,
      user: { userId: 1, userName: 'Layout test user', email: 'layout@example.test' } } }));
    await page.goto('http://127.0.0.1:3100/mytasks');
    await page.getByRole('heading', { name: 'My Tasks' }).waitFor();
    await page.getByText('Wireframe', { exact: true }).waitFor();
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    assert.equal(await overflow(), false, `${width}: page must not scroll horizontally`);
    for (const label of ['All', 'High priority', 'In progress', 'To do', 'Done']) {
      const button = page.getByRole('button', { name: new RegExp(`^${label} `) });
      await button.click();
      const box = await button.boundingBox();
      assert.ok(box && box.width >= 44 && box.height >= 44, `${width}: filter touch target ${label}`);
    }
    await page.getByRole('button', { name: /^All / }).click();
    // Stress visible layout with synthetic unbroken names, long descriptions and many rows.
    // DOM fixtures do not count as API/search/detail functionality tests.
    await page.locator('main strong').first().evaluate(el => { el.textContent = 'LongTaskName'.repeat(18); });
    await page.locator('main').evaluate(main => {
      for (const el of main.querySelectorAll('span')) {
        if (el.textContent === 'Web Programming') el.textContent = 'LongProjectName'.repeat(12);
        if (el.textContent === 'Chinatip') el.textContent = 'LongAssigneeName'.repeat(10);
      }
    });
    assert.equal(await overflow(), false, `${width}: long names must wrap without page overflow`);
    const input = page.getByPlaceholder('Search tasks...');
    await input.fill('Layout probe');
    const inputBox = await input.boundingBox();
    assert.ok(inputBox && inputBox.x >= 0 && inputBox.x + inputBox.width <= width, `${width}: search accessible`);
    await page.screenshot({ path: `${output}/mytasks-${width}.png`, fullPage: true });
    // Error state from a mocked server failure, not a real HTTP permission check.
    await page.route('**/api/me', route => route.fulfill({ status: 500,
      json: { success: false, error: { code: 'INTERNAL_ERROR', message: 'Test failure' } } }));
    await page.reload();
    await page.getByRole('button', { name: 'Try again', exact: true }).first().waitFor();
    assert.equal(await overflow(), false, `${width}: error state must fit`);
    await page.screenshot({ path: `${output}/mytasks-error-${width}.png`, fullPage: true });
    await page.close();
    console.log(`PASS ${width}x${height}: layout, filters, long names, search field, error state (mock)`);
  }
} finally { await browser.close(); }
