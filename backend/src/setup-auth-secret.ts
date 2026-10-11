import { readFile, appendFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";

const envFile = new URL("../../.env", import.meta.url);
const content = await readFile(envFile, "utf8");
if (/^\s*BETTER_AUTH_SECRET\s*=/m.test(content)) {
  console.log("BETTER_AUTH_SECRET already exists. Check it privately; no value was overwritten or displayed.");
} else {
  await appendFile(envFile, `\nBETTER_AUTH_SECRET=${randomBytes(48).toString("hex")}\n`, "utf8");
  console.log("Auth secret added to the private root .env. No secret was displayed.");
}
