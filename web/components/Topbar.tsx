'use client';

import {
  Suspense,
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
} from 'react';

import { flushSync } from 'react-dom';

import {
  usePathname,
  useRouter,
} from 'next/navigation';

import GlobalSearch from '@/components/GlobalSearch';
import KeyboardPopup from '@/components/ui/KeyboardPopup';
import ThemeToggle from '@/components/ThemeToggle';

import { logoutApi } from '@/lib/authService';
import { useSession } from '@/lib/SessionProvider';

export default function Topbar() {
  const [openRevision, setOpenRevision] =
    useState<number | null>(null);

  const [isLoggingOut, setIsLoggingOut] =
    useState(false);

  const [logoutError, setLogoutError] =
    useState('');

  const dropdownRef = useRef<HTMLDivElement>(null);

  const router = useRouter();
  const pathname = usePathname();

  const {
    session,
    refreshSession,
    invalidateSession,
    clearSession,
  } = useSession();

  const { status, user, revision } = session;

  const canShowUser =
    status === 'ready' &&
    user !== null &&
    !isLoggingOut;

  // ใช้ Revision ผูกกับการเปิด Dropdown
  // เมื่อ Session เปลี่ยน Revision Dropdown จะปิดเอง
  const isOpen =
    canShowUser &&
    openRevision === revision;

  const shouldRevalidate =
    pathname === '/dashboard' ||
    pathname === '/mytasks' ||
    pathname === '/projects';

  // ทำงานก่อน Browser วาดเฟรมใหม่เมื่อเปลี่ยนหน้า
  useLayoutEffect(() => {
    if (shouldRevalidate) {
      void refreshSession();
    }
  }, [
    pathname,
    shouldRevalidate,
    refreshSession,
  ]);

  // รองรับ Browser Back-Forward Cache
  useEffect(() => {
    function handlePageShow(
      event: PageTransitionEvent,
    ) {
      if (!event.persisted || !shouldRevalidate) {
        return;
      }

      // บังคับให้ Session เปลี่ยนเป็น loading
      // ก่อน Browser วาดหน้า BFCache กลับมา
      flushSync(() => {
        void refreshSession();
      });
    }

    window.addEventListener(
      'pageshow',
      handlePageShow,
    );

    return () => {
      window.removeEventListener(
        'pageshow',
        handlePageShow,
      );
    };
  }, [shouldRevalidate, refreshSession]);

  // ปิด Dropdown เมื่อคลิกด้านนอก
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(
          event.target as Node,
        )
      ) {
        setOpenRevision(null);
      }
    }

    document.addEventListener(
      'mousedown',
      handleClickOutside,
    );

    return () => {
      document.removeEventListener(
        'mousedown',
        handleClickOutside,
      );
    };
  }, []);

  const handleLogout = async () => {
    if (isLoggingOut) {
      return;
    }

    setIsLoggingOut(true);
    setLogoutError('');
    setOpenRevision(null);

    // ยกเลิก Request /api/me ที่ค้างอยู่ทันที
    // และซ่อนชื่อบัญชีเดิมก่อนเรียก Logout API
    invalidateSession();

    try {
      await logoutApi();

      clearSession();

      router.replace('/login');
      router.refresh();
    } catch (error) {
      console.error('Logout failed:', error);

      setLogoutError(
        'Logout failed. Please try again.',
      );

      // ถ้า Logout ไม่สำเร็จ ให้ตรวจ Session จริงใหม่
      await refreshSession();
    } finally {
      setIsLoggingOut(false);
    }
  };

  const isLoading = status === 'loading';

  return (
    <header className="min-h-[72px] rounded-none bg-white border-b border-[#d4c8ff] shadow-[0_4px_18px_rgba(91,68,186,0.08)] grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto] xl:grid-cols-[minmax(0,1fr)_minmax(0,540px)_minmax(0,1fr)] items-center gap-3 px-4 py-3 sm:px-6 lg:px-[28px] relative z-20">
      <div aria-hidden="true" className="hidden xl:block" />

      <div className="w-full min-w-0 md:col-start-1 xl:col-start-2 flex justify-center">
        <Suspense
          fallback={
            <div className="h-12 w-full max-w-[540px] rounded-full bg-[#f4f1ff]" />
          }
        >
          <GlobalSearch
            userId={
              canShowUser
                ? user.userId
                : null
            }
          />
        </Suspense>
      </div>

      {/* USER ACCOUNT */}
      <div className="min-w-0 max-w-full justify-self-end md:col-start-2 xl:col-start-3 flex items-center gap-3 sm:gap-5">
        <ThemeToggle />

        <KeyboardPopup
          className="relative min-w-0 max-w-full inline-block"
          ref={dropdownRef}
          open={Boolean(isOpen)}
          onClose={() => setOpenRevision(null)}
        >
          <button
            type="button"
            onClick={() => {
              if (!canShowUser) {
                return;
              }

              setOpenRevision(
                isOpen ? null : revision,
              );
            }}
            disabled={!canShowUser}
            aria-expanded={Boolean(isOpen)}
            aria-haspopup="menu"
            className="max-w-full min-h-11 flex items-center gap-2.5 py-1.5 pl-1.5 pr-3.5 rounded-full bg-[#faf9ff] border border-[#e7e1ff] hover:bg-[#f2eeff] hover:border-[#d7ccff] transition-all duration-200 cursor-pointer disabled:opacity-60 disabled:cursor-wait"
          >
            <div className="shrink-0 w-[34px] h-[34px] rounded-full bg-[#ede7ff] text-[#5B44BA] flex items-center justify-center">
              <svg
                width="17"
                height="17"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </div>

            <span className="min-w-0 max-w-[150px] sm:max-w-[170px] whitespace-nowrap truncate text-[13px] font-semibold text-[#231942]">
              {isLoading
                ? 'Loading...'
                : user?.userName || 'User'}
            </span>

            <span className="shrink-0 flex items-center justify-center text-[#7c6fa0] w-[14px] h-[14px]">
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
            <div role="menu" aria-label="Account actions" className="absolute top-[calc(100%+8px)] right-0 bg-white border border-[#e6e0ff] rounded-2xl shadow-[0_12px_28px_rgba(91,68,186,0.12)] w-[200px] p-2 z-[99999]">
              {user.email && (
                <div className="p-2 text-[12px] text-[#6e6487] border-b border-[#f2eeff] mb-1.5 break-all">
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
                role="menuitem"
                tabIndex={-1}
                onClick={() => void handleLogout()}
                disabled={isLoggingOut}
                className="w-full p-2 text-left text-[#dc2626] text-[13px] font-medium rounded-xl hover:bg-[#fef2f2] flex items-center gap-2 cursor-pointer transition-colors disabled:opacity-60"
              >
                <span>↪</span>
                {isLoggingOut
                  ? 'Logging out...'
                  : 'Log out'}
              </button>
            </div>
          )}
        </KeyboardPopup>
      </div>

      {/* LOGIN SUCCESS แต่ยังไม่มี MOBG PROFILE */}
      {status === 'no-profile' && (
        <div
          role="alert"
          className="col-span-full min-w-0 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[12px] text-amber-800 shadow-sm [overflow-wrap:anywhere]"
        >
          <p>
            Your account has not been set up yet. Please
            contact your team administrator, or sign out
            and use another account.
          </p>

          {logoutError && (
            <p className="mt-1 text-red-600">
              {logoutError}
            </p>
          )}

          <button
            type="button"
            onClick={() => void handleLogout()}
            disabled={isLoggingOut}
            className="mt-2 rounded-lg bg-white border border-amber-200 px-3 py-1.5 font-medium hover:bg-amber-100 disabled:opacity-60"
          >
            {isLoggingOut
              ? 'Logging out...'
              : 'Sign out'}
          </button>
        </div>
      )}

      {/* SERVER CONNECTION ERROR */}
      {status === 'error' && (
        <div
          role="alert"
          className="col-span-full min-w-0 rounded-xl border border-red-200 bg-red-50 p-3 text-[12px] text-red-700 shadow-sm [overflow-wrap:anywhere]"
        >
          <p>
            Unable to connect to the server. Please try
            again.
          </p>

          <button
            type="button"
            onClick={() => void refreshSession()}
            className="mt-2 rounded-lg bg-white border border-red-200 px-3 py-1.5 font-medium hover:bg-red-100"
          >
            Try again
          </button>
        </div>
      )}

      {logoutError && !isLoggingOut && (
        <p
          role="alert"
          className="col-span-full text-right text-[12px] text-red-600"
        >
          {logoutError}
        </p>
      )}
    </header>
  );
}
