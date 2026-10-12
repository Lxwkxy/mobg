import type { NextFunction, Request, RequestHandler, Response } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "../auth.js";
import type { ProjectRole, UserProfile } from "../contracts/api.js";
import { forbidden, notFound, unauthenticated } from "../errors.js";
import { domainIdToNumber } from "../services/dbHelpers.js";
import type { FindDomainUserByAuthId } from "../services/authDb.js";
import type { FindProjectMembership } from "../services/projectDb.js";
import { parseRequest, urlIdSchema } from "../validation.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      currentUser?: UserProfile;
      projectAccess?: { projectId: number; role: ProjectRole };
    }
  }
}

export interface GuardDeps {
  findDomainUserByAuthId: FindDomainUserByAuthId;
  findProjectMembership: FindProjectMembership;
}

export function createGuards({ findDomainUserByAuthId, findProjectMembership }: GuardDeps) {
  // 401: no/expired session. 403: valid session but no linked MobG profile.
  // Express 5 forwards rejected promises to the error handler.
  const requireAuth: RequestHandler = async (req: Request, _res: Response, next: NextFunction) => {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    if (!session) throw unauthenticated();

    // session.user.id is a Better Auth string ID; never cast it to a number.
    const row = await findDomainUserByAuthId(session.user.id);
    if (!row) throw forbidden("No MobG profile is linked to this account");

    req.currentUser = { userId: domainIdToNumber(row.user_id), userName: row.user_name, email: row.email };
    next();
  };

  // Use after requireAuth. Not a member / unknown project -> 404; insufficient role -> 403.
  const requireProjectRole = (minRole: ProjectRole): RequestHandler =>
    async (req: Request, _res: Response, next: NextFunction) => {
      const user = req.currentUser;
      if (!user) throw unauthenticated();

      const projectId = parseRequest(urlIdSchema, req.params.projectId); // 400 on bad ID
      const membership = await findProjectMembership(projectId, user.userId);
      if (!membership) throw notFound();

      const role = membership.role;
      if (role !== "Owner" && role !== "Member") throw forbidden(); // unknown roles grant nothing
      if (minRole === "Owner" && role !== "Owner") throw forbidden();

      req.projectAccess = { projectId, role };
      next();
    };

  return { requireAuth, requireProjectRole };
}
