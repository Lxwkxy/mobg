import type { BusinessErrorCode, ErrorDetail } from "./contracts/api.js";

// Business error with an HTTP status; server.ts maps it to the API envelope.
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: BusinessErrorCode,
    message: string,
    public readonly details?: ErrorDetail[],
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const unauthenticated = () =>
  new ApiError(401, "UNAUTHENTICATED", "Authentication required. Please log in.");
export const forbidden = (message = "You do not have permission to perform this action") =>
  new ApiError(403, "FORBIDDEN", message);
export const notFound = (message = "Project not found") =>
  new ApiError(404, "NOT_FOUND", message);
