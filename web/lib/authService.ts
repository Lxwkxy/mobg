import { User, LoginResult } from '@/types';

// บัญชี Mock สำหรับทดสอบ
export const MOCK_USERS = [
  {
    userId: 'usr_001',
    userName: 'Chinatip',
    email: 'chinatip773@gmail.com',
    password: 'password123',
  },
  {
    userId: 'usr_002',
    userName: 'Demo User',
    email: 'demo@mobg.com',
    password: 'password123',
  },
];

/**
 * Mock Login Service
 * - คืนผลลัพธ์เป็น { userId, userName, email }
 * - จำลอง Delay ( Network Latency )
 * - รองรับการจำลอง Backend ล่ม / เชื่อมไม่ได้
 */
export const loginApi = async (
  email: string,
  password: string,
  simulateServerError: boolean = false
): Promise<LoginResult> => {
  // จำลองเวลาส่ง Request ไปยัง Server (1 วินาที)
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // 1. จำลองกรณีเชื่อมต่อ Backend ไม่ได้
  if (simulateServerError || email === 'error@server.com') {
    return {
      success: false,
      error: 'Cannot connect to server. Please check your network connection.',
      isNetworkError: true,
    };
  }

  // 2. ค้นหาผู้ใช้
  const trimmedEmail = email.trim().toLowerCase();
  const foundUser = MOCK_USERS.find((u) => u.email === trimmedEmail);

  if (!foundUser || foundUser.password !== password) {
    return {
      success: false,
      error: 'Invalid email or password. Please try again.',
      isNetworkError: false,
    };
  }

  // 3. ส่งกลับข้อมูลตาม Spec: { userId, userName, email }
  const userPayload: User = {
    userId: foundUser.userId,
    userName: foundUser.userName,
    email: foundUser.email,
  };

  return {
    success: true,
    user: userPayload,
  };
};