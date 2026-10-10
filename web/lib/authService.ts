import { User, LoginResult } from '@/types';

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

export const loginApi = async (
  email: string,
  password: string,
  simulateServerError: boolean = false
): Promise<LoginResult> => {
  await new Promise((resolve) => setTimeout(resolve, 800));

  if (simulateServerError || email === 'error@server.com') {
    return {
      success: false,
      error: 'Cannot connect to server. Please check your network connection.',
      isNetworkError: true,
    };
  }

  const trimmedEmail = email.trim().toLowerCase();
  const foundUser = MOCK_USERS.find((u) => u.email === trimmedEmail);

  if (!foundUser || foundUser.password !== password) {
    return {
      success: false,
      error: 'Invalid email or password. Please try again.',
      isNetworkError: false,
    };
  }

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