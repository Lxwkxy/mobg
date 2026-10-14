# ตั้ง AI review ด้วย skill ของ Matt

ไฟล์ที่เตรียมไว้:

- `.github/workflows/matt-review.yml`: เรียก Codex เมื่อเปิด PR หรือเพิ่ม commit
- `.github/codex/matt-review.md`: เรียก `$code-review` พร้อมข้อกำหนดสำหรับ CI
- `.github/codex/prepare-matt-review.mjs`: ตรึง base/head commits, spec และรหัสการ์ด
- `.agents/skills/code-review/SKILL.md`: skill เดิมของ Matt ที่ติดตั้งอยู่ในเครื่อง
- `docs/specs/MobG_Trello_Tasks_Detailed.md`: เอกสาร Trello ของผู้ใช้ ใช้เป็น spec หลัก

ไฟล์ spec ใน repo เป็นสำเนาจาก `MobG_Trello_Tasks_Detailed.md` ใน OneDrive ของผู้ใช้
GitHub Actions อ่านไฟล์บนไดรฟ์ `C:` ของเครื่องพัฒนาไม่ได้ เมื่อแก้แผนต้นฉบับให้ปรับ
สำเนานี้และ commit ด้วย เพื่อให้ทุกคนและ CI ใช้แผนเวอร์ชันเดียวกัน
GitHub Issues เป็นข้อมูลประกอบ หากขัดกับแผน AI ต้องระบุความขัดแย้งให้ทีมตัดสินใจ

Workflow จะเริ่มใช้เมื่อ repository variable `MATT_REVIEW_ENABLED` เป็น `true`
และรันเฉพาะ PR ที่ไม่ใช่ draft จาก OWNER/MEMBER/COLLABORATOR ใน repository เดียวกัน
PR จาก fork จะไม่เรียก API

## 1. เตรียม OpenAI API key

เข้า [OpenAI API Platform](https://platform.openai.com/api-keys) เลือก API project
และสร้าง key สำหรับ automation นี้ บัญชี API ต้องมีสิทธิ์ใช้โมเดลและ billing พร้อมใช้งาน
การใช้ API key คิดการใช้งานตาม API pricing แยกจาก subscription usage ของ ChatGPT
ดู [pricing](https://learn.chatgpt.com/docs/pricing) ก่อนเปิด workflow

เก็บ key ใน GitHub:

1. เปิด repository `Lxwkxy/mobg`
2. ไป **Settings → Secrets and variables → Actions → Secrets**
3. กด **New repository secret**
4. Name: `OPENAI_API_KEY`; Secret: key ที่สร้างไว้
5. กด **Add secret**

ใช้ช่อง GitHub Secret สำหรับ key เท่านั้น ไม่ใส่ key ในไฟล์หรือแชต
Workflow ส่ง key ให้ Codex Action ในขั้นตอนเรียก API เท่านั้น

## 2. ส่ง workflow และ skill ขึ้น GitHub

รันจากโฟลเดอร์ MobG บน branch ใหม่:

```powershell
git switch -c codex/matt-review
git add .github/workflows/matt-review.yml .github/codex docs/matt-review.md docs/specs/MobG_Trello_Tasks_Detailed.md README.md .agents/skills/code-review/SKILL.md AGENTS.md docs/agents
git diff --cached --stat
git commit -m "ci: prepare Matt skill review for pull requests"
git push -u origin codex/matt-review
```

คำสั่งเลือก skill `code-review` และเอกสารที่มันต้องใช้ โดยไม่เพิ่ม skills อื่นหรือ
`web-local-backup` ตรวจรายการ staged files ก่อน commit

เปิด PR เข้า `main` ตรวจไฟล์และ CI เดิม แล้ว merge เมื่อทีมพร้อม
ตอนนี้ Matt review ยังถูกปิดไว้จนกว่าจะตั้ง variable ในขั้นตอนถัดไป

## 3. เปิดใช้งาน

1. ไป **Settings → Secrets and variables → Actions → Variables**
2. กด **New repository variable**
3. Name: `MATT_REVIEW_ENABLED`; Value: `true`
4. กด **Add variable**

ถ้าต้องการหยุดการเรียก API ภายหลัง เปลี่ยน variable นี้เป็น `false`

## 4. ทดสอบกับ PR ใหม่

เปิด PR ของงานจริงจาก branch ใน MobG แล้วระบุรหัสการ์ดใน PR body เช่น:

```text
Trello cards: W2-Pai-01, W2-Pai-02
```

ระบบจะตรวจว่ารหัสมีอยู่ในแผนจริง และให้ Spec sub-agent เทียบกับ Description,
Checklist, เกณฑ์ Done และกติกาส่วนกลางที่เกี่ยวข้อง โดยไม่ถือว่างานของสัปดาห์อื่น
หรือเจ้าของคนอื่นที่อยู่นอกขอบเขต PR เป็นงานที่ขาด

หากมี GitHub Issue ประกอบ เพิ่ม `Spec issue: #หมายเลขissue` หรือ
`Closes #หมายเลขissue` โดยเปลี่ยนหมายเลขให้ตรงกับ issue จริง ไม่จำเป็นต้องสร้าง
issue ซ้ำเพียงเพื่อให้ AI อ่านแผน Trello

เปิด **Actions → Matt skill review** และตรวจ job **Matt review**:

- ขั้นเตรียม prompt ต้องพบ skill, spec, รหัสการ์ด และ base/head commits ที่ตรงกับ PR
- Log ของ Codex ต้องแสดงการอ่าน `SKILL.md` และการเรียก sub-agents สำหรับ Standards/Spec
- Job **Publish Matt review** ต้องแสดงรายงานบน PR พร้อม commit ที่ตรวจ
- รายงานต้องมี `Standards`, `Spec`, summary และ `Execution evidence`

Execution evidence เป็นข้อมูลที่ AI รายงานเอง ต้องเทียบกับ log ในการทดสอบครั้งแรก
ก่อนถือว่า workflow เรียก skill และสอง sub-agents ได้ครบ

หากสำเนา spec หายหรือรหัสการ์ดผิด ขั้นเตรียมข้อมูลจะ fail ก่อนเรียก API
หากไม่ระบุรหัสการ์ด AI จะอธิบายขอบเขตที่อนุมานจาก PR/diff และรายงาน Spec ว่า
ยังไม่ครบเมื่อขอบเขตไม่ชัดเจน หาก issue ประกอบที่อ้างถึงอ่านไม่ได้ ขั้นเตรียมข้อมูล
จะ fail เพื่อให้แก้ reference/สิทธิ์ก่อนเสียการใช้งาน API

หลังผลรีวิวออก แก้ข้อเสนอแนะที่เห็นด้วยแล้ว push เข้า branch เดิม Workflow จะรีวิว
commit ล่าสุดและอัปเดตคอมเมนต์เดิม รายงานของ commit เก่าจะไม่ถูกเผยแพร่ทับรายงานล่าสุด

## ขอบเขตและการตรวจในเครื่อง

Skill ต้นฉบับไม่ถูกแก้ไข Prompt ระบุเอกสาร Trello เป็น spec หลักและเพิ่มข้อกำหนด
เฉพาะ CI: ใช้ issues ที่ดึงมาแล้ว, รายงานข้อมูลที่ขาดแทนการถามคน,
วิเคราะห์โค้ดแบบ read-only และระบุเมื่อ sub-agents
ทำงานไม่ครบ Workflow ไม่ execute tests/build ของ PR ใน job ที่เรียก AI
CI เดิมยังตรวจ types, lint, build และ database tests ตามเดิม

คอมเมนต์ AI เป็นข้อเสนอแนะ ไม่ใช่ GitHub approval และ job สีเขียวหมายถึง workflow
รันสำเร็จ ไม่ได้หมายถึงไม่มี findings ทีมอ่านรายงานและตัดสินใจ merge เอง
ช่วงทดลองให้บังคับเฉพาะ **Web checks** และ **Backend checks** ตามกฎเดิมก่อน

ทดสอบการเตรียม prompt โดยไม่เรียก API:

```powershell
node --test .github/codex/prepare-matt-review.test.mjs
```

เอกสารอ้างอิง: [Codex GitHub Action](https://learn.chatgpt.com/docs/github-action),
[skills](https://learn.chatgpt.com/docs/build-skills),
[sub-agents](https://learn.chatgpt.com/docs/agent-configuration/subagents)
