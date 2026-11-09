import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync, unlinkSync, rmdirSync, writeSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { writeNewArchive } from "../src/provisioning/backupFiles.js";

test("exclusive backup output preserves an existing file and cleans only its own failed write", () => {
  const directory = mkdtempSync(join(tmpdir(), "mobg-archive-check-"));
  const archive = join(directory, "test.dump");
  try {
    writeNewArchive(archive, fd => { writeSync(fd, "non-sensitive fixture"); });
    assert.throws(() => writeNewArchive(archive, () => { throw new Error("must not run"); }), { code: "EEXIST" });
    assert.equal(readFileSync(archive, "utf8"), "non-sensitive fixture");
    unlinkSync(archive);
    assert.throws(() => writeNewArchive(archive, fd => { writeSync(fd, "partial"); throw new Error("simulated dump failure"); }), /simulated/);
    assert.equal(existsSync(archive), false);
  } finally {
    if (existsSync(archive)) unlinkSync(archive);
    rmdirSync(directory);
  }
});
