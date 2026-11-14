# W4 Pai → Book / Bar

วันที่ 2026-11-08 · branch `w4-pai-db` · fixed point `8ae513ee8b464f841edc3d4fdd2fb0d6bbf3d09f`.
อ่านแผนภายนอกและฉบับ `docs/specs/` แล้ว; ใช้คำขอ W4 และคำตอบผู้ใช้ในงานนี้เป็นข้อกำหนดล่าสุด.
Fetched origin แล้ว: main มี W3 DB และ W3 task API ครบ จึงใช้ main เป็นฐาน ไม่ merge branch เพื่อน.
ตรวจ tree ของ `origin/feat/project-member-search` ด้วยแล้ว ยังไม่มี Task Details/Task form/dialog.
`gh` ไม่ได้ติดตั้งใน PATH/ตำแหน่งมาตรฐานที่ตรวจ จึงไม่ได้อ่าน GitHub Issues/PR comments; ไม่อ้างว่าได้ยืนยันกับทีมใหม่.
ไม่มี commit, push, PR, merge, ข้อความถึงทีม หรือการเปลี่ยนสถานะการ์ด.

## ฟังก์ชันที่ Book ใช้ได้

```ts
import { listTasksForAssignee, listHighPriorityTasks } from "../services/taskDb.js";
import { addProjectMember, removeProjectMember, listProjectMembers } from "../services/projectDb.js";
import { getDashboardSummary } from "../services/dashboardDb.js";

// userId = positive safe MobG ID ที่ resolve จาก Better Auth session แล้ว
const mine = await listTasksForAssignee({ user_id: userId, status_name: null });
const doing = await listTasksForAssignee({ user_id: userId, status_name: "Doing" });
const summary = await getDashboardSummary(userId);
const important = await listHighPriorityTasks(userId); // 5 งาน; limit 1–100
const added = await addProjectMember(projectId, selectedUserId);
const removal = await removeProjectMember(projectId, selectedUserId);
const members = await listProjectMembers(projectId);
```

| Public function / type | ผลและกติกา |
|---|---|
| `listTasksForAssignee` / `TaskRow` (`taskDb.ts`) | มีทั้ง assignment และ membership ปัจจุบัน; ใช้ W3 projection เดิม คืน project/creator/status/assignees ครบ ไม่ซ้ำ เรียง due_date/task_id |
| `listHighPriorityTasks` / `TaskRow[]` (`taskDb.ts`) | ทุกงาน High ที่ไม่ Done ในโปรเจกต์ที่เป็นสมาชิก ไม่ต้องได้รับ assignment; เรียงก่อน limit |
| `addProjectMember` / `AddedProjectMemberRow` (`projectDb.ts`) | project_id/user_id เป็น string, role Member, date_join เป็น YYYY-MM-DD; duplicate/FK ส่งต่อ |
| `removeProjectMember` / `RemoveProjectMemberResult` (`projectDb.ts`) | `{removed:true}` หรือ NOT_MEMBER, LAST_OWNER, SOLE_ASSIGNEE; กรณีหลังมี tasks พร้อม task_id/task_title/status_name เรียง task_id |
| `getDashboardSummary` / `DashboardSummaryRow` (`dashboardDb.ts`) | project_count/task_count/todo_count/in_progress_count/done_count/overdue_count/high_priority_count; COUNT เป็น decimal string รวม `"0"` |

หมายเหตุ 2026-11-14 (PR #25): `addProjectMember` และ `removeProjectMember` เปลี่ยนเป็นรับ
`{ project_id, actor_user_id, user_id }` แล้วตรวจสิทธิ์ Owner ของ actor หลังได้ project lock ใน transaction เดียวกับการเขียน
(คืน `ACTOR_NOT_MEMBER` / `ACTOR_NOT_OWNER`); `addProjectMember` รับ `prepare(row)` และคืน `{ added: true, member }`
ที่เตรียมก่อน COMMIT. ดูลายเซ็นปัจจุบันใน backend/API-CONTRACT.md และ docs/w4-verification.md.

TaskRow BIGINT ทั้งนอกและ nested assignees คงเป็น string; assignees เรียงชื่อแล้ว ID.
My Tasks/Dashboard/งานสำคัญรับ membership ที่ role เป็น Owner/Member เท่านั้น; unknown role ไม่ได้สิทธิ์อ่าน.
ใช้ `mapTask` เดิมสำหรับ Task DTO. Counts ให้แปลงหลังตรวจเลขฐานสิบ, safe integer และ >=0;
อย่าใช้ `domainIdToNumber` กับ count 0 เพราะ helper นั้นรับเฉพาะ ID >0.
ไม่เปลี่ยน global pg parser. DB errors ไม่ถูกแทนด้วย `[]`, null หรือศูนย์.

## นิยามที่ใช้จริง

- ผู้ใช้มอบหมายให้เลือก scope Dashboard: เลือกทุกงานในโปรเจกต์ที่เป็นสมาชิกปัจจุบัน สอดคล้องกับ project_count/progress; My Tasks แยกงานที่ได้รับมอบหมาย.
- ผู้ใช้ยืนยัน High = priority 1 และไม่ Done ทั้ง count/list, due_date แล้ว task_id ขึ้น, default 5, limit 1–100.
- ผู้ใช้ยืนยัน My Tasks คง status-only ตาม contract; รับ null/To Do/Doing/Done. ยังไม่เพิ่ม search/priority/project filters.
- overdue เทียบวัน Asia/Bangkok; เมื่อวาน true, วันนี้/พรุ่งนี้ false, Done false.
- สรุปโปรเจกต์ใช้ `getProjectById`/`listProjectsForUser` เดิม: ROUND(100.0 * completed/total), ไม่มีงาน 0; ไม่มีงาน/ทุกงาน To Do → To do, ทุกงาน Done → Done, กรณีอื่น → In progress.
- นี่คือข้อตกลงในงาน W4 นี้ ไม่อ้างการยืนยันใหม่จาก Book/Bar; HTTP shape ของรายการงานสำคัญยังให้ Book ตัดสินร่วมกับ Bar.

## Transaction และ concurrency

ทุก add/remove member และ create/update task ใช้ connection เดียวจาก `withTransaction` และ
`lockProject` (`SELECT ... FOR UPDATE`) ก่อนล็อก task/แก้ relationships. UPDATE อ่าน project_id
ซึ่งแก้ผ่าน public API ไม่ได้ก่อน จากนั้นล็อก project แล้วตรวจ/ล็อก task ซ้ำ; งานที่ถูกลบระหว่างรอคืน false.
สมาชิกโปรเจกต์ใหม่ถูกสร้างใน transaction ของ project เดิม จึงไม่เปิดให้ writer อื่นเห็นก่อน commit.
project UPDATE/DELETE ใช้ row lock ที่ชนกันตาม PostgreSQL; deleteTask ไม่เพิ่ม assignments.

remove ตรวจ NOT_MEMBER → LAST_OWNER → SOLE_ASSIGNEE รวม Done ก่อนลบ assignment เฉพาะโปรเจกต์
และ membership. ทุก rejection ไม่มี partial delete. Shared project lock ทำให้ concurrent removals
ไม่ตัด Owner/assignee คนสุดท้าย; add กับ removal และ assignee writers ใช้ lock เดียวกันจริง.
create/update ตรวจ minimum และ current membership ก่อน commit หลัง INSERT assignments
เพื่อรักษา native FK/duplicate errors. เมื่อผิดกติกาย้อนทั้ง transaction.

เปลี่ยน W3 เฉพาะ shared locking/recheck และ map `InvalidTaskAssigneesError` เป็น 400 ใน routes เดิม.
Regression เคยพิสูจน์ว่าถ้าไม่มี project lock การ PATCH ใส่สมาชิกที่กำลังถูกนำออกจะ commit ได้;
หลังแก้ PATCH รอแล้วปฏิเสธโดยข้อมูลเดิมอยู่ครบ.

ข้อจำกัด: lock เป็น protocol ของ public functions ภายใต้ READ COMMITTED เดิม ไม่ใช่ schema constraint.
SQL ตรง, ลบ user โดย cascade, เปลี่ยน role/move task ด้วย SQL หรือ writer ที่ไม่ทำตาม protocol ยังทำลาย invariant ได้.
ไม่มี migration ใหม่/แก้ฐานพัฒนา; ทุก writer ใหม่ที่แตะสมาชิกหรือ assignees ต้องร่วม lock order นี้.
Lock ระดับโปรเจกต์ทำให้การเขียนในโปรเจกต์เดียวรอกัน เป็น tradeoff เพื่อความถูกต้องของ W4.

## สิ่งที่ Backend ยังต้องรับผิดชอบ

- requireAuth, resolve auth string → MobG userId; ห้ามรับ identity จาก client.
- Owner เท่านั้นเพิ่ม/ลบสมาชิก; guards รับเฉพาะ Owner/Member ตาม contract. DB functions ไม่รับ actor และไม่ใช่ authorization boundary.
- ตรวจ IDs, request body, status mapping, assignee distinct/nonempty/membership ก่อน write เช่นเดิม; DB recheck ปิด race ด้านความสัมพันธ์ ไม่แทน guard.
- map NOT_MEMBER →404; LAST_OWNER/SOLE_ASSIGNEE →409 พร้อม reason/task DTO; duplicate member →409 ALREADY_MEMBER; FK ตาม contract; DB failure → generic 500.
- Added member DB row ไม่มีชื่อ/email: re-read `listProjectMembers` หากต้องคืน `MemberResponse` เต็มตาม API.
- My Tasks/member add-remove/Dashboard HTTP routes ยังไม่มี และไม่ถูกสร้างในงานนี้. W3 task routes เดิมมี HTTP regression จริงเพิ่มแล้ว.
- Authorization ที่ตรวจใน guards ก่อน transaction ยังมีช่วงเวลาระหว่างตรวจสิทธิ์กับ write; งานนี้รับรอง Owner/assignee data invariants ไม่ได้อ้างว่า serialize actor authorization ทั้งระบบ.

## Responsive และ dependency

| การ์ด/หน้า | สิ่งที่ทำและสิ่งที่รอ |
|---|---|
| R-Pai-01 My Tasks | ปรับหน้าเดิม: filter wrap, control สูง >=44px, search/select เต็มพื้นที่บนจอเล็ก, task cards ก่อน xl และตารางบน xl, ชื่อยาว wrap, assignees 2 ชื่อและ +N เปิดอ่านเพิ่มได้ |
| Shared layout | ใช้ Tailwind breakpoint เดิม sm/lg/xl; ก่อน lg ใช้เมนูเปิด/ปิดใน flow หน้า, Escape คืน focus และเลือกหน้าแล้วปิด; ตั้งแต่ lg เป็น sidebar คงที่; topbar/error/profile wrap ไม่ทับเนื้อหา |
| R-Pai-03 (เดิม R-Book-01) | ผู้ใช้ย้าย Responsive ทั้งหมดให้ Pai; ปรับ Login, Sidebar/Topbar, Dashboard, Projects, Create Project และ Overview แล้ว; Settings & Members ยังไม่มีหน้า จึงยังปิดเต็มการ์ดไม่ได้ |
| Project Tasks/Create/Edit Task | ยังไม่มีโครงใน main/branch frontend ที่ตรวจ; รอ Bar ไม่สร้างฟีเจอร์แทน |
| R-Pai-02 Task Details/delete dialogs | ยังไม่มี component พร้อม; รอ Bar. ไม่สร้าง dialog ใหม่ ไม่ถือว่าการ์ดนี้เสร็จจาก checklist |

หน้า My Tasks ยังใช้ mockData; search/project/sort และปุ่มรายละเอียด/เมนูเดิมยังไม่มีการทำงานจริง.
ทดสอบได้เฉพาะ layout, status tab ที่มีอยู่ และ error UI จาก mock session ไม่ใช่ permissions/API integration.
ยังไม่มีผล dialog focus/background scroll/cancel/delete หรือฟอร์ม/error หลายช่อง เพราะ component ยังไม่พร้อม.
ไม่ได้ตรวจ keyboard มือถือจริง; browser viewport tests ไม่แทนการทดสอบบนอุปกรณ์.

## ตรวจรวมเมื่อ Book/Bar พร้อม

ใช้บัญชีทดสอบใน DB แยก: login Owner/Member/Outsider → My Tasks/status → เพิ่ม/ลบสมาชิก →
ลอง NOT_MEMBER/LAST_OWNER/sole assignee Done → co-assignee removal → Dashboard/count/list/progress.
ตรวจ request permissions, stale assignment ที่ไม่มี membership, สลับบัญชี/logout/expired session,
refetch หลัง status/member changes และเทียบข้อมูลกับ DB. จากเว็บลองสร้าง/แก้/เปิดงาน/refresh,
dialog cancel ต้องไม่ส่ง DELETE, confirm ต้องลบจริง; ตรวจ focus trap, คืน focus, background scroll,
ชื่อยาวและ errors ที่ 320/390/768/1440 px. แยก mock layout evidence จาก HTTP/browser จริง.

คำสั่งและผลจริงอยู่ใน [W4 verification](w4-pai-verification.md) และ [R-Pai-03 verification](r-pai-03-verification.md).

สถานะส่งต่อ: W4-Pai-01/W4-Pai-02 code-complete ฝั่ง DB; full suite 58/58 ผ่าน,
backend/web typechecks/build และ web lint ผ่าน. R-Pai-01 เสร็จเฉพาะ layout My Tasks ที่พร้อม;
R-Pai-02 ยังรอ component. ทั้งสองการ์ด W4 ยังต้องตรวจ integration/API/UI กับ Book/Bar ก่อนถือว่า flow รวมเสร็จ.
