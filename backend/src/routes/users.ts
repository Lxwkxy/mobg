import { Router, type Response } from "express";
import type { UsersResponse } from "../contracts/api.js";
import { requireAuth } from "../guards.js";
import { mapUser } from "../mappers/project.js";
import { listUsers } from "../services/projectDb.js";

const router = Router();

// Any logged-in user may list users to pick initial project members.
router.get("/", requireAuth, async (_req, res: Response<UsersResponse>) => {
  res.json({ success: true, users: (await listUsers()).map(mapUser) });
});

export default router;
