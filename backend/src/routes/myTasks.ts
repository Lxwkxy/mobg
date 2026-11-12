import { Router, type Request, type Response } from "express";
import type { TasksResponse } from "../contracts/api.js";
import { requireAuth } from "../guards.js";
import { mapTask, toDbStatus } from "../mappers/task.js";
import { listTasksForAssignee } from "../services/taskDb.js";
import { parseRequest, taskListQuerySchema } from "../validation.js";

// Mounted at /api/tasks. Only requireAuth: the identity is the session user, never a query value.
const router = Router();
router.use(requireAuth);

// GET /api/tasks/mine?status=  (assigned to me, still a member of the project)
router.get("/mine", async (req: Request, res: Response<TasksResponse>) => {
  // strictObject: a userId/projectId/q query is rejected with 400, so nobody can read another user's list.
  const { status } = parseRequest(taskListQuerySchema, req.query);
  const rows = await listTasksForAssignee({
    user_id: req.currentUser!.userId,
    status_name: status ? toDbStatus[status] : null,
  });
  res.json({ success: true, tasks: rows.map(mapTask) }); // no tasks -> 200 with []
});

export default router;
