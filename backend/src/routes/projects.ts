import { Router, type Request, type Response } from "express";
import type {
  MembersResponse, MessageResponse, ProjectResponse, ProjectsResponse,
} from "../contracts/api.js";
import { ApiError, notFound } from "../errors.js";
import { requireAuth, requireProjectRole } from "../guards.js";
import { countToNumber, mapMember, mapProject } from "../mappers/project.js";
import { CHECK_VIOLATION, FOREIGN_KEY_VIOLATION, pgErrorInfo } from "../pgErrors.js";
import { domainIdToNumber } from "../services/dbHelpers.js";
import {
  createProjectWithMembers, deleteProject, getProjectById, listProjectMembers,
  listProjectsForUser, updateProject, type ProjectChanges,
} from "../services/projectDb.js";
import {
  createProjectSchema, parseRequest, projectDatesAreValid, projectListQuerySchema,
  updateProjectSchema,
} from "../validation.js";

const router = Router();
// Every project route needs a valid session + linked MobG profile.
router.use(requireAuth);

const dateOrderError = () => new ApiError(400, "VALIDATION_ERROR", "dueDate must be later than startDate",
  [{ field: "dueDate", message: "must be later than startDate" }]);

// GET /api/projects?status=&page=&pageSize=  (only projects the user belongs to)
router.get("/", async (req: Request, res: Response<ProjectsResponse>) => {
  const { status, page, pageSize } = parseRequest(projectListQuerySchema, req.query);
  const { items, total_items } = await listProjectsForUser({
    user_id: req.currentUser!.userId, status: status ?? null, page, page_size: pageSize,
  });
  const totalItems = countToNumber(total_items);
  res.json({
    success: true,
    projects: items.map((row) => mapProject(row, row.my_role)),
    pagination: { page, pageSize, totalItems, totalPages: Math.ceil(totalItems / pageSize) },
  });
});

// POST /api/projects  (creator comes from the session, never from the body)
router.post("/", async (req: Request, res: Response<ProjectResponse>) => {
  const body = parseRequest(createProjectSchema, req.body);
  let projectId: number;
  try {
    const created = await createProjectWithMembers({
      project_name: body.projectName,
      project_description: body.projectDescription ?? null,
      start_date: body.startDate,
      due_date: body.dueDate ?? null,
      created_by: req.currentUser!.userId,
      member_ids: body.memberIds ?? [],
    });
    projectId = domainIdToNumber(created.project_id);
  } catch (error) {
    const { code, constraint } = pgErrorInfo(error);
    // Unknown user in memberIds: the transaction already rolled back.
    if (code === FOREIGN_KEY_VIOLATION && constraint === "project_members_user_id_fkey") {
      throw new ApiError(400, "VALIDATION_ERROR", "memberIds contains an unknown user",
        [{ field: "memberIds", message: "contains an unknown user" }]);
    }
    throw error;
  }
  const row = await getProjectById(projectId);
  if (!row) throw new Error("Created project could not be read back");
  res.status(201).json({ success: true, project: mapProject(row, "Owner") });
});

// GET /api/projects/:projectId  (Owner, Member)
router.get("/:projectId", requireProjectRole("Member"), async (req: Request, res: Response<ProjectResponse>) => {
  const { projectId, role } = req.projectAccess!;
  const row = await getProjectById(projectId);
  if (!row) throw notFound();
  res.json({ success: true, project: mapProject(row, role) });
});

// PATCH /api/projects/:projectId  (Owner only)
router.patch("/:projectId", requireProjectRole("Owner"), async (req: Request, res: Response<ProjectResponse>) => {
  const { projectId, role } = req.projectAccess!;
  const body = parseRequest(updateProjectSchema, req.body);
  const existing = await getProjectById(projectId);
  if (!existing) throw notFound();

  // Merge the new value with the stored one before checking date order.
  const startDate = body.startDate ?? existing.start_date;
  const dueDate = body.dueDate !== undefined ? body.dueDate : existing.due_date;
  if (!projectDatesAreValid(startDate, dueDate)) throw dateOrderError();

  const changes: ProjectChanges = {};
  if (body.projectName !== undefined) changes.project_name = body.projectName;
  if (body.projectDescription !== undefined) changes.project_description = body.projectDescription;
  if (body.startDate !== undefined) changes.start_date = body.startDate;
  if (body.dueDate !== undefined) changes.due_date = body.dueDate;

  try {
    if (!(await updateProject(projectId, changes))) throw notFound();
  } catch (error) {
    // Backstop if a concurrent edit slipped past the merge check.
    if (pgErrorInfo(error).code === CHECK_VIOLATION) throw dateOrderError();
    throw error;
  }
  const row = await getProjectById(projectId);
  if (!row) throw notFound();
  res.json({ success: true, project: mapProject(row, role) });
});

// DELETE /api/projects/:projectId  (Owner only; FK cascade removes related rows)
router.delete("/:projectId", requireProjectRole("Owner"), async (req: Request, res: Response<MessageResponse>) => {
  if (!(await deleteProject(req.projectAccess!.projectId))) throw notFound();
  res.json({ success: true, message: "Project deleted" });
});

// GET /api/projects/:projectId/members  (Owner, Member; feeds the assignee dropdown)
router.get("/:projectId/members", requireProjectRole("Member"), async (req: Request, res: Response<MembersResponse>) => {
  const members = await listProjectMembers(req.projectAccess!.projectId);
  res.json({ success: true, members: members.map(mapMember) });
});

export default router;
