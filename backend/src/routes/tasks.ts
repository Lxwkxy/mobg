import { Router, type Request, type Response } from "express";
import type { MessageResponse, TaskResponse, TasksResponse } from "../contracts/api.js";
import { ApiError, notFound } from "../errors.js";
import { requireAuth, requireProjectRole } from "../guards.js";
import { mapTask, toDbStatus } from "../mappers/task.js";
import { FOREIGN_KEY_VIOLATION, pgErrorInfo } from "../pgErrors.js";
import { domainIdToNumber } from "../services/dbHelpers.js";
import { listProjectMembers } from "../services/projectDb.js";
import {
  createTask, deleteTask, getTaskById, listTasksByProject, updateTask, type TaskChanges,
} from "../services/taskDb.js";
import {
  createTaskSchema, parseRequest, taskListQuerySchema, updateTaskSchema, urlIdSchema,
} from "../validation.js";

// Mounted at /api/projects/:projectId/tasks, so the parent param must be merged.
const router = Router({ mergeParams: true });
router.use(requireAuth);

const taskNotFound = () => notFound("Task not found");
const assigneeError = (ids: number[]) => new ApiError(400, "VALIDATION_ERROR",
  "Assignees must be members of this project",
  ids.map((id) => ({ field: "assigneeIds", message: `User ${id} is not a member of this project` })));

// Every assignee must belong to the project right now (including Done tasks).
async function assertAssigneesAreMembers(projectId: number, assigneeIds: number[]): Promise<void> {
  const members = new Set((await listProjectMembers(projectId)).map((m) => domainIdToNumber(m.user_id)));
  const outsiders = assigneeIds.filter((id) => !members.has(id));
  if (outsiders.length > 0) throw assigneeError(outsiders);
}

// A task is reachable only through the project in the URL; anything else is 404.
async function loadTask(projectId: number, rawTaskId: string) {
  const taskId = parseRequest(urlIdSchema, rawTaskId);
  const row = await getTaskById(projectId, taskId);
  if (!row) throw taskNotFound();
  return { taskId, row };
}

// GET /api/projects/:projectId/tasks?status=  (Owner, Member)
router.get("/", requireProjectRole("Member"), async (req: Request, res: Response<TasksResponse>) => {
  const { projectId } = req.projectAccess!;
  const { status } = parseRequest(taskListQuerySchema, req.query);
  const rows = await listTasksByProject({
    project_id: projectId, status_name: status ? toDbStatus[status] : null,
  });
  res.json({ success: true, tasks: rows.map(mapTask) }); // empty project -> 200 with []
});

// GET /api/projects/:projectId/tasks/:taskId  (Owner, Member)
router.get("/:taskId", requireProjectRole("Member"), async (req: Request, res: Response<TaskResponse>) => {
  const { row } = await loadTask(req.projectAccess!.projectId, req.params.taskId as string);
  res.json({ success: true, task: mapTask(row) });
});

// POST /api/projects/:projectId/tasks  (Owner, Member; creator comes from the session)
router.post("/", requireProjectRole("Member"), async (req: Request, res: Response<TaskResponse>) => {
  const { projectId } = req.projectAccess!;
  const body = parseRequest(createTaskSchema, req.body); // strict: rejects createdBy/status/unknown keys
  await assertAssigneesAreMembers(projectId, body.assigneeIds);
  let taskId: number;
  try {
    const created = await createTask({
      project_id: projectId,
      task_title: body.taskTitle,
      task_description: body.taskDescription ?? null,
      priority: body.priority,
      due_date: body.dueDate,
      created_by: req.currentUser!.userId,
      assignee_ids: body.assigneeIds,
    });
    taskId = domainIdToNumber(created.task_id);
  } catch (error) {
    // A user deleted between the membership check and the insert; the transaction rolled back.
    if (pgErrorInfo(error).code === FOREIGN_KEY_VIOLATION) throw assigneeError(body.assigneeIds);
    throw error;
  }
  const row = await getTaskById(projectId, taskId);
  if (!row) throw new Error("Created task could not be read back");
  res.status(201).json({ success: true, task: mapTask(row) });
});

// PATCH /api/projects/:projectId/tasks/:taskId  (Owner, Member; only the sent fields change)
router.patch("/:taskId", requireProjectRole("Member"), async (req: Request, res: Response<TaskResponse>) => {
  const { projectId } = req.projectAccess!;
  const { taskId } = await loadTask(projectId, req.params.taskId as string);
  const body = parseRequest(updateTaskSchema, req.body);
  if (body.assigneeIds !== undefined) await assertAssigneesAreMembers(projectId, body.assigneeIds);

  // Absent key = unchanged. taskDescription: null is a real value that clears the text.
  const changes: TaskChanges = {};
  if (body.taskTitle !== undefined) changes.task_title = body.taskTitle;
  if (body.taskDescription !== undefined) changes.task_description = body.taskDescription;
  if (body.priority !== undefined) changes.priority = body.priority;
  if (body.dueDate !== undefined) changes.due_date = body.dueDate;
  if (body.status !== undefined) changes.status_name = toDbStatus[body.status];
  if (body.assigneeIds !== undefined) changes.assignee_ids = body.assigneeIds;

  try {
    if (!(await updateTask(taskId, changes))) throw taskNotFound();
  } catch (error) {
    if (pgErrorInfo(error).code === FOREIGN_KEY_VIOLATION && body.assigneeIds) throw assigneeError(body.assigneeIds);
    throw error;
  }
  const row = await getTaskById(projectId, taskId);
  if (!row) throw taskNotFound();
  res.json({ success: true, task: mapTask(row) });
});

// DELETE /api/projects/:projectId/tasks/:taskId  (Owner only; FK cascade removes assignees/comments)
router.delete("/:taskId", requireProjectRole("Owner"), async (req: Request, res: Response<MessageResponse>) => {
  const { taskId } = await loadTask(req.projectAccess!.projectId, req.params.taskId as string);
  if (!(await deleteTask(taskId))) throw taskNotFound();
  res.json({ success: true, message: "Task deleted" });
});

export default router;
