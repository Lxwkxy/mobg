import { test } from "node:test";
import assert from "node:assert/strict";
import type { Request, Response } from "express";
import { createGuards } from "../src/middleware/auth.js";

// requireAuth is idempotent: nested routers (e.g. /api/projects then /api/projects/:id/tasks) never repeat
// the session lookup for one request.
test("requireAuth looks the session up once per request even when it runs twice", async () => {
  let sessions = 0;
  let profiles = 0;
  const { requireAuth } = createGuards({
    getSession: async () => { sessions++; return { user: { id: "auth-1" } }; },
    findDomainUserByAuthId: async () => { profiles++; return { user_id: "7", user_name: "Guard", email: "g@example.test" } as any; },
    findProjectMembership: async () => null,
  });
  const req = { headers: {} } as Request;
  let nexts = 0;
  const next = () => { nexts++; };
  await requireAuth(req, {} as Response, next);
  await requireAuth(req, {} as Response, next);
  assert.equal(nexts, 2);
  assert.equal(sessions, 1);
  assert.equal(profiles, 1);
  assert.deepEqual(req.currentUser, { userId: 7, userName: "Guard", email: "g@example.test" });
});

test("requireAuth still rejects a request without a session", async () => {
  const { requireAuth } = createGuards({
    getSession: async () => null,
    findDomainUserByAuthId: async () => null,
    findProjectMembership: async () => null,
  });
  await assert.rejects(Promise.resolve(requireAuth({ headers: {} } as Request, {} as Response, () => {})),
    { status: 401 });
});
