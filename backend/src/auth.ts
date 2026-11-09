import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { pool } from "./db.js";
import { authURL, getAuthSecret, webOrigin } from "./env.js";
import { sendAuthMail } from "./authMail.js";

// These table/field names match migration 005. Domain users keep their numeric IDs.
export const auth = betterAuth({
  appName: "MobG",
  baseURL: authURL,
  basePath: "/api/auth",
  secret: getAuthSecret(),
  database: pool,
  trustedOrigins: [webOrigin],
  logger: { disabled: true },
  rateLimit: { enabled: true, window: 60, max: 100,
    customRules: { "/sign-up/email": { window: 60, max: 15 },
      "/sign-in/email": { window: 60, max: 30 },
      "/send-verification-email": { window: 60, max: 5 },
      "/request-password-reset": { window: 60, max: 5 } } },
  emailAndPassword: {
    enabled: true,
    disableSignUp: false,
    autoSignIn: false,
    revokeSessionsOnPasswordReset: true,
    resetPasswordTokenExpiresIn: 1800,
    sendResetPassword: async ({ user, url }) => sendAuthMail(user.email, url, "reset"),
  },
  emailVerification: { sendOnSignUp: true, autoSignInAfterVerification: false, expiresIn: 3600,
    sendVerificationEmail: async ({ user, url }) => sendAuthMail(user.email, url, "verify") },
  hooks: { before: createAuthMiddleware(async (ctx) => {
    if (["/sign-up/email", "/sign-in/email", "/send-verification-email", "/request-password-reset", "/verify-email"].includes(ctx.path)) {
      for (const value of [ctx.body?.callbackURL, ctx.body?.redirectTo, ctx.query?.callbackURL]) {
        if (value === undefined) continue;
        let valid = false;
        try {
          const url = new URL(value, webOrigin);
          valid = typeof value === "string" && url.origin === new URL(webOrigin).origin && !url.username && !url.password;
        } catch { /* invalid redirects are rejected without echoing a token-bearing URL */ }
        if (!valid) throw new APIError("FORBIDDEN", { code: "INVALID_CALLBACK_URL", message: "Invalid return address." });
      }
    }
    if (ctx.path !== "/sign-up/email") return;
    const { name, email } = ctx.body ?? {};
    if (typeof name !== "string" || !name.trim() || name.trim().length > 100
      || typeof email !== "string" || email.trim().length > 255) {
      throw new APIError("BAD_REQUEST", { code: "INVALID_REGISTRATION", message: "Enter a name (1–100 characters) and valid email." });
    }
    const normalizedEmail = email.trim().toLowerCase();
    // Preflight before Better Auth opens its transaction: do not acquire a second
    // connection inside user.create hooks, which could exhaust the pool under load.
    const domain = await pool.query("SELECT 1 FROM users WHERE lower(btrim(email)) = $1", [normalizedEmail]);
    return { context: { body: { ...ctx.body, name: name.trim(), email: normalizedEmail },
      domainProfileExists: Boolean(domain.rowCount) } };
  }) },
  databaseHooks: { user: { create: { before: async (user, context) => {
    if ((user as typeof user & { registrationKind?: string }).registrationKind === "public"
      && (context as { domainProfileExists?: boolean } | null)?.domainProfileExists) {
      // Native signup turns this rejection into its normal synthetic duplicate response.
      throw new APIError("FORBIDDEN", { code: "PROFILE_EXISTS", message: "Unable to create this account." });
    }
  } } }, session: { create: { before: async (session) => {
    const result = await pool.query<{ registration_kind: string; email_verified: boolean }>(
      "SELECT registration_kind, email_verified FROM auth_users WHERE id = $1", [session.userId]);
    const user = result.rows[0];
    // Preserve trusted, team-provisioned accounts. Every public registration must verify.
    if (user?.registration_kind === "public" && !user.email_verified) {
      throw new APIError("FORBIDDEN", { code: "EMAIL_NOT_VERIFIED", message: "Please verify your email before logging in." });
    }
  } } } },
  user: {
    modelName: "auth_users",
    additionalFields: { registrationKind: { type: "string", fieldName: "registration_kind",
      defaultValue: "public", input: false, returned: false } },
    fields: { emailVerified: "email_verified", createdAt: "created_at", updatedAt: "updated_at" },
  },
  session: {
    modelName: "auth_sessions",
    expiresIn: 60 * 60 * 24 * 7,
    cookieCache: { enabled: false },
    fields: {
      userId: "user_id", expiresAt: "expires_at", createdAt: "created_at",
      updatedAt: "updated_at", ipAddress: "ip_address", userAgent: "user_agent",
    },
  },
  account: {
    modelName: "auth_accounts",
    fields: {
      userId: "user_id", accountId: "account_id", providerId: "provider_id",
      accessToken: "access_token", refreshToken: "refresh_token", idToken: "id_token",
      accessTokenExpiresAt: "access_token_expires_at",
      refreshTokenExpiresAt: "refresh_token_expires_at",
      createdAt: "created_at", updatedAt: "updated_at",
    },
  },
  verification: {
    modelName: "auth_verifications",
    fields: { expiresAt: "expires_at", createdAt: "created_at", updatedAt: "updated_at" },
  },
});
