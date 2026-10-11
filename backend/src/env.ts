import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

dotenv.config({ path: fileURLToPath(new URL("../../.env", import.meta.url)) });

export const port = Number(process.env.PORT || 5000);
export const webOrigin = process.env.CORS_ORIGIN || "http://localhost:3000";
export const authURL = process.env.BETTER_AUTH_URL || "http://localhost:5000";

export function getAuthSecret(): string {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32 || secret.includes("change_me")) {
    throw new Error("Set BETTER_AUTH_SECRET to a random secret of at least 32 characters in the root .env.");
  }
  return secret;
}
