// Queue before pool.connect(): advisory-lock waiters must not consume every
// connection while the lock holder needs another connection for Better Auth/CRUD.
// Database advisory locks still serialize callers from different processes.
let tail: Promise<void> = Promise.resolve();
export function runSeedWork<T>(work: () => Promise<T>): Promise<T> {
  const result = tail.then(work);
  tail = result.then(() => undefined, () => undefined);
  return result;
}
