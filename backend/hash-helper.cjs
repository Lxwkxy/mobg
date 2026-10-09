const bcrypt = require('bcryptjs');

// รับรหัสผ่านจาก Argument บรรทัดคำสั่ง หรือใช้ค่าเริ่มต้น
const rawPassword = process.argv[2] || 'password123';

async function generateHash(password) {
    const saltRounds = 10;
    const hash = await bcrypt.hash(password, saltRounds);
    console.log('-------------------------------------------');
    console.log(`Original Password : ${password}`);
    console.log(`Generated Hash    : ${hash}`);
    console.log('-------------------------------------------');
    console.log('Copy the hash value above for demo seed accounts.');
}

generateHash(rawPassword);