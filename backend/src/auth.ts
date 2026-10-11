import { betterAuth } from "better-auth";
import { pool } from "./db.js";
import { authURL, getAuthSecret, webOrigin } from "./env.js";

// These table/field names match migration 005. Domain users keep their numeric IDs.
export const auth = betterAuth({
  appName: "MobG",
  baseURL: authURL,
  basePath: "/api/auth",
  secret: getAuthSecret(),
  database: pool,
  trustedOrigins: [webOrigin],
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
  },
  user: {
    modelName: "auth_users",
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
