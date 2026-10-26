# W3 Pai verification record

วันที่ 2026-10-26 • branch `w3-task-db` • base main `5f5de61d20c4660b41401ddd10deb2e1b23d22a0`.

## ก่อนเริ่ม

- local main ตรง remote main จาก `git ls-remote --heads origin`; ไม่พบ branch
  w3-task-db ทั้ง local/remote จึงสร้างจาก main. ไม่พบ Task DB implementation เดิม.
- ตรวจ AGENTS.md, implement/ask-matt/tdd/codebase-design/code-review skills,
  แผน `C:\Users\ACER\OneDrive\Documents\ChatGPT\Web Pro + Database Project\MobG_Trello_Tasks_Detailed.md`,
  API-CONTRACT §5–8/10.6/11.3, DTO/validation, schema/migrations และเอกสาร W2 ที่มีจริง.
- ใช้ contract ล่าสุดที่รวมใน main: status filter เท่านั้นใน W3;
  getTaskById รับ projectId + taskId; update/delete รับ taskId หลัง Book ตรวจขอบเขต.
- `gh` CLI ไม่อยู่ใน PATH/ตำแหน่งติดตั้งที่ตรวจ จึงไม่ได้อ่านหรือแก้ GitHub Issues.
  ตรวจ remote refs ด้วย Git ได้; แหล่งสเปกของงานนี้คือแผนที่ผู้ใช้ระบุและ contract ใน main.
- เก็บ untracked skills, skills-lock.json และ web-local-backup ของผู้ใช้ไว้ทั้งหมด.
  ไม่แก้ frontend, API routes, auth, global pg parser หรือข้อมูลบัญชี.

## ฐานข้อมูลและความปลอดภัยของการตรวจ

Docker Desktop เดิมหยุดอยู่ และไม่มี Compose db container ทำงาน.
เปิด Docker Desktop แล้ว `docker compose up -d db` ใช้ volume `mobg_mobg_pgdata` เดิม.
ไม่ได้ลบ volume/ข้อมูล หรือ reinitialize database.

`npm run db:status` ตรวจแบบอ่านอย่างเดียว: `mobg_db`, migrations 001–005 complete.
PostgreSQL จริง: 17.11. Catalog ยืนยัน FK task/project/assignees/comments ตรง migration.
การตรวจข้อมูลพัฒนาแบบ SELECT พบ projects=7, tasks=1,
งานไม่มี assignee=0, assignment ที่ไม่เป็นสมาชิก=0. ไม่แก้ข้อมูลเหล่านี้.

Tests ใช้ runner เดิมที่สร้าง `mobg_w2_test_<pid>_<random>` ใหม่ต่อรอบ;
เพิ่มการตรวจ `current_database()` ให้ตรงชื่อก่อน migration/fixtures.
W3 test ตรวจชื่อซ้ำก่อนเขียน. Runner ลบได้เฉพาะชื่อสุ่มที่ตัวเองสร้างสำเร็จ.
ไม่มี TRUNCATE/DROP/seed ทับฐานพัฒนา. Prefix W2 คงไว้ให้ tests เดิมใช้ร่วมกัน.
Fixtures แต่ละ test สร้าง project/users/tasks ใหม่; รันซ้ำผ่าน runner ได้โดยไม่ชนข้อมูล.
Trigger ที่จงใจทำให้ COMMIT/DELETE ล้มเหลวและการเปลี่ยน lookup status อยู่ใน test DB
เท่านั้น และคืนสภาพใน finally. ตรวจ catalog หลังรันทดสอบชุดย่อยพบไม่เหลือ test DB.

## ขอบเขตการทดสอบ

Public interfaces ที่ผู้ใช้อนุญาต: Task DB functions ทั้งห้า,
getProjectById/listProjectsForUser เดิม และพฤติกรรม constraints/cascade ใน PostgreSQL.
ใช้ DB จริง ไม่ mock pool/query. ทำ read → create → PATCH → delete เป็นช่วง test-first;
แต่ละฟังก์ชันใหม่มีผลแดงจาก export/module ที่ยังไม่พร้อมก่อนเพิ่ม implementation.

| พฤติกรรม | หลักฐาน |
|---|---|
| รายการว่าง, งานหาย/ผิดโปรเจกต์; project/creator/status/assignees ครบ | taskDb.test.ts |
| งานไม่ซ้ำ, due_date/task_id order, assignee name/ID tie-break, status filter ทั้งสาม | taskDb.test.ts |
| Overdue เมื่อวาน To Do/Doing, วันนี้/พรุ่งนี้ไม่ overdue, Done ไม่ overdue | taskDb.test.ts; session DB จงใจใช้วันที่ต่างจาก Bangkok |
| Legacy ไม่มี assignee อ่านเป็น []; BIGINT ใน JSON ไม่ปัดเลข | taskDb.test.ts; ID 9007199254740993 |
| Create/อ่านกลับ, optional description, trusted numeric creator; SQL-like title เก็บเป็นข้อมูล | taskDb.test.ts |
| FK/duplicate/CHECK/NOT NULL failures ย้อน task + assignees; reject Auth string ID | taskDb.test.ts |
| PATCH ทุกช่อง/ช่องเดียว, undefined คงเดิม, null ล้าง description, assignees แทนทั้งชุด | taskDb.test.ts |
| PATCH ล้มเหลวคืนทุกช่อง/assignees เดิม, unknown fields/empty patch ไม่เขียน | taskDb.test.ts |
| 12 concurrent assignee-only updates ไม่ผสมชุดผู้รับผิดชอบ | taskDb.test.ts |
| Delete cascade comments/assignees, false เมื่อหาย; งานอื่น/โปรเจกต์อื่นอยู่ | taskDb.test.ts |
| Project summaries หลัง create/status/delete: 0, 67, 100%; To do/In progress/Done | taskDb.test.ts; ตรวจทั้ง detail และ list functions |
| status ID เปลี่ยนยังค้นจากชื่อ; lookup หายโยน DB error | taskDb.test.ts |
| COMMIT error ไม่คืนความสำเร็จ; downstream delete error คืนงาน/comments/assignees | taskDb.test.ts |
| FK/nullability จริง; DB ยอม nonmember/ศูนย์ assignee; ลบสมาชิกไม่ลบ assignments | taskDb.test.ts และ read-only catalog audit |

## คำสั่งและผล

จาก `backend/`:

```powershell
npm run db:status
npm run typecheck
npm run typecheck:tests
npm run build
npm run test:db -- taskDb.test.ts
npm run test:db
```

จาก root: `git diff --check`.

- Schema preflight: ผ่าน 001–005.
- Focused Task DB suite: **13/13 ผ่าน**.
- `npm run typecheck`: ผ่าน.
- `npm run typecheck:tests`: ผ่าน.
- `npm run build`: ผ่าน.
- Full PostgreSQL suite: **32/32 ผ่าน**, fail=0, skipped=0 (W2 เดิม 19 + W3 ใหม่ 13).
  ฐานรอบสุดท้าย `mobg_w2_test_35848_6b59ac8e`; runner ลบเมื่อจบ.
- `git diff --check`: ผ่าน.
- ตรวจหลัง full suite: `mobg_db` ยังมี projects=7, tasks=1;
  remaining_test_databases=0. Container `mobg-db-1` ยังใช้ `mobg_mobg_pgdata` เดิม.
  ณ เวลาจบการตรวจ HEAD ยังเป็น base เดิม และยังไม่มี commit ใหม่.

## ส่วนที่ยังไม่ถือว่าผ่าน

- Task routes ยังไม่ได้ mount ใน backend; ยังไม่มี task mapper/API CRUD ให้ตรวจ HTTP.
- หน้า project detail ปัจจุบันอ่านรายละเอียด/summary ของโปรเจกต์ แต่ไม่มี Task CRUD.
  taskService เดิมใน mockData ยังเป็น mock. ไม่มีการกล่าวอ้างว่า browser flow ผ่าน.
- ยังไม่ตรวจ task authorization HTTP 401/403/404, nonmember, cross-project URL,
  cookie/session/CORS, create/edit/status/priority/assignee/delete จากเว็บ.
- [Handoff](w3-pai-handoff.md) มีตัวอย่างเรียก, validation/permission checks และ
  checklist ที่ต้องทำร่วมกับ Book/Bar. เมื่อ API พร้อมสามารถใช้ DB functions ได้ทันที.
- W3-Pai-01 DB scope เสร็จ; W3-Pai-02 DB scope เสร็จแต่ทั้งการ์ดยังรอ integration.
  ไม่เปลี่ยนสถานะการ์ดเป็น Done จากผล DB tests เพียงอย่างเดียว.

## Code review: Standards

Reviewer แยกตรวจ diff เทียบ base main และไฟล์ใหม่ทั้งหมด (ไม่ใช้เฉพาะ HEAD
เพราะยังไม่ commit), ไม่รวมไฟล์ untracked เดิมของผู้ใช้.
ผล **0 findings**: ไม่พบ documented-standard violation หรือ code smell ที่มีนัยสำคัญ.
ยืนยัน shared pool, parameterized SQL/whitelist, transaction helper,
BIGINT ใน JSON, การตรวจฐานทดสอบ และการแยก DB/API/UI readiness.
Reviewer อ่านโค้ด/เอกสารเท่านั้น; ผู้ทำ implementation เป็นผู้รัน tests ข้างต้น.

## Code review: Spec

Reviewer อีกคนตรวจแยกจาก Standards เทียบคำสั่งผู้ใช้/แผน/contract §11.3.
ผล **0 findings**: ไม่พบ DB requirement ที่ขาด/ทำผิด หรือ scope creep.
ยืนยัน read contract, PATCH semantics, status lookup, transactions/cascade,
rollback tests และ project summaries. API permission/browser CRUD ยังรอ
ตามที่บันทึกไว้ ไม่ถือเป็นผลผ่านจาก DB tests.

Review totals: Standards **0**, Spec **0** remaining findings.
