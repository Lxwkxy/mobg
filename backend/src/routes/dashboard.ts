import { Router, type Request, type Response } from "express";
import type { DashboardResponse } from "../contracts/api.js";
import { requireAuth } from "../guards.js";
import { mapDashboardSummary } from "../mappers/dashboard.js";
import { mapTask } from "../mappers/task.js";
import { getDashboardSummary } from "../services/dashboardDb.js";
import { listHighPriorityTasks } from "../services/taskDb.js";
import { dashboardQuerySchema, parseRequest } from "../validation.js";

// Mounted at /api/dashboard. Scope: every task in projects where the session user is a current member.
// highPriorityTasks = priority 1, not Done, ordered by due date then task id (the only list Pai's DB layer offers).
const router = Router();

// GET /api/dashboard?limit=5   (limit 1-100; any other query key, such as userId, is rejected with 400)
router.get("/", requireAuth, async (req: Request, res: Response<DashboardResponse>) => {
  const { limit } = parseRequest(dashboardQuerySchema, req.query);
  const userId = req.currentUser!.userId;
  // Two separate reads (not one snapshot); they differ only if data changes between them.
  const [summary, important] = await Promise.all([
    getDashboardSummary(userId),
    listHighPriorityTasks(userId, limit),
  ]);
  res.json({ success: true, summary: mapDashboardSummary(summary), highPriorityTasks: important.map(mapTask) });
});

export default router;
