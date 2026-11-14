import { Router, type NextFunction, type Request, type Response } from "express";
import type { MemberResponse, MembersResponse, MessageResponse } from "../contracts/api.js";
import { ApiError, conflict, forbidden, notFound } from "../errors.js";
import { requireAuth, requireProjectRole } from "../guards.js";
import { mapMember } from "../mappers/project.js";
import { toApiStatus } from "../mappers/task.js";
import { FOREIGN_KEY_VIOLATION, UNIQUE_VIOLATION, pgErrorInfo } from "../pgErrors.js";
import { domainIdToNumber } from "../services/dbHelpers.js";
import {
  addProjectMember, listProjectMembers, removeProjectMember, type ActorDenial,
} from "../services/projectDb.js";
import { addMemberSchema, parseRequest, urlIdSchema } from "../validation.js";

// Mounted at /api/projects/:projectId/members, before the /api/projects router, so every member request
// runs exactly one session check and one membership lookup.
const router = Router({ mergeParams: true });
router.use(requireAuth, requireProjectRole("Member"));

// Fast path only: the service rechecks Owner under the project lock inside the write transaction.
function ownerOnly(req: Request, _res: Response, next: NextFunction) {
  if (req.projectAccess!.role !== "Owner") throw forbidden();
  next();
}
const actorDenied = (reason: ActorDenial) => (reason === "ACTOR_NOT_MEMBER" ? notFound() : forbidden());

// GET /api/projects/:projectId/members  (Owner, Member; feeds the assignee dropdown)
router.get("/", async (req: Request, res: Response<MembersResponse>) => {
  const members = await listProjectMembers(req.projectAccess!.projectId);
  res.json({ success: true, members: members.map(mapMember) });
});

// POST /api/projects/:projectId/members  (Owner only)
router.post("/", ownerOnly, async (req: Request, res: Response<MemberResponse>) => {
  const { projectId } = req.projectAccess!;
  const body = parseRequest(addMemberSchema, req.body);
  let result;
  try {
    // The 201 member is built inside the transaction; a mapping failure rolls the insert back.
    result = await addProjectMember(
      { project_id: projectId, actor_user_id: req.currentUser!.userId, user_id: body.userId }, mapMember);
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
  if (!result.added) throw actorDenied(result.reason);
  res.status(201).json({ success: true, member: result.member });
});

// DELETE /api/projects/:projectId/members/:userId  (Owner only)
router.delete("/:userId", ownerOnly, async (req: Request, res: Response<MessageResponse>) => {
  const { projectId } = req.projectAccess!;
  const userId = parseRequest(urlIdSchema, req.params.userId as string);
  const result = await removeProjectMember({ project_id: projectId, actor_user_id: req.currentUser!.userId, user_id: userId });
  if (result.removed) {
    res.json({ success: true, message: "Member removed" });
    return;
  }
  switch (result.reason) {
    case "ACTOR_NOT_MEMBER":
    case "ACTOR_NOT_OWNER":
      throw actorDenied(result.reason);
    case "SOLE_ASSIGNEE":
      throw conflict(
        "Member is the sole assignee of one or more tasks (including completed tasks). Reassign those tasks before removing.",
        result.tasks.map((task) => ({
          reason: "SOLE_ASSIGNEE" as const,
          taskId: domainIdToNumber(task.task_id),
          taskTitle: task.task_title,
          status: toApiStatus[task.status_name],
        })),
      );
    case "NOT_MEMBER":
      throw notFound("Member not found in this project");
    case "LAST_OWNER":
      throw conflict("The last Owner cannot be removed from the project.", [{ reason: "LAST_OWNER" }]);
  }
});

export default router;
