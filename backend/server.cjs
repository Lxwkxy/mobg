const express = require('express');
const cors = require('cors');

// db.cjs โหลดไฟล์ .env ที่ root ของ repo ให้แล้ว จึงต้อง require ก่อนอ่าน process.env
const pool = require('./db.cjs');
const authRoutes = require('./routes/auth.cjs');
const projectRoutes = require('./routes/projects.cjs');

const app = express();

// origin ต้องระบุชัด (ห้ามใช้ '*') เพื่อให้ใช้ cookie ได้เมื่อทำ Login จริงในสัปดาห์ที่ 2
app.use(cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true
}));
app.use(express.json());

const PORT = process.env.PORT || 5000;

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', message: 'MobG Backend is running', timestamp: new Date().toISOString() });
});

// เชื่อมต่อ Routes ตามโมดูล (ตอนนี้เป็น mock)
app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);

// ไม่พบ endpoint
app.use('/api', (req, res) => {
    res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Endpoint not found' }
    });
});

// ข้อผิดพลาดที่ไม่คาดคิด ต้องไม่เปิดเผยรายละเอียดภายใน
app.use((err, req, res, next) => {
    // JSON ที่ส่งมาไม่ถูกต้อง เป็นความผิดของผู้เรียก ไม่ใช่ server พัง
    if (err.type === 'entity.parse.failed') {
        return res.status(400).json({
            success: false,
            error: { code: 'VALIDATION_ERROR', message: 'Request body must be valid JSON' }
        });
    }

    console.error(err);
    res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Internal server error' }
    });
});

const server = app.listen(PORT, () => {
    console.log(`MobG Backend running on port ${PORT}`);
});

// ปิด server แล้วปิด pool ตอน shutdown ตามที่ README ระบุ
function shutdown(signal) {
    console.log(`${signal} received, shutting down`);
    server.close(async () => {
        try {
            await pool.end();
            process.exit(0);
        } catch (error) {
            console.error('Error closing database pool:', error.message);
            process.exit(1);
        }
    });
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
