import { Router, type Request, type Response } from "express";
import type { SearchResponse } from "../contracts/api.js";
import { requireAuth } from "../guards.js";
import { searchVisibleProjectsAndTasks } from "../services/searchDb.js";
import { parseRequest, searchQuerySchema } from "../validation.js";

const router = Router();

router.get("/", requireAuth, async (req: Request, res: Response<SearchResponse>) => {
  const { q } = parseRequest(searchQuerySchema, req.query);
  const results = await searchVisibleProjectsAndTasks(req.currentUser!.userId, q);
  res.set("Cache-Control", "private, no-store").json({ success: true, ...results });
});

export default router;
