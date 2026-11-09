import { authClient } from '@/lib/auth-client';

function check(result: { error?: { message?: string } | null }) {
  if (result.error) throw new Error(result.error.message || 'Unable to complete this request. Please try again.');
}

export async function registerAccount(name: string, email: string, password: string) {
  check(await authClient.signUp.email({ name, email, password,
    callbackURL: `${window.location.origin}/verify-email?verified=1` }));
}
export async function resendVerification(email: string) {
  check(await authClient.sendVerificationEmail({ email,
    callbackURL: `${window.location.origin}/verify-email?verified=1` }));
}
export async function requestPasswordReset(email: string) {
  check(await authClient.requestPasswordReset({ email, redirectTo: `${window.location.origin}/reset-password` }));
}
export async function resetAccountPassword(token: string, newPassword: string) {
  check(await authClient.resetPassword({ token, newPassword }));
}
