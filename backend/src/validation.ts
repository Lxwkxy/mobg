import { z } from "zod";
import type {
  AddMemberRequest, CreateCommentRequest, CreateProjectRequest, CreateTaskRequest,
  ErrorDetail, UpdateProjectRequest, UpdateTaskRequest,
} from "./contracts/api.js";

export class RequestValidationError extends Error {
  constructor(public readonly details: ErrorDetail[]) {
    super("Request validation failed");
    this.name = "RequestValidationError";
  }
}
export function parseRequest<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new RequestValidationError(result.error.issues.map((issue) => ({
      field: issue.path.map(String).join(".") || "request",
      message: issue.message,
    })));
  }
  return result.data;
}

export const idSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
// URL IDs/query values must be full decimal strings; no parseInt or broad coercion.
export const urlIdSchema = z.string().regex(/^\d+$/, "Expected a positive decimal integer")
  .transform(Number).pipe(idSchema);
export const statusSchema = z.enum(["To do", "In progress", "Done"]);
export const prioritySchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")
  .refine((value) => {
    const timestamp = Date.parse(value + "T00:00:00.000Z");
    return !value.startsWith("0000") && Number.isFinite(timestamp)
      && new Date(timestamp).toISOString().slice(0, 10) === value;
  }, "Expected a real calendar date");
const descriptionSchema = z.string().nullable();
const memberIdsSchema = z.array(idSchema)
  .refine((ids) => new Set(ids).size === ids.length, "IDs must be distinct");
const assigneeIdsSchema = memberIdsSchema.min(1, "At least one assignee is required");

export const projectListQuerySchema = z.strictObject({
  status: statusSchema.optional(),
  page: urlIdSchema.default(1),
  pageSize: urlIdSchema.pipe(z.number().max(50)).default(10),
});
export const taskListQuerySchema = z.strictObject({ status: statusSchema.optional() });
export const activityQuerySchema = z.strictObject({
  limit: urlIdSchema.pipe(z.number().max(100)).default(20),
});

// W2 must also check this relation against stored values after merging a PATCH.
export function projectDatesAreValid(startDate: string, dueDate: string | null | undefined): boolean {
  return dueDate == null || dueDate > startDate;
}
const projectFields = {
  projectName: z.string().trim().min(1).max(150),
  startDate: dateSchema,
  projectDescription: descriptionSchema.optional(),
  dueDate: dateSchema.nullable().optional(),
};
export const createProjectSchema: z.ZodType<CreateProjectRequest> = z.strictObject({
  ...projectFields,
  memberIds: memberIdsSchema.optional(),
}).refine((body) => projectDatesAreValid(body.startDate, body.dueDate), {
  path: ["dueDate"], message: "dueDate must be later than startDate",
});
export const updateProjectSchema: z.ZodType<UpdateProjectRequest> =
  z.strictObject(projectFields).partial()
    .refine((body) => Object.keys(body).length > 0, "At least one editable field is required")
    .refine((body) => body.startDate === undefined || projectDatesAreValid(body.startDate, body.dueDate), {
      path: ["dueDate"], message: "dueDate must be later than startDate",
    });
const taskFields = {
  taskTitle: z.string().trim().min(1).max(200),
  taskDescription: descriptionSchema.optional(),
  priority: prioritySchema,
  dueDate: dateSchema,
  assigneeIds: assigneeIdsSchema,
};
export const createTaskSchema: z.ZodType<CreateTaskRequest> = z.strictObject(taskFields);
export const updateTaskSchema: z.ZodType<UpdateTaskRequest> = z.strictObject({
  ...taskFields, status: statusSchema,
}).partial().refine((body) => Object.keys(body).length > 0, "At least one editable field is required");
export const addMemberSchema: z.ZodType<AddMemberRequest> = z.strictObject({ userId: idSchema });
export const createCommentSchema: z.ZodType<CreateCommentRequest> = z.strictObject({
  commentText: z.string().trim().min(1),
});
// Shape validation only. Membership, stored dates, Owner permissions and DB constraints
// remain the responsibility of W2/W3 services and guards, before any database write.
