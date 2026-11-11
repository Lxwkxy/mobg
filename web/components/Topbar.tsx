'use client';

import { Suspense, useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import GlobalSearch from '@/components/GlobalSearch';
import { logoutApi } from '@/lib/authService';
import { useProtectedLoad } from '@/lib/useProtectedLoad';

// Topbar ต้องการแค่ user จาก /api/me จึงไม่มีข้อมูลอื่นให้โหลด
// อยู่นอก component เพื่อให้ identity คงที่
const loadNothing = async () => null;

export default function Topbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState('');

  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const { status, user, retry } = useProtectedLoad(loadNothing);

  // ยังไม่ได้ Login / session หมดอายุ -> ไปหน้า Login (ไม่มี setState)
  useEffect(() => {
    if (status === 'login-required') {
      router.replace('/login');
    }
  }, [status, router]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleLogout = async () => {
    if (isLoggingOut) return;

    setIsLoggingOut(true);
    setLogoutError('');

    try {
      await logoutApi();

      setIsOpen(false);
      router.replace('/login');
      router.refresh();
    } catch (error) {
      console.error('Logout failed:', error);
      setLogoutError('Logout failed. Please try again.');
    } finally {
      setIsLoggingOut(false);
    }
  };

  const isLoading = status === 'loading';

  return (
    <header className="min-h-[72px] bg-white flex flex-wrap items-center justify-end gap-3 px-4 py-3 sm:px-6 lg:px-[36px] border-b border-[#e0e0e0] relative">
      <Suspense fallback={<div className="mr-auto h-12 max-w-[580px] flex-1 basis-full rounded-full bg-[#eaeaea] sm:basis-0" />}>
        <GlobalSearch userId={!isLoggingOut && status === 'ready' ? user?.userId ?? null : null} />
      </Suspense>

      {/* User Account */}
      <div className="min-w-0 max-w-full sm:max-w-[45%] flex items-center gap-5">
        <div className="relative min-w-0 inline-block" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setIsOpen((previous) => !previous)}
            disabled={isLoading || !user || isLoggingOut}
            aria-expanded={isOpen}
            className="max-w-full min-h-11 flex items-center gap-2.5 p-1.5 px-2.5 rounded-lg hover:bg-[#f4f4f4] transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-wait"
          >
            <div className="shrink-0 w-[34px] h-[34px] rounded-full bg-[#e0e0e0] flex items-center justify-center text-[16px]">
              👤
            </div>

            <span className="min-w-0 [overflow-wrap:anywhere] text-[13px] font-semibold text-[#333333]">
              {isLoading ? 'Loading...' : user?.userName || 'User'}
            </span>

            <span className="flex items-center justify-center text-[#666666] w-[14px] h-[14px]">
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </span>
          </button>

          {isOpen && user && (
            <div className="absolute top-[calc(100%+8px)] right-0 bg-white border border-[#e0e0e0] rounded-xl shadow-[0_10px_25px_rgba(0,0,0,0.15)] w-[200px] p-2 z-[99999]">
              {user.email && (
                <div className="p-2 text-[12px] text-[#666666] border-b border-[#f0f0f0] mb-1.5 break-all">
                  {user.email}
                </div>
              )}

              {logoutError && (
                <p
                  role="alert"
                  className="p-2 text-[12px] text-red-600 break-words"
                >
                  {logoutError}
                </p>
              )}

              <button
                type="button"
                onClick={() => void handleLogout()}
                disabled={isLoggingOut}
                className="w-full p-2 text-left text-[#dc2626] text-[13px] font-medium rounded-md hover:bg-[#fef2f2] flex items-center gap-2 cursor-pointer transition-colors disabled:opacity-60"
              >
                <span>↪</span>
                {isLoggingOut ? 'Logging out...' : 'Log out'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Login ได้แต่ยังไม่มีโปรไฟล์ MobG (403): ต้องมีทางออกจากระบบ */}
      {status === 'no-profile' && (
        <div
          role="alert"
          className="basis-full min-w-0 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[12px] text-amber-800 shadow-sm [overflow-wrap:anywhere]"
        >
          <p>
            Your account has not been set up yet. Please contact your team
            administrator, or sign out and use another account.
          </p>

          {logoutError && <p className="mt-1 text-red-600">{logoutError}</p>}

          <button
            type="button"
            onClick={() => void handleLogout()}
            disabled={isLoggingOut}
            className="mt-2 rounded-md bg-white border border-amber-200 px-3 py-1.5 font-medium hover:bg-amber-100 disabled:opacity-60"
          >
            {isLoggingOut ? 'Logging out...' : 'Sign out'}
          </button>
        </div>
      )}

      {/* เชื่อมต่อเซิร์ฟเวอร์ไม่ได้จริง */}
      {status === 'error' && (
        <div
          role="alert"
          className="basis-full min-w-0 rounded-lg border border-red-200 bg-red-50 p-3 text-[12px] text-red-700 shadow-sm [overflow-wrap:anywhere]"
        >
          <p>Unable to connect to the server. Please try again.</p>

          <button
            type="button"
            onClick={retry}
            className="mt-2 rounded-md bg-white border border-red-200 px-3 py-1.5 font-medium hover:bg-red-100"
          >
            Try again
          </button>
        </div>
      )}
    </header>
  );
}
