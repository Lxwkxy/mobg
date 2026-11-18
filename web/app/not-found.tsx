'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getCurrentUser } from '@/lib/authService';

export default function NotFound() {
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    let cancelled = false;

    getCurrentUser()
      .then((user) => {
        if (!cancelled && user) {
          setIsLoggedIn(true);
        }
      })
      .catch(() => {
        // ยังไม่ได้ล็อกอิน แสดงปุ่ม Go to Log in ตามค่าเริ่มต้น
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleGoBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
      return;
    }
    router.push(isLoggedIn ? '/dashboard' : '/login');
  };

  return (
    <main className="fixed inset-0 z-[100] flex min-h-[100dvh] items-center justify-center overflow-y-auto overflow-x-hidden bg-[linear-gradient(135deg,#f7f5ff_0%,#ede9fe_50%,#e4ddff_100%)] p-4 sm:p-6">
      {/* Ambient Background Spheres & Soft Aura */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden">
        {/* Soft purple radial aura behind center card */}
        <span className="absolute left-1/2 top-1/2 h-[540px] w-[540px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(91,68,186,0.14)_0%,rgba(91,68,186,0)_70%)]" />

        {/* Top-left floating 3D purple sphere */}
        <span className="absolute left-[7%] top-[11%] hidden h-24 w-24 rounded-full bg-[radial-gradient(circle_at_30%_30%,#a796f8,#5B44BA_70%,#3f2c8c_100%)] opacity-90 shadow-[0_20px_38px_rgba(91,68,186,0.28)] sm:block" />

        {/* Bottom-left soft translucent orb */}
        <span className="absolute -bottom-16 -left-16 h-60 w-60 rounded-full bg-[radial-gradient(circle_at_35%_35%,rgba(91,68,186,0.16),rgba(91,68,186,0.03)_70%)]" />

        {/* Mid-left small accent dot */}
        <span className="absolute left-[21%] bottom-[24%] hidden h-4 w-4 rounded-full bg-[#5B44BA]/25 lg:block" />

        {/* Top-right floating soft lavender sphere */}
        <span className="absolute right-[8%] top-[14%] hidden h-20 w-20 rounded-full bg-[radial-gradient(circle_at_30%_30%,#ffffff,#dcd4ff_62%,#b9a8fa_100%)] shadow-[0_16px_32px_rgba(91,68,186,0.16)] lg:block" />

        {/* Bottom-right soft translucent orb */}
        <span className="absolute -bottom-20 right-[4%] hidden h-56 w-56 rounded-full bg-[radial-gradient(circle_at_35%_35%,rgba(91,68,186,0.14),rgba(91,68,186,0.02)_70%)] lg:block" />

        {/* Mid-right tiny white highlight dot */}
        <span className="absolute right-[22%] top-[32%] hidden h-3 w-3 rounded-full bg-white/80 shadow-sm lg:block" />
      </div>

      {/* Main Card */}
      <div className="relative z-10 my-auto w-full max-w-[460px] overflow-hidden rounded-[28px] border border-white bg-white/95 p-8 text-center shadow-[0_24px_60px_rgba(91,68,186,0.15)] backdrop-blur-md sm:p-10">
        {/* Top subtle decorative gradient strip */}
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-1.5 bg-[linear-gradient(90deg,#5B44BA_0%,#9b87f5_50%,#dcd4ff_100%)]"
        />

        {/* Status Pill Badge */}
        <div className="inline-flex items-center gap-2 rounded-full border border-[#e4ddff] bg-[#f7f5ff] px-3.5 py-1 text-[11px] font-bold uppercase tracking-widest text-[#5B44BA]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#5B44BA]" />
          Error 404
        </div>

        {/* Hero 404 Display + Compass Icon */}
        <div className="mt-5 flex items-center justify-center gap-2 select-none">
          <span className="bg-[linear-gradient(135deg,#231942_0%,#5B44BA_100%)] bg-clip-text text-[64px] font-black leading-none tracking-tight text-transparent sm:text-[72px]">
            4
          </span>

          {/* Stylized Compass Circle */}
          <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-[#dcd4ff] bg-[linear-gradient(145deg,#f7f5ff_0%,#ede9fe_100%)] text-[#5B44BA] shadow-[inset_0_2px_6px_rgba(255,255,255,0.9),0_8px_20px_rgba(91,68,186,0.16)] sm:h-[70px] sm:w-[70px]">
            <svg
              width="34"
              height="34"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="9.5" />
              <polygon
                points="15.8 8.2 13.7 13.7 8.2 15.8 10.3 10.3 15.8 8.2"
                fill="rgba(91, 68, 186, 0.16)"
              />
              <circle cx="12" cy="12" r="1" fill="currentColor" />
            </svg>
          </div>

          <span className="bg-[linear-gradient(135deg,#5B44BA_0%,#8b74e8_100%)] bg-clip-text text-[64px] font-black leading-none tracking-tight text-transparent sm:text-[72px]">
            4
          </span>
        </div>

        {/* Heading & Description */}
        <h1 className="mt-5 text-[24px] font-bold tracking-tight text-[#231942] sm:text-[26px]">
          Page not found
        </h1>

        <p className="mx-auto mt-2.5 max-w-[340px] text-[14px] leading-relaxed text-[#6e6487]">
          {isLoggedIn
            ? "Sorry, we couldn't find the page you're looking for. It may have been moved or the URL might be incorrect."
            : "The page you're looking for doesn't exist, or you may need to sign in to access this workspace."}
        </p>

        {/* Divider */}
        <div className="my-7 h-px w-full bg-[linear-gradient(90deg,transparent,#ebe6ff,transparent)]" />

        {/* Action Buttons */}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={handleGoBack}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[#dcd4ff] bg-[#faf9ff] px-5 py-2.5 text-[14px] font-semibold text-[#5B44BA] transition-all duration-200 hover:border-[#c4b5fd] hover:bg-[#f2eeff] active:scale-[0.98] cursor-pointer"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M19 12H5" />
              <path d="m12 19-7-7 7-7" />
            </svg>
            Go Back
          </button>

          <Link
            href={isLoggedIn ? '/dashboard' : '/login'}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[linear-gradient(135deg,#5B44BA_0%,#4b36a3_100%)] px-6 py-2.5 text-[14px] font-semibold text-white shadow-[0_8px_20px_rgba(91,68,186,0.3)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_24px_rgba(91,68,186,0.38)] active:translate-y-0"
          >
            {isLoggedIn ? (
              <>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <rect x="3" y="3" width="7" height="7" rx="1.5" />
                  <rect x="14" y="3" width="7" height="7" rx="1.5" />
                  <rect x="14" y="14" width="7" height="7" rx="1.5" />
                  <rect x="3" y="14" width="7" height="7" rx="1.5" />
                </svg>
                Back to Dashboard
              </>
            ) : (
              <>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                  <polyline points="10 17 15 12 10 7" />
                  <line x1="15" y1="12" x2="3" y2="12" />
                </svg>
                Go to Log in
              </>
            )}
          </Link>
        </div>
      </div>
    </main>
  );
}