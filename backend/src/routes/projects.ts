import { Router, type Response } from "express";
import type { MembersResponse, Project, ProjectsResponse } from "../contracts/api.js";
import { parseRequest, projectListQuerySchema, urlIdSchema } from "../validation.js";

const router = Router();
// W1 mock responses: no database lookup or authorization yet.
const mockProjects: Project[] = [{
  projectId: 1, projectName: "MobG Demo Project",
  projectDescription: "Sample project for MobG demonstration",
  startDate: "2026-10-07", dueDate: "2026-11-06",
  createdAt: "2026-10-07T03:15:00.000Z", creatorId: 1, creatorName: "Demo Member",
  myRole: "Owner", derivedStatus: "In progress", progressPercent: 40,
  totalTasks: 10, completedTasks: 4,
}];

router.get("/", (req, res: Response<ProjectsResponse>) => {
  const { status, page, pageSize } = parseRequest(projectListQuerySchema, req.query);
  const filtered = mockProjects.filter((project) => !status || project.derivedStatus === status);
  res.json({
    success: true,
    projects: filtered.slice((page - 1) * pageSize, page * pageSize),
    pagination: { page, pageSize, totalItems: filtered.length, totalPages: Math.ceil(filtered.length / pageSize) },
  });
});
router.get("/:projectId/members", (req, res: Response<MembersResponse>) => {
  const projectId = parseRequest(urlIdSchema, req.params.projectId);
  if (!mockProjects.some((project) => project.projectId === projectId)) {
    res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Project not found" } });
    return;
  }
  res.json({
    success: true,
    members: [{ userId: 1, userName: "Demo Member", email: "demo-member@example.test", role: "Owner", joinDate: "2026-10-07" }],
  });
});
export default router;
