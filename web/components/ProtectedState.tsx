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

const primaryButtonClass =
  'min-h-11 rounded-full bg-[#5B44BA] px-6 py-2.5 text-[13px] font-semibold text-white shadow-[0_6px_18px_rgba(91,68,186,0.24)] transition hover:bg-[#4c37a3] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5B44BA] disabled:cursor-not-allowed disabled:opacity-60';

const secondaryButtonClass =
  'min-h-11 rounded-full border border-[#dcd4ff] bg-[#f7f5ff] px-6 py-2.5 text-[13px] font-semibold text-[#5B44BA] transition hover:bg-[#ede9fe] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5B44BA] disabled:cursor-not-allowed disabled:opacity-60';

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
      <div className="flex min-h-[260px] flex-col items-center justify-center gap-3">
        <span
          aria-hidden="true"
          className="h-7 w-7 animate-spin rounded-full border-[2.5px] border-[#dcd4ff] border-t-[#5B44BA]"
        />
        <p className="text-[13px] font-medium text-[#6e6487]">Checking your session...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-[300px] items-center justify-center p-4">
      <div className="min-w-0 flex w-full max-w-[420px] flex-col items-center gap-4 rounded-2xl border border-[#ebe6ff] bg-white p-7 text-center shadow-sm [overflow-wrap:anywhere]">
        <div
          aria-hidden="true"
          className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#f7f5ff] text-[#5B44BA] ring-1 ring-[#dcd4ff]"
        >
          {status === 'login-required' ? (
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="5" y="11" width="14" height="10" rx="2.5" />
              <path d="M8 11V7a4 4 0 0 1 8 0v4" />
            </svg>
          ) : (
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M12 8v4" />
              <path d="M12 16h.01" />
            </svg>
          )}
        </div>

        <p role="alert" className="text-center text-[14px] font-medium leading-relaxed text-[#231942]">
          {status === 'login-required' && 'You need to log in to view this page.'}
          {status === 'no-profile' &&
            'Your account has not been set up yet. Please contact your team administrator, or sign out and use another account.'}
          {status === 'error' &&
            (errorMessage ?? 'Unable to connect to the server. Please try again.')}
        </p>

        {status === 'no-profile' && signOutError && (
          <p role="alert" className="text-center text-[12px] font-medium text-red-600">
            {signOutError}
          </p>
        )}

        {status === 'login-required' && (
          <button
            type="button"
            onClick={() => router.push('/login')}
            className={primaryButtonClass}
          >
            Log in
          </button>
        )}

        {status === 'no-profile' && (
          <button
            type="button"
            onClick={() => void handleSignOut()}
            disabled={isSigningOut}
            className={secondaryButtonClass}
          >
            {isSigningOut ? 'Signing out...' : signOutError ? 'Try sign out again' : 'Sign out'}
          </button>
        )}

        {status === 'error' && (
          <button type="button" onClick={onRetry} className={secondaryButtonClass}>
            Try again
          </button>
        )}
      </div>
    </div>
  );
}