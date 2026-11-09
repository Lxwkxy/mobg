import { closeSync, openSync, unlinkSync } from "node:fs";

// Exclusive creation happens before cleanup is armed. An EEXIST/open failure
// must never remove someone else's archive.
export function writeNewArchive(path: string, write: (descriptor: number) => void): void {
  const descriptor = openSync(path, "wx", 0o600);
  let complete = false;
  try { write(descriptor); complete = true; }
  finally {
    closeSync(descriptor);
    if (!complete) unlinkSync(path);
  }
}
