import { Router } from "express";

const router = Router();
// W1 mock responses: no database lookup or authorization yet.
router.get("/", (_req, res) => {
  res.json({
    success: true,
    projects: [{
      projectId: 1, projectName: "MobG Demo Project",
      projectDescription: "Sample project for MobG demonstration",
      startDate: "2026-10-07", dueDate: "2026-11-06", creatorName: "Demo Member",
      derivedStatus: "In progress", progressPercent: 40, totalTasks: 10, completedTasks: 4,
    }],
  });
});
router.get("/:projectId/members", (_req, res) => {
  res.json({ success: true, members: [{ userId: 1, userName: "Demo Member", role: "Owner" }] });
});
export default router;
