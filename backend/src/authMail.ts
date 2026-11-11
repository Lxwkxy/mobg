import nodemailer from "nodemailer";
import "./env.js";

export const authMailExpiresIn = { verify: 3600, reset: 1800 };

const mode = process.env.AUTH_MAIL_MODE ?? "smtp";
const localCapture = mode === "mailpit";
const production = process.env.NODE_ENV === "production";
const host = localCapture ? "127.0.0.1" : process.env.SMTP_HOST?.trim();
const from = localCapture ? "MobG <no-reply@mobg.test>" : process.env.SMTP_FROM?.trim();
const smtpSecure = process.env.SMTP_SECURE;
const smtpPort = process.env.SMTP_PORT || (smtpSecure === "true" ? 465 : 587);
const port = Number(localCapture ? process.env.MAILPIT_SMTP_PORT || 1025 : smtpPort);
const secure = !localCapture && (smtpSecure === "true" || (smtpSecure === undefined && port === 465));
const user = process.env.SMTP_USER;
const pass = process.env.SMTP_PASSWORD;

function getConfigError(): string | undefined {
  if (mode !== "smtp" && !localCapture) return "Set AUTH_MAIL_MODE to smtp or mailpit.";
  if (localCapture && production) return "Set AUTH_MAIL_MODE=smtp in production.";
  if (!host || !from) return "Set SMTP_HOST and SMTP_FROM to enable account email.";
  if (!Number.isInteger(port) || port < 1 || port > 65535) return "Set a valid SMTP port.";
  if (!localCapture && Boolean(user) !== Boolean(pass)) {
    return "Set SMTP_USER and SMTP_PASSWORD together.";
  }
  if (!localCapture && smtpSecure !== undefined && smtpSecure !== "true" && smtpSecure !== "false") {
    return "Set SMTP_SECURE to true or false.";
  }
}

export const authMailConfigError = getConfigError();
if (production && authMailConfigError) throw new Error(authMailConfigError);

const transport = authMailConfigError ? undefined : nodemailer.createTransport({
  host, port, secure,
  requireTLS: !localCapture && !secure,
  ...(!localCapture && user && pass ? { auth: { user, pass } } : {}),
  connectionTimeout: 5000, greetingTimeout: 5000, socketTimeout: 10000,
});

const mailCopy = {
  verify: {
    subject: "Verify your MobG email",
    description: "Confirm your email address to finish setting up your MobG account.",
    action: "Verify email address",
    unsolicited: "If you did not create a MobG account, you can ignore this email.",
  },
  reset: {
    subject: "Reset your MobG password",
    description: "We received a request to reset your MobG password. Use the link below to choose a new one.",
    action: "Reset password",
    unsolicited: "If you did not request a password reset, you can ignore this email.",
  },
};

export async function sendAuthMail(to: string, url: string, purpose: keyof typeof mailCopy): Promise<void> {
  if (!transport) throw new Error("Account email is unavailable");

  const { subject, description, action, unsolicited } = mailCopy[purpose];
  const minutes = authMailExpiresIn[purpose] / 60;
  const expiry = `This link expires in ${minutes} minutes.`;
  const href = url.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

  try {
    await transport.sendMail({
      from,
      to,
      subject,
      text: `MobG\n\n${subject}\n\n${description}\n\n${action}\n${url}\n\n${expiry}\n\n${unsolicited}`,
      html: `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#f8f7fc;font-family:Arial,sans-serif;color:#1e1b2e">
    <div style="max-width:480px;margin:auto;padding:28px;background:#fff;border:1px solid #e2dcf2;border-radius:12px">
      <p style="margin:0 0 20px;color:#6d28d9;font-size:18px;font-weight:bold">MobG</p>
      <h1 style="margin:0 0 12px;font-size:24px">${subject}</h1>
      <p style="margin:0 0 24px;line-height:1.5">${description}</p>
      <a href="${href}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#6d28d9;color:#fff;font-weight:bold;text-decoration:none">${action}</a>
      <p style="margin:20px 0 0;font-size:14px;color:#6b6680">${expiry}</p>
      <p style="margin:16px 0 0;padding-top:16px;border-top:1px solid #e2dcf2;font-size:14px;line-height:1.5;color:#6b6680">${unsolicited}</p>
    </div>
  </body>
</html>`,
    });
  } catch {
    // Keep public responses neutral even if the provider rejects an individual recipient.
    console.error(`[auth-mail] SMTP delivery failed (${purpose}). Check the SMTP provider logs and settings.`);
  }
}
