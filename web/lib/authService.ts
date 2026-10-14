import type { User, LoginResult, UserResponse } from '@/types';
import { API_BASE_URL, authClient } from '@/lib/auth-client';
import { ApiRequestError } from '@/lib/projectApi';

// ใช้สำหรับแสดง Quick Test Accounts ในหน้า Login เท่านั้น
// ไม่ใช้ตรวจสอบว่าผู้ใช้ Login สำเร็จหรือไม่
export const MOCK_USERS = [
  {
    userId: 1,
    userName: 'Chinatip',
    email: 'chinatip773@gmail.com',
    password: 'password123',
  },
  {
    userId: 2,
    userName: 'Demo User',
    email: 'demo@mobg.com',
    password: 'password123',
  },
];

/**
 * GET /api/me
 * - 200 -> User
 * - 401 -> null (ยังไม่ได้ Login / session หมดอายุ)
 * - 403 และอื่น ๆ -> โยน ApiRequestError ที่มี status
 *   (status 0 = เชื่อมต่อเซิร์ฟเวอร์ไม่ได้)
 */
export async function getCurrentUser(): Promise<User | null> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}/api/me`, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    });
  } catch {
    throw new ApiRequestError(
      'Unable to connect to the server. Please try again.',
      0,
    );
  }

  if (response.status === 401) {
    return null;
  }

  let body: UserResponse | undefined;

  try {
    body = (await response.json()) as UserResponse;
  } catch {
    body = undefined;
  }

  if (!response.ok || !body || !body.success) {
    const error = body && !body.success ? body.error : undefined;

    throw new ApiRequestError(
      error?.message ?? `Unable to verify session (HTTP ${response.status})`,
      response.status,
      error?.code,
      error?.details,
    );
  }

  return body.user;
}

export const loginApi = async (
  email: string,
  password: string,
  simulateServerError = false
): Promise<LoginResult> => {
  // ใช้จำลอง Network Error สำหรับการทดสอบเท่านั้น
  if (simulateServerError) {
    return {
      success: false,
      error: 'Cannot connect to server. Please check your network connection.',
      isNetworkError: true,
    };
  }

  try {
    const result = await authClient.signIn.email({
      email: email.trim().toLowerCase(),
      password,
    });

    if (result.error) {
      return {
        success: false,
        error: result.error.message || 'Invalid email or password. Please try again.',
        isNetworkError: false,
      };
    }

    // ตรวจสอบ Session และ MobG profile จาก Backend จริง
    const user = await getCurrentUser();

    if (!user) {
      return {
        success: false,
        error: 'Login succeeded, but your session could not be verified. Please try again.',
        isNetworkError: false,
      };
    }

    return {
      success: true,
      user,
    };
  } catch (error) {
    const status = (error as { status?: number }).status;

    // Login ผ่านแต่ยังไม่มีโปรไฟล์ MobG ผูกอยู่: ออกจากระบบเพื่อไม่ให้ค้าง session
    if (status === 403) {
      try {
        await authClient.signOut();
      } catch {
        // ไม่ต้องทำอะไร ข้อความด้านล่างบอกผู้ใช้อยู่แล้ว
      }

      return {
        success: false,
        error: 'Your account has not been set up yet. Please contact your team administrator.',
        isNetworkError: false,
      };
    }

    // มี HTTP status จากเซิร์ฟเวอร์ แปลว่าเชื่อมต่อได้ แต่ตรวจ session ไม่สำเร็จ
    if (typeof status === 'number' && status > 0) {
      return {
        success: false,
        error: 'Unable to verify your session. Please try again.',
        isNetworkError: false,
      };
    }

    return {
      success: false,
      error: 'Cannot connect to server. Please check your network connection.',
      isNetworkError: true,
    };
  }
};

export async function logoutApi(): Promise<void> {
  const result = await authClient.signOut();

  if (result.error) {
    throw new Error(result.error.message || 'Logout failed');
  }
}