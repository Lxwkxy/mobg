import { Router, type Request, type Response } from "express";
import type { UserResponse } from "../contracts/api.js";
import { requireAuth } from "../guards.js";

const router = Router();

// Returns only { userId, userName, email }; never credentials or tokens.
router.get("/", requireAuth, (req: Request, res: Response<UserResponse>) => {
  res.json({ success: true, user: req.currentUser! });
});

export default router;
