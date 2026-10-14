
import type { User, LoginResult, UserResponse } from '@/types';
import { API_BASE_URL, authClient } from '@/lib/auth-client';

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

export async function getCurrentUser(): Promise<User | null> {
  const response = await fetch(`${API_BASE_URL}/api/me`, {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
  });

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Unable to verify session (HTTP ${response.status})`);
  }

  const body: UserResponse = await response.json();

  if (!body.success) {
    throw new Error(body.error.message || 'Unable to verify session');
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
  } catch {
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
