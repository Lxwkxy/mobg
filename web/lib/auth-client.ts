
import { createAuthClient } from "better-auth/react";

export const API_BASE_URL = (
  process.env.NEXT_PUBLIC_AUTH_URL || "http://localhost:5000"
).replace(/\/+$/, "");

export const authClient = createAuthClient({
  baseURL: API_BASE_URL,
  basePath: "/api/auth",
  fetchOptions: {
    credentials: "include",
  },
});
