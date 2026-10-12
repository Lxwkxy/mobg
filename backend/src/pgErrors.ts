// Narrow helper for node-postgres errors (SQLSTATE codes).
export function pgErrorInfo(error: unknown): { code?: string; constraint?: string } {
  if (typeof error !== "object" || error === null) return {};
  const { code, constraint } = error as { code?: unknown; constraint?: unknown };
  return {
    code: typeof code === "string" ? code : undefined,
    constraint: typeof constraint === "string" ? constraint : undefined,
  };
}
export const FOREIGN_KEY_VIOLATION = "23503";
export const CHECK_VIOLATION = "23514";
