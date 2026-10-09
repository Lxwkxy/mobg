const express = require('express');
const router = express.Router();
const { requireFields } = require('../middlewares/validate.cjs');

// ไฟล์นี้เป็น MOCK ของ W1: ตอบข้อมูลตัวอย่างคงที่ ไม่อ่านฐานข้อมูลและไม่ตรวจสถานะ Login
// ใช้เป็นสัญญาข้อมูลให้ฝั่งหน้าเว็บ (Bar) ทำ mock; ของจริงทำในสัปดาห์ที่ 2

// POST /api/auth/login
router.post('/login', requireFields(['email', 'password']), (req, res) => {
    const { email } = req.body;
    // ข้อมูล Mock ตอบกลับ
    res.json({
        success: true,
        user: { userId: 1, userName: 'Demo Member', email: email }
    });
});

// GET /api/auth/me
// สัปดาห์ที่ 2: ต้องตอบ 401 (code: UNAUTHENTICATED) เมื่อยังไม่ล็อกอิน
router.get('/me', (req, res) => {
    res.json({
        success: true,
        user: { userId: 1, userName: 'Demo Member', email: 'demo@mobg.local' }
    });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
    res.json({ success: true, message: 'Logged out successfully' });
});

module.exports = router;