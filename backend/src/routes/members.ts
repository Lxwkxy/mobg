import { Router, type Request, type Response } from "express";
import type { MemberResponse, MessageResponse } from "../contracts/api.js";
import { ApiError, conflict, notFound } from "../errors.js";
import { requireAuth, requireProjectRole } from "../guards.js";
import { mapMember } from "../mappers/project.js";
import { toApiStatus } from "../mappers/task.js";
import { FOREIGN_KEY_VIOLATION, UNIQUE_VIOLATION, pgErrorInfo } from "../pgErrors.js";
import { domainIdToNumber } from "../services/dbHelpers.js";
import { addProjectMember, listProjectMembers, removeProjectMember } from "../services/projectDb.js";
import { addMemberSchema, parseRequest, urlIdSchema } from "../validation.js";

// Mounted at /api/projects/:projectId/members (GET list stays in routes/projects.ts).
const router = Router({ mergeParams: true });
router.use(requireAuth);

// POST /api/projects/:projectId/members  (Owner only)
router.post("/", requireProjectRole("Owner"), async (req: Request, res: Response<MemberResponse>) => {
  const { projectId } = req.projectAccess!;
  const body = parseRequest(addMemberSchema, req.body);
  try {
    await addProjectMember(projectId, body.userId);
  } catch (error) {
    const { code, constraint } = pgErrorInfo(error);
    if (code === UNIQUE_VIOLATION && constraint === "project_members_pkey") {
      throw conflict("This user is already a member of the project", [{ reason: "ALREADY_MEMBER" }]);
    }
    if (code === FOREIGN_KEY_VIOLATION && constraint === "project_members_user_id_fkey") {
      throw new ApiError(400, "VALIDATION_ERROR", "userId refers to an unknown user",
        [{ field: "userId", message: "unknown user" }]);
    }
    // Project deleted between the guard and the insert.
    if (code === FOREIGN_KEY_VIOLATION && constraint === "project_members_project_id_fkey") throw notFound();
    throw error;
  }
  // addProjectMember returns no name/email, so read the full member back.
  const member = (await listProjectMembers(projectId))
    .find((row) => domainIdToNumber(row.user_id) === body.userId);
  if (!member) throw new Error("Added member could not be read back");
  res.status(201).json({ success: true, member: mapMember(member) });
});

// DELETE /api/projects/:projectId/members/:userId  (Owner only)
router.delete("/:userId", requireProjectRole("Owner"), async (req: Request, res: Response<MessageResponse>) => {
  const { projectId } = req.projectAccess!;
  const userId = parseRequest(urlIdSchema, req.params.userId as string);
  const result = await removeProjectMember(projectId, userId);
  if (result.removed) {
    res.json({ success: true, message: "Member removed" });
    return;
  }
  if (result.reason === "SOLE_ASSIGNEE") {
    throw conflict(
      "Member is the sole assignee of one or more tasks (including completed tasks). Reassign those tasks before removing.",
      result.tasks.map((task) => ({
        reason: "SOLE_ASSIGNEE" as const,
        taskId: domainIdToNumber(task.task_id),
        taskTitle: task.task_title,
        status: toApiStatus[task.status_name],
      })),
    );
  }
  if (result.reason === "NOT_MEMBER") throw notFound("Member not found in this project");
  throw conflict("The last Owner cannot be removed from the project.", [{ reason: "LAST_OWNER" }]);
});

export default router;
