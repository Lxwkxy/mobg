import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.ACCOUNT_WEB_URL || 'http://localhost:3400';
const inbox = process.env.MAILPIT_URL || 'http://127.0.0.1:8025';
const output = process.env.ACCOUNT_ARTIFACTS || '.next/account-screenshots';
await mkdir(output, { recursive: true });
const email = `browser-${randomBytes(6).toString('hex')}@example.test`;
const password = randomBytes(24).toString('hex');
const newPassword = randomBytes(24).toString('hex');
async function linkFromMail(subject) {
  for (let i = 0; i < 30; i++) {
    const list = await (await fetch(`${inbox}/api/v1/messages`)).json();
    const message = list.messages.find(m => m.Subject === subject && m.To.some(to => to.Address === email));
    if (message) {
      const detail = await (await fetch(`${inbox}/api/v1/message/${message.ID}`)).json();
      const link = detail.Text.match(/http[^\s]+/u)?.[0];
      assert.ok(link, 'mail contains an action link');
      return link;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Authentication email was not delivered');
}
async function fits(page) {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'page fits viewport');
}
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(15000);
  for (const [width, height] of [[320, 740], [390, 430], [768, 1024], [1440, 900]]) {
    await page.setViewportSize({ width, height });
    for (const route of ['register', 'forgot-password', 'verify-email', 'reset-password']) {
      await page.goto(`${base}/${route}`);
      await page.locator('main h1').waitFor();
      await fits(page);
      const action = page.locator('main button[type=submit]');
      if (await action.count()) {
        await action.scrollIntoViewIfNeeded();
        const box = await action.boundingBox();
        assert.ok(box && box.height >= 44 && box.y >= 0 && box.y + box.height <= height + 1, 'submit is reachable');
      }
      await page.screenshot({ path: `${output}/${route}-${width}.png`, fullPage: true });
    }
    console.log(`Auth layouts ${width}x${height}: passed`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/reset-password?token=invalid`);
  await page.locator('main:visible').getByLabel('Password', { exact: true }).fill(newPassword);
  await page.locator('main:visible').getByLabel('Confirm password').fill(newPassword);
  await page.getByRole('button', { name: 'Reset password', exact: true }).click();
  await page.locator('main:visible').getByRole('alert').waitFor();
  await page.getByRole('link', { name: 'Request a new link', exact: true }).waitFor();
  await page.goto(`${base}/register`);
  await page.getByRole('heading', { name: 'Create your account' }).waitFor({ timeout: 10000 });
  assert.equal(new URL(page.url()).pathname, '/register');
  const form = page.locator('main:visible');
  await form.getByLabel('Name', { exact: true }).fill('New Mobile User');
  await form.getByLabel('Email address').fill(email);
  await form.getByLabel('Password', { exact: true }).fill(password);
  await form.getByLabel('Confirm password').fill('different-password');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await page.locator('main').getByRole('alert').getByText('Passwords do not match.').waitFor();
  await form.getByLabel('Confirm password').fill(password);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await page.waitForURL('**/verify-email');
  await page.getByRole('link', { name: 'Back to Log in' }).click();
  await page.waitForURL('**/login');
  await form.getByRole('heading', { name: 'Welcome to MobG' }).waitFor();
  await form.getByLabel('Email address').fill(email);
  await form.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await page.locator('main').getByRole('alert').filter({ hasText: /verify your email/i }).waitFor();
  try { await page.goto(await linkFromMail('Verify your MobG email')); }
  catch { throw new Error('Verification link did not open'); }
  await page.getByRole('heading', { name: 'Email verified', exact: true }).waitFor();
  await page.getByRole('link', { name: 'Log in', exact: true }).click();
  await page.waitForURL('**/login');
  await form.getByLabel('Email address').fill(email);
  await form.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await page.waitForURL('**/dashboard');
  await page.getByRole('button', { name: /New Mobile User/ }).click();
  await page.getByRole('button', { name: /Log out/ }).click();
  await page.waitForURL('**/login');
  await page.getByRole('link', { name: 'Forgot password?' }).click();
  await page.waitForURL('**/forgot-password');
  await form.getByLabel('Email address').fill(email);
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await page.locator('main').getByRole('status').filter({ hasText: /If an account exists/ }).waitFor();
  try { await page.goto(await linkFromMail('Reset your MobG password')); }
  catch { throw new Error('Reset link did not open'); }
  await form.getByLabel('Password', { exact: true }).fill(newPassword);
  await form.getByLabel('Confirm password').fill(newPassword);
  await page.getByRole('button', { name: 'Reset password', exact: true }).click();
  await page.locator('main').getByRole('status').filter({ hasText: 'Your password has been reset.' }).waitFor();
  assert.ok(!new URL(page.url()).searchParams.has('token'), 'spent reset token is removed from the URL');
  await page.getByRole('link', { name: 'Back to Log in' }).click();
  await page.waitForURL('**/login');
  await form.getByLabel('Email address').fill(email);
  await form.getByLabel('Password', { exact: true }).fill(newPassword);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await page.waitForURL('**/dashboard');
  console.log('Real browser signup → verification → login/logout → password reset → new-password login: passed');
} finally { await browser.close(); }
