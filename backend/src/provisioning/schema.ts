import type { Pool, PoolClient } from "pg";

export const migrationFiles = ["001_initial_schema.sql", "002_require_task_due_date.sql",
  "003_add_project_start_date.sql", "004_add_sessions.sql", "005_add_better_auth.sql"];
const coreColumns: Record<string, string[]> = {
  users: ["user_id", "user_name", "email", "password_hash"],
  projects: ["project_id", "project_name", "project_description", "project_create_date", "due_date", "created_by"],
  project_members: ["project_id", "user_id", "role", "date_join"],
  task_statuses: ["status_id", "status_name"],
  tasks: ["task_id", "task_title", "task_description", "priority", "due_date", "task_create_date", "project_id", "status_id", "created_by"],
  task_assignees: ["task_id", "user_id"], comments: ["comment_id", "comment_text", "comment_created_at", "task_id", "user_id"],
};
const authColumns: Record<string, string[]> = {
  auth_users: ["id", "name", "email", "email_verified", "image", "created_at", "updated_at"],
  auth_sessions: ["id", "user_id", "token", "expires_at", "ip_address", "user_agent", "created_at", "updated_at"],
  auth_accounts: ["id", "user_id", "account_id", "provider_id", "password", "access_token", "refresh_token", "id_token",
    "access_token_expires_at", "refresh_token_expires_at", "scope", "created_at", "updated_at"],
  auth_verifications: ["id", "identifier", "value", "expires_at", "created_at", "updated_at"],
};
type Connection = Pick<Pool | PoolClient, "query">;
export interface MigrationState { file: string; state: "complete" | "missing" | "partial" }

// Structural audit: this repo has no historical migration ledger.
export async function inspectSchema(connection: Connection): Promise<{ database: string; migrations: MigrationState[] }> {
  const database = (await connection.query<{ database: string }>("SELECT current_database() AS database")).rows[0]!.database;
  const columns = (await connection.query<{ table_name: string; column_name: string; is_nullable: string;
    data_type: string; column_default: string | null }>(`
    SELECT table_name, column_name, is_nullable, data_type, column_default FROM information_schema.columns
    WHERE table_schema = 'public'`)).rows;
  const constraints = (await connection.query<{ table_name: string; conname: string; definition: string }>(`
    SELECT c.relname AS table_name, k.conname, pg_get_constraintdef(k.oid) AS definition
    FROM pg_constraint k JOIN pg_class c ON c.oid = k.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public'`)).rows;
  const column = (table: string, name: string) => columns.find((c) => c.table_name === table && c.column_name === name);
  const hasColumns = (expected: Record<string, string[]>) => Object.entries(expected)
    .every(([table, names]) => names.every((name) => column(table, name)));
  const hasConstraint = (table: string, name: string, text?: string) => constraints
    .some((c) => c.table_name === table && c.conname === name && (!text || c.definition.includes(text)));
  const coreComplete = hasColumns(coreColumns)
    && Object.keys(coreColumns).every((table) => hasConstraint(table, `${table}_pkey`))
    && hasConstraint("users", "users_email_key")
    && [["tasks", "tasks_project_id_fkey"], ["task_assignees", "task_assignees_task_id_fkey"],
      ["comments", "comments_task_id_fkey"], ["project_members", "project_members_project_id_fkey"]]
      .every(([table, name]) => hasConstraint(table!, name!, "ON DELETE CASCADE"));
  const start = column("projects", "start_date");
  const link = column("users", "auth_user_id");
  const complete = [coreComplete, column("tasks", "due_date")?.is_nullable === "NO",
    start?.is_nullable === "NO" && Boolean(start.column_default?.includes("Asia/Bangkok"))
      && hasConstraint("projects", "projects_due_date_after_start_date", "due_date > start_date"),
    hasColumns({ sessions: ["session_id", "user_id", "token_hash", "created_at", "expires_at"] })
      && hasConstraint("sessions", "sessions_token_hash_key")
      && hasConstraint("sessions", "sessions_expiry_after_creation")
      && hasConstraint("sessions", "sessions_user_id_fkey", "ON DELETE CASCADE"),
    hasColumns(authColumns) && link?.data_type === "text" && link.is_nullable === "YES"
      && column("users", "password_hash")?.is_nullable === "YES"
      && hasConstraint("users", "users_auth_user_id_key")
      && hasConstraint("users", "users_auth_user_id_fkey", "ON DELETE RESTRICT")
      && Object.keys(authColumns).every((table) => column(table, "id")?.data_type === "text")];
  const exists = [columns.some((c) => c.table_name in coreColumns), false, Boolean(start),
    columns.some((c) => c.table_name === "sessions"), Boolean(link) || columns.some((c) => c.table_name in authColumns)];
  return { database, migrations: migrationFiles.map((file, i) => ({ file,
    state: complete[i] ? "complete" : exists[i] ? "partial" : "missing" })) };
}

export async function requireAccountSchema(connection: Connection): Promise<void> {
  const status = await inspectSchema(connection);
  if (status.migrations.some((migration) => migration.state !== "complete")) {
    throw new Error("Apply/repair migrations 001-005 before provisioning accounts");
  }
}
