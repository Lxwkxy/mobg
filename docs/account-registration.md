# Account registration

## Behavior

- `/register`: name, email, password and confirmation; success goes to `/verify-email`.
- `/verify-email`: check inbox/resend, success or invalid/expired-link state.
- `/forgot-password`: generic acknowledgement, including for unknown emails.
- `/reset-password`: set/confirm password; missing/invalid/expired links can request a new one.
- Verification lasts one hour; reset lasts 30 minutes, is single-use and revokes existing sessions.
- New public accounts have a MobG profile but no memberships or access to other projects.
- Existing trusted provisioned accounts retain Login and their numeric domain IDs. They are
  not silently marked email-verified. Verification is enforced when creating a session for a
  public account; the server-only registration kind cannot be selected by signup clients.
- Duplicate signup is enumeration-safe and never replaces a password or claims a profile.

## Real email delivery

Registration, verification resend and password reset use the same SMTP provider.
Verify the sender address or domain in your provider's dashboard. In the private
root `.env`, set the provider's actual SMTP settings and restart the backend.

```dotenv
AUTH_MAIL_MODE=smtp
SMTP_HOST=smtp.your-provider.example
SMTP_PORT=587
SMTP_SECURE=false
SMTP_FROM="MobG <no-reply@your-domain.example>"
SMTP_USER=your_smtp_username
SMTP_PASSWORD=your_smtp_password
```

Use port 587 with `SMTP_SECURE=false` for STARTTLS, or port 465 with
`SMTP_SECURE=true` for TLS from the start, according to your provider. MobG
requires TLS in SMTP mode. An authenticated provider needs both credential
values. Use the SMTP token or app password if your provider requires one. For an
unauthenticated relay, leave both credential values empty. If your provider runs
in sandbox mode, approve the test inbox in its dashboard before registering.
See [Nodemailer SMTP settings](https://nodemailer.com/smtp).

Use reachable HTTPS origins in `BETTER_AUTH_URL` (backend), `CORS_ORIGIN` (web),
and `NEXT_PUBLIC_AUTH_URL` (backend address in the web environment) when
deploying. Links containing localhost only open on the same machine running the
app. For a custom sender domain, publish the SPF and DKIM records supplied by
your provider.

To verify delivery, register with an inbox you control, open the verification
link, sign in, then request a password reset and open that link. Check spam and
your provider's delivery log if a message is missing. The backend records SMTP
failures without logging recipients, credentials or action links.

## Mailpit for local development

Follow the [repository setup](../README.md#3-choose-where-account-email-goes).
The default inbox is `http://localhost:8025` and the SMTP endpoint is
`127.0.0.1:1025`. In the root `.env`, set `MAILPIT_SMTP_PORT` to change the SMTP
port for both the app and Compose, or `MAILPIT_HTTP_PORT` to change the inbox port.
Restart the API after changing its settings. Use SMTP for the production API.

## Checks

With PostgreSQL and Mailpit running, `npm run test:db -- registration.test.ts` from backend/
uses its own temporary DB, applies the repository migrations and removes only that DB afterward.
The test server selects Mailpit even if the regular backend is configured for real delivery.
It tests verification, profile/access, reset/session revocation, tampering, callbacks, expiry
and credential-write rollback. Existing seed/provisioning tests remain separate regressions.

Browser checks use real HTTP and SMTP, not mocked accounts. Install the root Playwright dependency with `npm ci` and have Google Chrome
installed. Start web on port 3400 with
`NEXT_PUBLIC_AUTH_URL=http://localhost:5400`, then from backend/ set:

```powershell
$env:ACCOUNT_WEB_URL='http://localhost:3400'
$env:REGISTRATION_BACKEND_PORT='5400'
# PLAYWRIGHT_MODULE may point to an external Playwright installation with Chrome support.
npm run test:db -- registration.test.ts
```

The test starts/stops its own API. It covers Register → verification → Login/Logout → reset →
new-password Login and layouts at 320×740, 390×430, 768×1024 and 1440×900.
Set `ACCOUNT_ARTIFACTS` outside `.next` to retain screenshots across builds.
