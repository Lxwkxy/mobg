// W1: สัญญาฟังก์ชันฐานข้อมูลสำหรับ Login ที่ตกลงกับ Pai (ยังไม่มีโค้ดจริง)
// รายละเอียด: database/schema-mapping.md หัวข้อ "Proposed Account Lookup Contract"
//
// findUserForLoginByEmail(email: string)
//   คืน { user_id, user_name, email, password_hash } เมื่อพบบัญชี
//   คืน null เมื่อไม่พบ
//   error ของฐานข้อมูลให้โยนต่อ ห้ามคืน null
//   password_hash ใช้ในฝั่ง backend เท่านั้น ห้ามอยู่ใน response
//

module.exports = {};
