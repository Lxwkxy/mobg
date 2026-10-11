import type { PoolClient } from "pg";
import { pool } from "../db.js";

export function assertDomainId(id: number): void {
  if (!Number.isSafeInteger(id) || id <= 0) throw new TypeError("Expected a positive safe MobG ID");
}

export function domainIdToNumber(id: string): number {
  if (!/^[1-9][0-9]*$/.test(id)) throw new TypeError("Invalid stored MobG ID");
  const number = Number(id);
  assertDomainId(number);
  return number;
}

export async function withTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  let broken = false;
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { broken = true; }
    throw error;
  } finally { client.release(broken); }
}
