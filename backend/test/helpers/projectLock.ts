import { setTimeout as delay } from "node:timers/promises";
import type { PoolClient } from "pg";
import { pool } from "../../src/db.js";

// Holds the project row lock (as a concurrent writer would), starts `start()` so it blocks on that lock,
// waits until PostgreSQL reports it waiting, runs `whileWaiting(gate)` inside the lock transaction, then COMMITs.
// Resolves with start()'s result once the lock is released and the operation has finished (await it once).
//
// Cleanup when anything fails before COMMIT: ROLLBACK first so the lock is freed (if ROLLBACK itself fails the
// connection is destroyed instead of going back to the pool), then let the blocked operation finish (bounded)
// before the original error surfaces, so a failing test reports its cause instead of hanging teardown.
export async function withProjectLockHeld<T>(projectId: number, start: () => Promise<T>,
  whileWaiting: (gate: PoolClient) => Promise<void>): Promise<T> {
  const gate = await pool.connect();
  let committed = false;
  let pending: Promise<T> | undefined;
  try {
    await gate.query("BEGIN");
    await gate.query("SELECT 1 FROM projects WHERE project_id = $1 FOR UPDATE", [projectId]);
    pending = start();
    pending.catch(() => {}); // observed by the caller; avoid an unhandled rejection while locked
    await waitForLockWaiter();
    await whileWaiting(gate);
    await gate.query("COMMIT");
    committed = true;
  } finally {
    let broken = false;
    if (!committed) {
      try { await gate.query("ROLLBACK"); } catch { broken = true; }
    }
    gate.release(broken); // true destroys the connection, which also ends its transaction server-side
    if (!committed && pending) await Promise.race([Promise.allSettled([pending]), delay(10000)]);
  }
  return await pending!;
}

async function waitForLockWaiter(): Promise<void> {
  for (let i = 0; i < 500; i++) {
    const waiting = await pool.query(`SELECT 1 FROM pg_stat_activity WHERE datname = current_database()
      AND wait_event_type = 'Lock' AND query LIKE '%FROM projects%FOR UPDATE%' AND pid <> pg_backend_pid()`);
    if (waiting.rowCount! > 0) return;
    await delay(10);
  }
  throw new Error("The concurrent operation never waited for the project lock");
}
