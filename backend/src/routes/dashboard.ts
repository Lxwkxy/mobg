import { Router, type Request, type Response } from "express";
import type { DashboardResponse } from "../contracts/api.js";
import { requireAuth } from "../guards.js";
import { mapDashboardSummary } from "../mappers/dashboard.js";
import { getDashboardSummary } from "../services/dashboardDb.js";
import { dashboardQuerySchema, parseRequest } from "../validation.js";

// Mounted at /api/dashboard. Scope: every task in projects where the session user is a current member.
// The important-task list is intentionally not included yet (waiting for a DB query with priority ordering).
const router = Router();

// GET /api/dashboard  (no query parameters; unknown keys such as userId are rejected with 400)
router.get("/", requireAuth, async (req: Request, res: Response<DashboardResponse>) => {
  parseRequest(dashboardQuerySchema, req.query);
  const summary = await getDashboardSummary(req.currentUser!.userId);
  res.json({ success: true, summary: mapDashboardSummary(summary) });
});

export default router;
