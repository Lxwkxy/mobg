import express, { type ErrorRequestHandler } from "express";
import cors from "cors";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./auth.js";
import { pool } from "./db.js";
import { port, webOrigin } from "./env.js";
import projectRoutes from "./routes/projects.js";

const app = express();
app.use(cors({ origin: webOrigin, credentials: true }));

// Express 5 catch-all; Better Auth must receive the body before express.json().
app.all("/api/auth/*splat", toNodeHandler(auth));
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "OK", message: "MobG Backend is running", timestamp: new Date().toISOString() });
});
// W1 sample business routes. Session guards and database-backed routes are W2 work.
app.use("/api/projects", projectRoutes);
app.use("/api", (_req, res) => {
  res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Endpoint not found" } });
});

const handleError: ErrorRequestHandler = (error, _req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }
  if (error?.type === "entity.parse.failed") {
    res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "Request body must be valid JSON" } });
    return;
  }
  console.error(error);
  res.status(500).json({ success: false, error: { code: "INTERNAL_ERROR", message: "Internal server error" } });
};
app.use(handleError);

const server = app.listen(port, () => console.log(`MobG Backend running on port ${port}`));
function shutdown(signal: string) {
  console.log(`${signal} received, shutting down`);
  server.close(async () => {
    try {
      await pool.end();
      process.exit(0);
    } catch (error) {
      console.error("Error closing database pool:", error);
      process.exit(1);
    }
  });
}
process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
