const express = require('express');
const router = express.Router();

// ไฟล์นี้เป็น MOCK ของ W1: ตอบข้อมูลตัวอย่างคงที่ ไม่อ่านฐานข้อมูล
// ใช้เป็นสัญญาข้อมูลให้ฝั่งหน้าเว็บ (Bar) ทำ mock; ของจริงทำในสัปดาห์ที่ 2

// GET /api/projects
router.get('/', (req, res) => {
    res.json({
        success: true,
        projects: [
            {
                projectId: 1,
                projectName: 'MobG Demo Project',
                projectDescription: 'Sample project for MobG demonstration',
                startDate: '2026-10-07',
                dueDate: '2026-11-06',
                creatorName: 'Demo Member',
                derivedStatus: 'In progress',
                progressPercent: 40,
                totalTasks: 10,
                completedTasks: 4
            }
        ]
    });
});

// GET /api/projects/:projectId/members (ข้อตกลง: พร้อมใช้ในสัปดาห์ที่ 2)
router.get('/:projectId/members', (req, res) => {
    res.json({
        success: true,
        members: [
            { userId: 1, userName: 'Demo Member', role: 'Owner' }
        ]
    });
});

module.exports = router;