import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';

const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || 'playwright'
);

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

    const message = list.messages.find(
      (m) =>
        m.Subject === subject &&
        m.To.some((to) => to.Address === email),
    );

    if (message) {
      const detail = await (
        await fetch(`${inbox}/api/v1/message/${message.ID}`)
      ).json();

      const link = detail.Text.match(/http[^\s]+/u)?.[0];

      assert.ok(link, 'mail contains an action link');

      return link;
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error('Authentication email was not delivered');
}

async function fits(page) {
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    'page fits viewport',
  );
}

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
});

try {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
  });

  page.setDefaultTimeout(15000);

  // --------------------------------------------------
  // 1. Responsive layout tests
  // --------------------------------------------------

  for (const [width, height] of [
    [320, 740],
    [390, 430],
    [768, 1024],
    [1440, 900],
  ]) {
    await page.setViewportSize({ width, height });

    for (const route of [
      'register',
      'forgot-password',
      'verify-email',
      'reset-password',
    ]) {
      await page.goto(`${base}/${route}`);

      await page.locator('main h1').waitFor();

      await fits(page);

      const action = page.locator('main button[type=submit]');

      if (await action.count()) {
        await action.scrollIntoViewIfNeeded();

        const box = await action.boundingBox();

        assert.ok(
          box &&
            box.height >= 44 &&
            box.y >= 0 &&
            box.y + box.height <= height + 1,
          'submit is reachable',
        );
      }

      await page.screenshot({
        path: `${output}/${route}-${width}.png`,
        fullPage: true,
      });
    }

    console.log(`Auth layouts ${width}x${height}: passed`);
  }

  await page.setViewportSize({ width: 390, height: 844 });

  // --------------------------------------------------
  // 2. Invalid reset token
  // --------------------------------------------------

  await page.goto(`${base}/reset-password?token=invalid`);

  await page
    .locator('main:visible')
    .getByLabel('Password', { exact: true })
    .fill(newPassword);

  await page
    .locator('main:visible')
    .getByLabel('Confirm password')
    .fill(newPassword);

  await page
    .getByRole('button', {
      name: 'Reset password',
      exact: true,
    })
    .click();

  await page.locator('main:visible').getByRole('alert').waitFor();

  await page
    .getByRole('link', {
      name: 'Request a new link',
      exact: true,
    })
    .waitFor();

  // --------------------------------------------------
  // 3. Registration
  // --------------------------------------------------

  await page.goto(`${base}/register`);

  await page
    .getByRole('heading', {
      name: 'Create your account',
    })
    .waitFor({ timeout: 10000 });

  assert.equal(new URL(page.url()).pathname, '/register');

  const form = page.locator('main:visible');

  await form
    .getByLabel('Name', { exact: true })
    .fill('New Mobile User');

  await form.getByLabel('Email address').fill(email);

  await form
    .getByLabel('Password', { exact: true })
    .fill(password);

  await form
    .getByLabel('Confirm password')
    .fill('different-password');

  await page
    .getByRole('button', {
      name: 'Create account',
      exact: true,
    })
    .click();

  await page
    .locator('main')
    .getByRole('alert')
    .getByText('Passwords do not match.')
    .waitFor();

  await form
    .getByLabel('Confirm password')
    .fill(password);

  await page
    .getByRole('button', {
      name: 'Create account',
      exact: true,
    })
    .click();

  await page.waitForURL('**/verify-email');

  // --------------------------------------------------
  // 4. Return to Login
  // --------------------------------------------------

  await page
    .getByRole('link', {
      name: 'Back to Log in',
    })
    .click();

  await page.waitForURL('**/login');

  await form
    .getByRole('heading', {
      level: 1,
      name: 'User login',
    })
    .waitFor();

  // --------------------------------------------------
  // 5. Login Email Validation Tests
  // --------------------------------------------------

  const emailInput = form.getByLabel('Email address');

  const passwordInput = form.getByLabel('Password', {
    exact: true,
  });

  const loginButton = page.getByRole('button', {
    name: 'Log in',
    exact: true,
  });

  const emailError = page.locator('#login-email-error');
  const liveRegion = page.locator('[aria-live="polite"]');

  // The live region must exist in the DOM before any invalid submission.
  await liveRegion.waitFor();

  // Test 1: Leave email empty and move focus away.
  await emailInput.fill('');
  await passwordInput.focus();

  await emailError.waitFor();

  assert.equal(
    await emailError.textContent(),
    'Please enter your email.',
    'empty email should show the correct error message',
  );

  assert.equal(
    await emailInput.getAttribute('aria-invalid'),
    'true',
    'empty email should be invalid',
  );

  assert.equal(
    await emailInput.getAttribute('aria-describedby'),
    'login-email-error',
    'empty email should reference its error message',
  );

  console.log('Empty email validation: passed');

  // Test 2: Change from one invalid email to another while email stays focused.
  await emailInput.fill('invalid-email');

  assert.equal(
    await emailInput.evaluate(
      (element) => element === document.activeElement,
    ),
    true,
    'email should remain focused after editing',
  );

  assert.equal(
    await emailError.textContent(),
    'Please enter a valid email address.',
    'invalid email should show the correct error immediately',
  );

  assert.equal(
    await emailInput.getAttribute('aria-invalid'),
    'true',
    'invalid email should have aria-invalid true',
  );

  assert.equal(
    await emailInput.getAttribute('aria-describedby'),
    'login-email-error',
    'invalid email should reference its error message',
  );

  // Change to another invalid value without blurring the email field.
  await emailInput.fill('still-invalid');

  assert.equal(
    await emailInput.evaluate(
      (element) => element === document.activeElement,
    ),
    true,
    'email should remain focused while changing to another invalid value',
  );

  assert.equal(
    await emailError.textContent(),
    'Please enter a valid email address.',
    'error message should remain visible immediately after invalid-to-invalid change',
  );

  assert.equal(
    await emailInput.getAttribute('aria-invalid'),
    'true',
    'aria-invalid should remain true after invalid-to-invalid change',
  );

  assert.equal(
    await emailInput.getAttribute('aria-describedby'),
    'login-email-error',
    'aria-describedby should remain after invalid-to-invalid change',
  );

  console.log('Invalid-to-invalid validation while focused: passed');

  // Test 3: Correct the email and clear all validation feedback.
  await emailInput.fill(email);

  assert.equal(
    await emailError.count(),
    0,
    'email error message should be removed when the email becomes valid',
  );

  assert.equal(
    await emailInput.getAttribute('aria-invalid'),
    'false',
    'aria-invalid should be false when the email becomes valid',
  );

  assert.equal(
    await emailInput.getAttribute('aria-describedby'),
    null,
    'aria-describedby should be removed when the email becomes valid',
  );

  console.log('Valid email clears validation: passed');

  // Test 4: Press Enter twice with the same invalid value.
  // Observe actual DOM updates, not merely the final text content.
  await emailInput.fill('');

  await page.evaluate(() => {
    const region = document.querySelector('[aria-live="polite"]');

    if (!region) {
      throw new Error('Live region is missing from the DOM');
    }

    window.__loginLiveRegionAnnouncementCount = 0;

    window.__loginLiveRegionObserver = new MutationObserver(() => {
      if (
        region.textContent?.trim() === 'Please enter your email.'
      ) {
        window.__loginLiveRegionAnnouncementCount += 1;
      }
    });

    window.__loginLiveRegionObserver.observe(region, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  });

  // First Enter submission.
  await emailInput.press('Enter');

  await page.waitForFunction(() => {
    return window.__loginLiveRegionAnnouncementCount >= 1;
  });

  assert.equal(
    await liveRegion.textContent(),
    'Please enter your email.',
    'first Enter submission should announce the email error',
  );

  console.log('First Enter live-region update: passed');

  // Second Enter submission with the exact same invalid value.
  await emailInput.press('Enter');

  await page.waitForFunction(() => {
    return window.__loginLiveRegionAnnouncementCount >= 2;
  });

  assert.equal(
    await liveRegion.textContent(),
    'Please enter your email.',
    'second Enter submission should announce the same email error again',
  );

  const announcementCount = await page.evaluate(
    () => window.__loginLiveRegionAnnouncementCount,
  );

  assert.equal(
    announcementCount,
    2,
    'live region should have updated twice for two Enter submissions',
  );

  await page.evaluate(() => {
    window.__loginLiveRegionObserver?.disconnect();
    delete window.__loginLiveRegionObserver;
  });

  console.log('Repeated Enter live-region updates: passed');

  // Test 5: Clicking Log in with an invalid email returns focus to email.
  await emailInput.fill('');

  await loginButton.click();

  await page.waitForFunction(() => {
    return document.activeElement?.id === 'login-email';
  });

  assert.equal(
    await emailInput.evaluate(
      (element) => element === document.activeElement,
    ),
    true,
    'clicking Log in with invalid email should return focus to email',
  );

  console.log('Login button restores email focus: passed');

  // --------------------------------------------------
  // 6. Login with unverified email
  // --------------------------------------------------

  await emailInput.fill(email);
  await passwordInput.fill(password);

  await loginButton.click();

  await page
    .locator('main')
    .getByRole('alert')
    .filter({
      hasText: /verify your email/i,
    })
    .waitFor();

  // --------------------------------------------------
  // 7. Verify email
  // --------------------------------------------------

  try {
    await page.goto(
      await linkFromMail('Verify your MobG email'),
    );
  } catch {
    throw new Error('Verification link did not open');
  }

  await page
    .getByRole('heading', {
      name: 'Email verified',
      exact: true,
    })
    .waitFor();

  await page
    .getByRole('link', {
      name: 'Log in',
      exact: true,
    })
    .click();

  await page.waitForURL('**/login');

  // --------------------------------------------------
  // 8. Login after email verification
  // --------------------------------------------------

  await emailInput.fill(email);
  await passwordInput.fill(password);

  await loginButton.click();

  await page.waitForURL('**/dashboard');

  // --------------------------------------------------
  // 9. Logout
  // --------------------------------------------------

  await page
    .getByRole('button', {
      name: /New Mobile User/,
    })
    .click();

  await page
    .getByRole('button', {
      name: /Log out/,
    })
    .click();

  await page.waitForURL('**/login');

  // --------------------------------------------------
  // 10. Request password reset
  // --------------------------------------------------

  await page
    .getByRole('link', {
      name: 'Forgot password?',
    })
    .click();

  await page.waitForURL('**/forgot-password');

  await form.getByLabel('Email address').fill(email);

  await page
    .getByRole('button', {
      name: 'Send reset link',
    })
    .click();

  await page
    .locator('main')
    .getByRole('status')
    .filter({
      hasText: /If an account exists/,
    })
    .waitFor();

  // --------------------------------------------------
  // 11. Reset password
  // --------------------------------------------------

  try {
    await page.goto(
      await linkFromMail('Reset your MobG password'),
    );
  } catch {
    throw new Error('Reset link did not open');
  }

  await form
    .getByLabel('Password', { exact: true })
    .fill(newPassword);

  await form
    .getByLabel('Confirm password')
    .fill(newPassword);

  await page
    .getByRole('button', {
      name: 'Reset password',
      exact: true,
    })
    .click();

  await page
    .locator('main')
    .getByRole('status')
    .filter({
      hasText: 'Your password has been reset.',
    })
    .waitFor();

  assert.ok(
    !new URL(page.url()).searchParams.has('token'),
    'spent reset token is removed from the URL',
  );

  // --------------------------------------------------
  // 12. Login with new password
  // --------------------------------------------------

  await page
    .getByRole('link', {
      name: 'Back to Log in',
    })
    .click();

  await page.waitForURL('**/login');

  await form.getByLabel('Email address').fill(email);

  await form
    .getByLabel('Password', { exact: true })
    .fill(newPassword);

  await page
    .getByRole('button', {
      name: 'Log in',
      exact: true,
    })
    .click();

  await page.waitForURL('**/dashboard');

  console.log(
    'Real browser signup → verification → login/logout → password reset → new-password login: passed',
  );

} finally {
  await browser.close();
}