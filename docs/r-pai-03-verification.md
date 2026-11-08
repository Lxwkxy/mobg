# R-Pai-03 — Responsive หน้าที่พร้อม

วันที่ 2026-11-08 · branch `w4-pai-db` · ผู้ใช้ย้ายงาน Responsive ทั้งหมดให้ Pai;
R-Pai-03 คือ R-Book-01 ใน `docs/specs/MobG_Trello_Tasks_Detailed.md` ฉบับเดิม.
ไม่มี commit/push/PR/merge หรือเปลี่ยนสถานะการ์ด.

## โค้ดที่ทำ

- Login: card/form เลื่อนถึงได้เมื่อจอเตี้ย, error ยาวตัดบรรทัด, input มี label ผูกกับ id และตัวอักษร 16px บนมือถือ.
- Sidebar: ก่อน lg ใช้ inline disclosure เปิด/ปิด, Escape คืน focus, เลือกลิงก์แล้วปิด; ตั้งแต่ lg ใช้ sidebar เดิม. ไม่มี modal จึงไม่ล็อก body scroll.
- Topbar: ชื่อ/profile/search wrap; session error อยู่ใน layout ไม่ลอยทับ main.
- Dashboard: summary 1/sm 2/xl 4 คอลัมน์; panels ซ้อนก่อน xl; ชื่อยาว/metadata/badges wrap และลิงก์เปิดรายการกดได้.
- Projects: toolbar/card/footer/pagination เรียงใหม่ตามพื้นที่; ชื่อยาวไม่ขยายหน้า; pagination/open/create ยังทำงานเดิม.
- Create Project: ฟอร์มแนวตั้งก่อน xl, date input ไม่ล้น, selected members/error ยาว wrap, ปุ่มลบสมาชิกและ save/cancel สูงอย่างน้อย 44px.
- Overview/ProtectedState: ชื่อ/รายละเอียด/error ยาว wrap; back/retry actions เข้าถึงได้.

ใช้ Tailwind defaults เดิม: sm 640, lg 1024, xl 1280. ไม่มีการเพิ่ม endpoint,
ฟีเจอร์ค้นหา/เรียงรายการ หรือแทนข้อมูล mock ของ Dashboard/My Tasks.

## หลักฐานตรวจ

Regression tests ถูกเขียนและพบ failure ก่อนแก้จริง: เมนูมือถือไม่มีปุ่ม,
Dashboard/Projects/Create/Overview ล้นจอด้วยชื่อยาว, Login label ไม่ผูก input,
Topbar error ลอยทับ main. Focused tests ผ่านหลังแก้แต่ละส่วน.

`web/test/rPai03.mjs` มี 7 กลุ่ม รวม 44 viewport scenarios:
เมนู, Dashboard, Projects, Create Project, Overview, Login และ empty/loading/error.
ตรวจ 320×740, 375×812, 768×1024, 1024×768, 1280×900, 1440×900;
Login/Create เพิ่ม 390×430. ตรวจ overflow, controls เข้าถึงได้, focus/Escape,
navigation, pagination, ลบ selected member, submit error/payload และ cancel ไม่ submit.
ทุก API ถูก intercept; ข้อมูลชื่อยาว/error เป็น fixture ไม่มีการเขียน DB จริง.
Dashboard ค่า 0/หลายรายการเป็น DOM fixture สำหรับ layout เท่านั้น.

คำสั่งจาก `web/` (ใช้ Playwright ที่ติดตั้งภายนอก repo ผ่าน `PLAYWRIGHT_MODULE`):

```powershell
npm run typecheck
npm run lint
npm run build
npm run start -- --hostname 127.0.0.1 --port 3100
node --test test/rPai03.mjs
node test/responsive.mjs
```

`RESPONSIVE_OUTPUT` ชี้ออกนอก `.next` เพื่อเก็บ screenshot หลัง build.
ผลสุดท้าย: typecheck/lint/build ผ่าน; production browser suite 7/7 กลุ่ม
(44 viewport scenarios) ผ่านทั้งหมดใน 33.8 วินาที. My Tasks regression เดิมผ่าน
4/4 ขนาดจอ (320/390/768/1440). `git diff --check` ผ่าน.
ตรวจภาพ Dashboard desktop และ Create Project mobile จาก production รวมทั้ง Login
จอเตี้ยจาก focused run แล้ว: ข้อความยาว/error ไม่ล้นหรือทับปุ่ม.
ภาพ production เก็บที่
`C:/Users/ACER/.codex/visualizations/2026/11/08/01a1ba88-8006-7073-9ea9-37c99f4e15d4/r-pai-03/`.
Backend ไม่ได้เปลี่ยนจาก W4 ที่ผ่าน 58/58 จึงไม่ได้รัน DB suite ซ้ำในรอบ R-Pai-03.

## ขอบเขตที่ยังไม่ครบการ์ด

- Settings & Members ยังไม่มี route/component ใน tree ปัจจุบัน: รอ Bar สร้างฟีเจอร์แล้วจึงปรับ responsive.
- ไม่ได้อ้าง browser integration กับ API/auth จริง; W4 endpoints บางส่วนยังไม่พร้อม.
- จอเตี้ยเป็นการจำลอง viewport ไม่ใช่การเปิดคีย์บอร์ดบนมือถือจริง.
- ยังไม่ได้เทียบ Figma ต้นฉบับ; ตรวจภาพ layout desktop/mobile จาก browser เท่านั้น.
- Next.js 16.4.0 ที่มีอยู่แสดง security warning ตอน build; retry แล้ว build ผ่าน. ไม่อัปเกรด dependency ในงาน Responsive นี้.

## Review

- Standards: 0 findings ที่ต้องแก้.
- Spec: 0 implementation defects/scope creep; Settings & Members และหลักฐาน API จริง/Figma/คีย์บอร์ดจริงยัง pending ตามด้านบน.

นับเฉพาะโค้ด: W4-Pai-01/W4-Pai-02 ฝั่ง DB พร้อมปิดตามผลเดิม 58/58;
R-Pai-01 พร้อมเฉพาะ My Tasks, R-Pai-02 รอ Task Details/dialog,
R-Pai-03 พร้อมเฉพาะหน้าที่ระบุ ยังไม่ครบเต็มใบเพราะ Settings & Members.
