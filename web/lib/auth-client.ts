import { createAuthClient } from "better-auth/react";

// W1 preparation only; login/Topbar still use the existing mock until W2.
// Configure web/.env.local separately from the backend's root .env.
export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_AUTH_URL || "http://localhost:5000",
  basePath: "/api/auth",
  fetchOptions: { credentials: "include" },
});
