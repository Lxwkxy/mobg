import nodemailer from "nodemailer";
import "./env.js";

// Default SMTP is a local capture inbox. Production must configure its own sender.
if (process.env.NODE_ENV === "production" && (!process.env.SMTP_HOST || !process.env.SMTP_FROM)) {
  throw new Error("Configure SMTP_HOST and SMTP_FROM before enabling production authentication");
}
const transport = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "127.0.0.1",
  port: Number(process.env.SMTP_PORT || 1025),
  secure: process.env.SMTP_SECURE === "true",
  ...(process.env.SMTP_USER ? { auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } } : {}),
  connectionTimeout: 5000, greetingTimeout: 5000, socketTimeout: 10000,
});

export async function sendAuthMail(to: string, url: string, purpose: "verify" | "reset"): Promise<void> {
  const subject = purpose === "verify" ? "Verify your MobG email" : "Reset your MobG password";
  try {
    await transport.sendMail({ from: process.env.SMTP_FROM || "MobG <no-reply@mobg.test>", to, subject,
      text: `${subject}\n\n${url}\n\nIf you did not request this, you can ignore this email.` });
  } catch {
    // SMTP errors may contain addresses, credentials or verification links.
    throw new Error("Authentication email could not be delivered");
  }
}
