# W3 Pai → Book / Bar

วันที่ 2026-10-26 • branch `w3-task-db` • base `5f5de61d20c4660b41401ddd10deb2e1b23d22a0`

## ส่วนอ่านพร้อมใช้

`backend/src/services/taskDb.ts` ใช้ shared pool เดิม โดยไม่เปลี่ยน global parser:

```ts
import { listTasksByProject, getTaskById } from "../services/taskDb.js";

// หลัง requireAuth และ requireProjectRole("Member") ผ่านแล้ว
const tasks = await listTasksByProject({ project_id: projectId, status_name: null });
const doing = await listTasksByProject({ project_id: projectId, status_name: "Doing" });
const task = await getTaskById(projectId, taskId); // null เมื่อไม่พบ หรืออยู่คนละโปรเจกต์
```

คืน `TaskRow` ตาม API-CONTRACT §11.3: `task_id`, `task_title`, `task_description`,
`priority`, `due_date`, `task_create_date`, `project_id`, `project_name`, `status_name`,
`is_overdue`, `created_by`, `created_by_name`, `assignees: [{ user_id, user_name }]`.
BIGINT ทั้งนอกและใน assignees เป็น string; due_date เป็น `YYYY-MM-DD`;
task_create_date เป็น `Date`. รายการเรียง due_date แล้ว task_id; assignees เรียงชื่อแล้ว ID.
งานเดิมที่ไม่มีผู้รับผิดชอบอ่านได้เป็น `[]` เพื่อไม่ซ่อนข้อมูลที่ผิดกติกา.
`status_name: null` หมายถึงไม่กรอง; DB รับ `To Do | Doing | Done` เท่านั้น.
API/UI ต้อง map `To do ↔ To Do`, `In progress ↔ Doing`, `Done ↔ Done`.

ก่อนส่งออก API ให้แปลง IDs ด้วย `domainIdToNumber` จาก `dbHelpers.ts`;
timestamp ใช้ `.toISOString()`. ห้าม `Number(...)` โดยไม่ตรวจ safe integer
โดยเฉพาะ ID ใน assignees. Error จาก DB ถูกส่งต่อ ไม่แทนด้วยรายการว่าง/null.

ผลตรวจส่วนอ่าน: รายการว่าง, งานหาย/ผิดโปรเจกต์, join ไม่ซ้ำ, เรียง/กรอง,
หลาย assignees, legacy ไม่มี assignee, BIGINT เกิน safe integer,
overdue เมื่อวาน/วันนี้/พรุ่งนี้/Done ผ่าน direct PostgreSQL tests.
ทดสอบ overdue โดยตั้งวันใน session DB ให้ต่างจากกรุงเทพด้วย.

API งานยังไม่มีใน `server.ts`/`routes`; หน้า project detail มีเฉพาะข้อมูลโปรเจกต์.
ความพร้อมนี้เป็น DB functions ไม่ใช่ผลผ่านการตรวจสิทธิ์ HTTP หรือ CRUD หน้าเว็บ.

## ส่วนบันทึกพร้อมใช้

| Function | Input | Output |
|---|---|---|
| `createTask(input)` | `CreateTaskInput`: project_id, task_title, task_description?, priority, due_date, created_by, assignee_ids | `{ task_id: string }` หลัง COMMIT สำเร็จ |
| `updateTask(taskId, changes)` | ID number + `TaskChanges`: task_title?, task_description?, priority?, due_date?, status_name?, assignee_ids? | true เมื่อพบงาน, false เมื่อไม่พบ |
| `deleteTask(taskId)` | ID number | true เมื่อลบแล้ว, false เมื่อไม่พบ/ลบไปแล้ว |

```ts
import { createTask, updateTask, deleteTask, getTaskById } from "../services/taskDb.js";
import { domainIdToNumber } from "../services/dbHelpers.js";

// body ผ่าน createTaskSchema และ assigneeIds ผ่านการตรวจสมาชิกโปรเจกต์แล้ว
const created = await createTask({
  project_id: projectId,
  task_title: body.taskTitle,
  task_description: body.taskDescription,
  priority: body.priority,
  due_date: body.dueDate,
  created_by: req.currentUser!.userId, // MobG ID ที่ requireAuth resolve มาแล้ว
  assignee_ids: body.assigneeIds,
});
const createdId = domainIdToNumber(created.task_id);
const row = await getTaskById(projectId, createdId); // map TaskRow เป็น public Task แล้วคืน 201

// หลังตรวจ role, path IDs และ getTaskById(projectId, taskId) != null แล้วเท่านั้น
const updated = await updateTask(taskId, { status_name: "Doing" });
await updateTask(taskId, { priority: 1 }); // ช่องอื่นคงเดิม
await updateTask(taskId, { task_description: null }); // ล้าง description
await updateTask(taskId, { assignee_ids: validatedReplacementIds }); // แทนทั้งชุด
const deleted = await deleteTask(taskId); // ต้องเป็น Owner; false → 404
```

- สร้างเริ่ม `To Do`; create/update ค้น status_id จากชื่อ ไม่ยึดเลข.
- ค่าที่ไม่ส่งหรือเป็น `undefined` ไม่แก้; `null` ใช้ล้างได้เฉพาะ task_description.
  การ map PATCH ห้ามเติมค่า default/null ให้ช่องที่ไม่ได้ส่ง.
- ตัวอย่างการ map description ใน PATCH: `{ task_description: body.taskDescription }`
  ไม่ใช้ `body.taskDescription ?? null`. เปลี่ยน `status` ด้วย mapping ด้านบนเฉพาะเมื่อส่งมา.
- UPDATE อนุญาตเฉพาะรายชื่อช่องในโค้ด; ไม่มีช่องย้าย project_id/เปลี่ยน created_by.
  `{}` หรือส่งมาเป็น undefined ทุกช่อง, ID ไม่ปลอดภัย, status/ชื่อช่องผิด → TypeError.
  Book ต้องใช้ runtime validation ก่อน เพื่อแปลง request ผิดเป็น 400.
- การแทน assignees ล็อกแถวงานก่อน แล้วแก้/ลบชุดเดิม/เพิ่มชุดใหม่ใน transaction เดียว.
  การ PATCH เฉพาะ assignees พร้อมกันจึงไม่รวมสองชุดเข้าด้วยกัน.
- ใช้ `withTransaction` เดิม: connection เดียว, COMMIT ก่อนคืนผล,
  ล้มเหลว ROLLBACK แล้วโยน error เดิม, release ใน finally.
- การลบเป็น hard delete; FK ลบ task_assignees และ comments พร้อมงาน.
  ไม่เพิ่ม activity table; ประวัติยังเป็น task creation/comments ตามข้อตกลงเดิม.
- `getProjectById`/`listProjectsForUser` เดิมคำนวณสรุปจาก tasks ทุกครั้ง ไม่ต้องแก้ implementation.
  frontend ต้องโหลดรายละเอียด/รายการโปรเจกต์ใหม่หลังสร้าง เปลี่ยนสถานะ และลบ.

## สิ่งที่ Book ต้องตรวจก่อนเรียก

1. ใช้ `requireAuth`: อ่าน Better Auth session → resolve users.auth_user_id →
   req.currentUser.userId ที่เป็น MobG positive safe integer. ไม่รับ created_by จาก body.
2. Router ใต้ `/api/projects/:projectId/tasks` ใช้ `Router({ mergeParams: true })`.
   ตรวจ `urlIdSchema`, `taskListQuerySchema`, `createTaskSchema`, `updateTaskSchema`
   ผ่าน `parseRequest`. reject unknown fields, title ว่าง/เกิน 200, วันที่ไม่จริง/ไม่ใช่
   YYYY-MM-DD, priority ไม่ใช่ 1/2/3, assigneeIds ว่าง/ซ้ำ/ID ไม่ถูกต้อง.
3. อ่าน/สร้าง/แก้ใช้ `requireProjectRole("Member")` (ยอมรับ Owner ด้วย);
   ลบใช้ `requireProjectRole("Owner")`.
   ไม่มี session → 401; session ไม่ผูก profile → 403;
   nonmember/โปรเจกต์หาย → 404; Member พยายามลบ → 403.
4. ทุก detail/PATCH/DELETE ตรวจ `getTaskById(projectId, taskId)` ก่อน;
   null → 404 แม้ taskId มีอยู่ในอีกโปรเจกต์. `updateTask`/`deleteTask` รับ taskId
   ตาม contract §11.3 และไม่ได้ตรวจ project หรือ permission ซ้ำ.
5. สร้าง/เปลี่ยน assigneeIds ต้องมีอย่างน้อยหนึ่งคน ไม่ซ้ำ และทุกคนอยู่ใน
   `listProjectMembers(projectId)` ปัจจุบัน รวมงาน Done. คืน 400 พร้อม field assigneeIds
   เมื่อผิด. Schema/DB functions ไม่รับผิดชอบการตรวจ membership/minimum แทน Book.
6. เปลี่ยน UI status เป็น DB status_name และ map ผลกลับ รวม safe-ID conversion ทุกจุด.
7. ไม่กลืน DB errors เป็น not-found. 23503 = FK, 23505 = duplicate, 23514 = CHECK,
   23502 = NOT NULL; map เฉพาะข้อผิดพลาดที่ทราบสาเหตุเป็น 400/409 ตาม contract.
   ถ้า status lookup ที่ควรมีหาย → configuration/DB error (500), ไม่ใช่งานไม่พบ.
   ไม่เปิดเผย SQL/ค่าลับใน response. false จาก write valid request → 404.

การตรวจ membership ก่อน write กับการลบสมาชิกเป็นคนละ transaction ในชั้น API;
W4 member removal ต้องทำตามนโยบายพร้อมการประสาน transaction/locking หากทำพร้อมกับ
การมอบหมายงาน. การล็อก task ใน W3 กัน assignee replacement ชนกัน ไม่ได้ยืนยันสิทธิ์
หรือปิด race ระหว่าง membership check กับการลบสมาชิก.

## ความสัมพันธ์และข้อจำกัดที่ตรวจแล้ว

ตรวจทั้ง migration 001–005 และ catalog ใน `mobg_db` แบบอ่านอย่างเดียว.

| คอลัมน์ FK | อ้างถึง | เมื่อแถวปลายทางถูกลบ |
|---|---|---|
| tasks.project_id | projects.project_id | CASCADE งาน |
| tasks.status_id | task_statuses.status_id | NO ACTION: ปฏิเสธเมื่อยังมีงานอ้าง |
| tasks.created_by | users.user_id | NO ACTION: ปฏิเสธเมื่อยังมีงานอ้าง |
| task_assignees.task_id | tasks.task_id | CASCADE การมอบหมาย |
| task_assignees.user_id | users.user_id | CASCADE การมอบหมาย |
| comments.task_id | tasks.task_id | CASCADE ความเห็น |
| comments.user_id | users.user_id | NO ACTION: ปฏิเสธเมื่อยังมีความเห็นอ้าง |
| project_members.project_id / user_id | projects / users | CASCADE สมาชิก |

- FK ข้างบน NOT NULL; tasks มีค่าว่างได้เฉพาะ task_description.
  task_title จำกัด 200 ตัวอักษร; priority CHECK 1/2/3; due_date NOT NULL จาก 002.
  NOT NULL ไม่ป้องกัน title เป็นข้อความว่างหรือช่องว่าง ต้องใช้ validation ของ Backend.
- PK `(task_id, user_id)` กันการมอบหมายคนเดิมซ้ำ. ไม่มี FK ระหว่าง
  task_assignees กับ project_members และไม่มี minimum-count constraint.
  ทดสอบยืนยันว่า SQL ตรงยังเพิ่ม nonmember หรือล้าง assignees เหลือศูนย์ได้.
- ลบ project cascade งาน/assignees/comments/members; creator users ไม่ถูกลบ.
  ลบ membership อย่างเดียวไม่ลบ task_assignees. ลบ user อาจ cascade assignees
  จนงานไม่มีผู้รับผิดชอบหากไม่มี creator/comment FK ขวาง; ห้ามใช้แทนนโยบายลบสมาชิก.
- W4 removeProjectMember ต้องปฏิเสธ sole assignee ทุกสถานะรวม Done และ last Owner
  ด้วย 409; ถ้ามี assignee อื่นให้ลบ assignment เฉพาะโปรเจกต์พร้อม membership
  ใน transaction เดียว. ยังไม่ทำฟังก์ชัน W4 นี้.

ไม่มี migration ใหม่ เพราะ schema ปัจจุบันรองรับ flow W3 และกติกาที่เหลือ
contract ยกให้ Backend ตรวจไว้แล้ว. ตัวกรอง W3 มีเฉพาะ status ตาม contract ปัจจุบัน;
keyword/priority search และ My Tasks เป็น W4 ไม่เพิ่ม request fields เอง.

## ขั้นตอนตรวจรวมเมื่อ Book / Bar พร้อม

ใช้บัญชี Owner/Member/Outsider ที่ provision ผ่าน Better Auth ตามคู่มือ W2 และฐานทดสอบ
แยกที่ใช้ทิ้งได้; fixtures อัตโนมัติ W3 เป็น domain data ไม่มีรหัสผ่านและไม่ใช่บัญชี Login.
อย่าใช้หรือลบโครงการเดิมในฐานพัฒนาเพื่อทดสอบ.

| ขั้นตอน | ผลที่ต้องได้ | เจ้าของ / สถานะ |
|---|---|---|
| Login Owner/Member แล้ว GET tasks/detail, status filter | 200, DTO ครบ, ไม่ซ้ำ, เรียงตรง DB | Book; รอ task routes |
| ไม่มี/หมดอายุ session, Outsider, taskId ผิดโปรเจกต์ | 401 / 404 / 404 ไม่มีข้อมูลงานรั่ว | Book; ยังไม่ตรวจ HTTP |
| Member POST/PATCH; Member DELETE; Owner DELETE | สร้าง/แก้ได้; 403 เมื่อลบโดย Member; Owner ลบได้ | Book; รอ routes |
| ส่ง title/date/priority/status ผิด, assignees ว่าง/ซ้ำ/nonmember, identity ปลอม | 400 พร้อม field details; DB ไม่เปลี่ยน | Book |
| สร้างจากเว็บ → เปิด → refresh | ค่าและ assignees ตรง DB; เริ่ม To do | Bar + Book + Pai |
| PATCH title/description/date/assignees และเปลี่ยนเฉพาะ Status/Priority | ช่องที่ไม่ส่งคงเดิม; null ล้าง description; สรุปโปรเจกต์อัปเดต | Bar + Book + Pai |
| ยกเลิกลบ แล้วจึงยืนยันลบ | ยกเลิกแล้วข้อมูลอยู่; ยืนยันแล้วงาน/assignees/comments หาย; งานอื่นอยู่ | Bar + Book + Pai |
| Logout/หมด session/สลับบัญชี | API ปฏิเสธตามสิทธิ์; UI ไม่เก็บข้อมูลบัญชีเดิม | Bar + Book |

แนบ request/response ที่ไม่มี cookie/token/password และ task/project IDs ของ fixture
เทียบกับ SQL หลังแต่ละขั้น. ขั้นตอนเหล่านี้ยังไม่ถือว่าผ่านจาก direct DB tests.

## ไฟล์และสถานะส่งต่อ

| ไฟล์ | หน้าที่ |
|---|---|
| backend/src/services/taskDb.ts | Task DB functions ทั้งห้าและ types สำหรับ Book |
| backend/test/taskDb.test.ts | Fixtures แยกแต่ละ test, CRUD/ordering/overdue/rollback/relationship tests |
| backend/test/run-db-tests.ts | สร้าง/ตรวจชื่อ/ลบเฉพาะ DB ทดสอบ; เลือก test file ได้ |
| docs/w3-pai-verification.md | คำสั่ง ผลตรวจจริง และส่วนที่ยังรอ |
| backend/API-CONTRACT.md, backend/README.md, database/schema-mapping.md | ระบุความพร้อม DB โดยไม่อ้างว่า API พร้อม |

W3-Pai-01: DB scope เสร็จ. W3-Pai-02: DB functions เสร็จ แต่การ์ดยังไม่ Done
เพราะ CRUD/permission ผ่าน API และหน้าเว็บยังรอตรวจร่วม.
ไม่เปลี่ยนสถานะการ์ดเป็น Done จากผล DB tests เพียงอย่างเดียว.
