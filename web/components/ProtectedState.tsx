'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { logoutApi } from '@/lib/authService';
import type { LoadStatus } from '@/lib/useProtectedLoad';

type Props = {
  status: Exclude<LoadStatus, 'ready'>;
  /** ข้อความตอน status = 'error' (ไม่ใส่จะใช้ข้อความเชื่อมต่อไม่ได้) */
  errorMessage?: string;
  onRetry: () => void;
};

const buttonClass =
  'rounded-lg border border-[#e0e0e0] px-4 py-2 text-[12px] text-[#333333] hover:bg-[#f4f4f4] disabled:cursor-not-allowed disabled:opacity-60';

export default function ProtectedState({ status, errorMessage, onRetry }: Props) {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState('');

  const handleSignOut = async () => {
    if (isSigningOut) return;

    setIsSigningOut(true);
    setSignOutError('');

    try {
      await logoutApi();

      // เปลี่ยนหน้าเฉพาะเมื่อออกจากระบบสำเร็จ
      router.replace('/login');
      router.refresh();
    } catch (error) {
      console.error('Sign out failed:', error);
      setSignOutError('Sign out failed. Please try again.');
    } finally {
      setIsSigningOut(false);
    }
  };

  if (status === 'loading') {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <p className="text-[13px] text-[#888888]">Checking your session...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-[200px] flex-col items-center justify-center gap-3">
      <p role="alert" className="text-center text-[13px] text-[#888888]">
        {status === 'login-required' && 'You need to log in to view this page.'}
        {status === 'no-profile' &&
          'Your account has not been set up yet. Please contact your team administrator, or sign out and use another account.'}
        {status === 'error' &&
          (errorMessage ?? 'Unable to connect to the server. Please try again.')}
      </p>

      {status === 'no-profile' && signOutError && (
        <p role="alert" className="text-center text-[12px] text-red-600">
          {signOutError}
        </p>
      )}

      {status === 'login-required' && (
        <button type="button" onClick={() => router.push('/login')} className={buttonClass}>
          Log in
        </button>
      )}

      {status === 'no-profile' && (
        <button
          type="button"
          onClick={() => void handleSignOut()}
          disabled={isSigningOut}
          className={buttonClass}
        >
          {isSigningOut ? 'Signing out...' : signOutError ? 'Try sign out again' : 'Sign out'}
        </button>
      )}

      {status === 'error' && (
        <button type="button" onClick={onRetry} className={buttonClass}>
          Try again
        </button>
      )}
    </div>
  );
}