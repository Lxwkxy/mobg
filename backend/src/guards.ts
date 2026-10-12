import { createGuards } from "./middleware/auth.js";
import { findDomainUserByAuthId } from "./services/authDb.js";
import { findProjectMembership } from "./services/projectDb.js";

export const { requireAuth, requireProjectRole } = createGuards({
  findDomainUserByAuthId,
  findProjectMembership,
});
