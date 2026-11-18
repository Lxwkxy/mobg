'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useHydrated } from '@/lib/useHydrated';
import { loginApi } from '@/lib/authService';
import {
  usePasswordResetRequestAction,
  useRegisterAction,
} from '@/lib/useAccountActions';
import { Button } from '@/components/ui/Button';

type AuthViewMode = 'register' | 'login' | 'forgot';

function UserIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="8" r="4" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="5" y="11" width="14" height="10" rx="2.5" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

function ArrowLeftIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-3.5 w-3.5"
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
  );
}

function MobGBrandLogo() {
  return (
    <svg
      viewBox="0 0 100 116"
      fill="none"
      aria-hidden="true"
      className="h-24 w-24 sm:h-28 sm:w-28 lg:h-36 lg:w-36"
    >
      <path
        d="M10 4H90V24H30V74H70V60H55V42H90V92H10V4Z"
        fill="#FFFFFF"
      />
      <g
        stroke="#6522D6"
        strokeWidth="15"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M14 109V84L25 96L36 84V109" />
        <rect x="43" y="84" width="19" height="25" rx="9.5" />
        <path d="M72 84H80.5C84.5 84 87 86.5 87 90C87 93.2 84.8 95.5 81.5 96C85.5 96.5 88 99 88 102.8C88 106.8 85 109 80.5 109H72V84ZM72 96H81.5" />
      </g>
      <g
        stroke="#FFFFFF"
        strokeWidth="6.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M14 109V84L25 96L36 84V109" />
        <rect x="43" y="84" width="19" height="25" rx="9.5" />
        <path d="M72 84H80.5C84.5 84 87 86.5 87 90C87 93.2 84.8 95.5 81.5 96C85.5 96.5 88 99 88 102.8C88 106.8 85 109 80.5 109H72V84ZM72 96H81.5" />
      </g>
    </svg>
  );
}

function WelcomeBotanicalAccent() {
  return (
    <svg
      viewBox="0 0 360 220"
      fill="none"
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 bottom-0 h-44 w-full select-none opacity-80"
    >
      <path
        d="M-12 196C26 142 88 114 156 112C124 162 72 198 -12 220Z"
        fill="#DDD6FE"
        fillOpacity="0.10"
      />
      <path
        d="M52 220C46 164 76 118 138 92C130 144 102 188 68 220H52Z"
        fill="#A78BFA"
        fillOpacity="0.18"
      />
      <path
        d="M114 220C112 184 134 158 168 144C178 174 168 200 148 220H114Z"
        fill="#9AD4D6"
        fillOpacity="0.16"
      />
      <path
        d="M28 220C22 192 36 168 64 156C78 178 76 202 60 220H28Z"
        fill="#F5B8D5"
        fillOpacity="0.14"
      />
    </svg>
  );
}

type Star = [number, number, number, number];

const pageStars: Star[] = [
  [6, 10, 3, 0.7], [14, 4, 2, 0.5], [22, 14, 4, 0.8],
  [30, 6, 2, 0.5], [38, 12, 3, 0.6], [44, 3, 2, 0.5],
  [4, 30, 3, 0.6], [10, 46, 2, 0.5], [3, 62, 4, 0.7],
  [8, 78, 2, 0.5], [16, 90, 3, 0.6], [26, 94, 2, 0.5],
  [36, 88, 4, 0.7], [46, 96, 2, 0.5], [70, 8, 3, 0.7],
  [90, 14, 2, 0.5],
];

const panelStars: Star[] = [
  [10, 8, 3, 0.65], [28, 14, 2, 0.45], [46, 6, 4, 0.75],
  [64, 12, 2, 0.45], [82, 20, 3, 0.65], [8, 34, 2, 0.45],
  [90, 40, 3, 0.55], [14, 58, 4, 0.65], [34, 70, 2, 0.45],
  [58, 66, 3, 0.55], [78, 78, 2, 0.45], [20, 88, 3, 0.65],
  [48, 92, 2, 0.45], [70, 90, 4, 0.65],
];

function Stars({
  points,
  hideOnLarge = false,
}: {
  points: Star[];
  hideOnLarge?: boolean;
}) {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      {points.map(([x, y, size, opacity], index) => (
        <span
          key={index}
          className={`absolute rounded-full bg-white ${hideOnLarge && x >= 50 ? 'lg:hidden' : ''}`}
          style={{
            left: `${x}%`,
            top: `${y}%`,
            width: size,
            height: size,
            opacity,
            boxShadow: size >= 4 ? '0 0 8px 2px rgba(255,255,255,0.5)' : undefined,
          }}
        />
      ))}
    </div>
  );
}

const cloudBlobs = [
  { top: '0%', size: 88, left: -1 },
  { top: '14%', size: 106, left: -24 },
  { top: '31%', size: 128, left: -46 },
  { top: '50%', size: 152, left: -62 },
  { top: '69%', size: 128, left: -46 },
  { top: '86%', size: 106, left: -24 },
  { top: '100%', size: 88, left: -1 },
];

const cloudLayers = [
  { extraLeft: -44, extraSize: 34, color: 'rgba(155, 135, 245, 0.28)' },
  { extraLeft: -24, extraSize: 18, color: 'rgba(221, 214, 254, 0.58)' },
  { extraLeft: 0, extraSize: 0, color: '#ffffff' },
];

function CloudEdge() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 hidden w-0 lg:block">
      {cloudLayers.map((layer, layerIndex) =>
        cloudBlobs.map((blob, index) => (
          <span
            key={`${layerIndex}-${index}`}
            className="absolute rounded-full"
            style={{
              top: blob.top,
              left: blob.left + layer.extraLeft,
              width: blob.size + layer.extraSize,
              height: blob.size + layer.extraSize,
              backgroundColor: layer.color,
              transform: 'translateY(-50%)',
            }}
          />
        )),
      )}
      <span className="absolute rounded-full bg-white/45" style={{ top: '8%', left: -110, width: 22, height: 22 }} />
      <span className="absolute rounded-full bg-white/35" style={{ top: '40%', left: -150, width: 16, height: 16 }} />
      <span className="absolute rounded-full bg-white/45" style={{ top: '78%', left: -120, width: 26, height: 26 }} />
    </div>
  );
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function validateLoginEmail(value: string): string | null {
  const cleanedEmail = value.trim();

  if (!cleanedEmail) {
    return 'Please enter your email.';
  }

  if (!emailPattern.test(cleanedEmail)) {
    return 'Please enter a valid email address.';
  }

  return null;
}

const fieldBase =
  'box-border min-w-0 w-full min-h-11 rounded-full border border-[#dcd4ff] bg-[#f7f5ff] py-2.5 pl-10 pr-4 text-base sm:text-[15px] font-medium text-[#231942] placeholder:font-normal placeholder:text-[#8c81a8] outline-none transition focus:border-[#5B44BA] focus:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5B44BA] focus:ring-2 focus:ring-[#5B44BA]/20 forced-colors:border-[CanvasText] forced-colors:focus-visible:outline-[Highlight] forced-colors:focus-visible:outline-solid';

const compactFieldBase =
  'box-border min-w-0 w-full min-h-10 rounded-full border border-[#dcd4ff] bg-[#f7f5ff] py-2 pl-10 pr-4 text-base sm:text-[14.5px] font-medium text-[#231942] placeholder:font-normal placeholder:text-[#8c81a8] outline-none transition focus:border-[#5B44BA] focus:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5B44BA] focus:ring-2 focus:ring-[#5B44BA]/20 forced-colors:border-[CanvasText] forced-colors:focus-visible:outline-[Highlight] forced-colors:focus-visible:outline-solid';

export default function LoginSplitView({
  initialMode = 'login',
}: {
  initialMode?: AuthViewMode;
}) {
  const hydrated = useHydrated();
  const router = useRouter();

  // Active slide mode ('register' | 'login' | 'forgot')
  const [activeView, setActiveView] = useState<AuthViewMode>(initialMode);
  const [isSliding, setIsSliding] = useState(false);
  const slideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Login state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState('');
  const [emailTouched, setEmailTouched] = useState(false);
  const [emailAnnouncement, setEmailAnnouncement] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Shared forgot password & register actions
  const [forgotEmail, setForgotEmail] = useState('');
  const {
    pending: forgotPending,
    error: forgotError,
    done: forgotDone,
    setError: setForgotError,
    resetState: resetForgotState,
    submitPasswordResetRequest,
  } = usePasswordResetRequestAction();

  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirm, setRegConfirm] = useState('');
  const {
    pending: regPending,
    error: regError,
    setError: setRegError,
    submitRegister,
  } = useRegisterAction();

  const isSubmitting = useRef(false);

  const emailInputRef = useRef<HTMLInputElement>(null);
  const forgotEmailInputRef = useRef<HTMLInputElement>(null);
  const regNameInputRef = useRef<HTMLInputElement>(null);
  const [emailFocusRequest, setEmailFocusRequest] = useState(0);

  const announcementTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (emailFocusRequest > 0) {
      emailInputRef.current?.focus();
    }
  }, [emailFocusRequest]);

  const triggerSlide = useCallback(
    (nextMode: AuthViewMode, updateHistory = true) => {
      if (slideTimer.current !== null) {
        clearTimeout(slideTimer.current);
      }

      setIsSliding(true);
      setActiveView(nextMode);

      if (nextMode === 'forgot') {
        resetForgotState();
        setForgotEmail((prev) => prev || email.trim());
        if (updateHistory && window.location.pathname !== '/forgot-password') {
          window.history.pushState({ view: 'forgot' }, '', '/forgot-password');
        }
      } else if (nextMode === 'register') {
        setRegError('');
        setRegEmail((prev) => prev || email.trim());
        if (updateHistory && window.location.pathname !== '/register') {
          window.history.pushState({ view: 'register' }, '', '/register');
        }
      } else {
        setFormError('');
        if (updateHistory && window.location.pathname !== '/login') {
          window.history.pushState({ view: 'login' }, '', '/login');
        }
      }

      slideTimer.current = setTimeout(() => {
        setIsSliding(false);
        slideTimer.current = null;
        if (nextMode === 'forgot') {
          forgotEmailInputRef.current?.focus();
        } else if (nextMode === 'register') {
          regNameInputRef.current?.focus();
        } else {
          emailInputRef.current?.focus();
        }
      }, 860);
    },
    [email, resetForgotState, setRegError],
  );

  useEffect(() => {
    function handlePopState() {
      const path = window.location.pathname;
      const nextMode: AuthViewMode =
        path === '/forgot-password'
          ? 'forgot'
          : path === '/register'
            ? 'register'
            : 'login';
      triggerSlide(nextMode, false);
    }

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [triggerSlide]);

  useEffect(() => {
    return () => {
      if (announcementTimer.current !== null) {
        clearTimeout(announcementTimer.current);
      }
      if (slideTimer.current !== null) {
        clearTimeout(slideTimer.current);
      }
    };
  }, []);

  const emailValidationError = validateLoginEmail(email);
  const showEmailError = emailTouched && emailValidationError !== null;

  function announceEmailError(message: string) {
    if (announcementTimer.current !== null) {
      clearTimeout(announcementTimer.current);
    }

    setEmailAnnouncement('');

    announcementTimer.current = setTimeout(() => {
      setEmailAnnouncement(message);
      announcementTimer.current = null;
    }, 50);
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitting.current) return;

    setFormError('');
    setEmailTouched(true);

    const validationError = validateLoginEmail(email);

    if (validationError) {
      announceEmailError(validationError);
      setEmailFocusRequest((current) => current + 1);
      return;
    }

    if (announcementTimer.current !== null) {
      clearTimeout(announcementTimer.current);
      announcementTimer.current = null;
    }

    setEmailAnnouncement('');

    if (!password) {
      setFormError('Please enter your password.');
      return;
    }

    isSubmitting.current = true;
    setIsLoading(true);

    try {
      const result = await loginApi(email.trim(), password);

      if (!result.success || !result.user) {
        setFormError(result.error || 'Login failed. Please try again.');
        return;
      }

      router.replace('/dashboard');
      router.refresh();
    } catch {
      setFormError('Unable to connect to the server. Please try again.');
    } finally {
      isSubmitting.current = false;
      setIsLoading(false);
    }
  }

  function handleEmailChange(value: string) {
    setEmail(value);
    setFormError('');

    const validationError = validateLoginEmail(value);

    if (!validationError) {
      setEmailTouched(false);

      if (announcementTimer.current !== null) {
        clearTimeout(announcementTimer.current);
        announcementTimer.current = null;
      }

      setEmailAnnouncement('');
    }
  }

  async function handleForgotSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submitPasswordResetRequest(forgotEmail);
  }

  async function handleRegisterSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submitRegister({
      name: regName,
      email: regEmail,
      password: regPassword,
      confirmation: regConfirm,
    });
  }

  const trackTranslate =
    activeView === 'register'
      ? 'translateX(0%)'
      : activeView === 'login'
        ? 'translateX(-33.333333%)'
        : 'translateX(-66.666667%)';

  return (
    <main
      className="
        login-main relative flex min-h-[100dvh] items-center justify-center
        overflow-x-hidden bg-[#5B44BA] p-4 sm:p-6
        lg:bg-[linear-gradient(90deg,#5B44BA_50%,#ede9fe_50%)]
        [@media(max-height:500px)_and_(max-width:1023px)]:p-2
      "
      style={{
        minHeight: '100dvh',
        flexShrink: 0,
      }}
    >
      <style>{`
        .login-slide-mask {
          -webkit-mask-image: linear-gradient(
            to right,
            transparent 0px,
            #000 20px,
            #000 calc(100% - 20px),
            transparent 100%
          );
          mask-image: linear-gradient(
            to right,
            transparent 0px,
            #000 20px,
            #000 calc(100% - 20px),
            transparent 100%
          );
        }
        @media (min-width: 1024px) {
          .login-slide-mask {
            -webkit-mask-image: linear-gradient(
              to right,
              transparent 0px,
              #000 64px,
              #000 calc(100% - 44px),
              transparent 100%
            );
            mask-image: linear-gradient(
              to right,
              transparent 0px,
              #000 64px,
              #000 calc(100% - 44px),
              transparent 100%
            );
          }
        }
      `}</style>

      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <span className="absolute left-[4%] top-[7%] hidden h-20 w-20 rounded-full bg-[radial-gradient(circle_at_35%_35%,#9b87f5,#5B44BA_75%)] opacity-75 sm:block" />
        <span className="absolute -left-10 bottom-[6%] h-44 w-44 rounded-full bg-white/10" />
        <span className="absolute left-[18%] top-[38%] hidden h-14 w-14 rounded-full bg-white/10 sm:block" />
        <span className="absolute left-[8%] top-[56%] hidden h-6 w-6 rounded-full bg-white/15 sm:block" />
      </div>

      <Stars points={pageStars} hideOnLarge />

      <div
        className="
          relative z-10 grid w-full max-w-[960px] grid-cols-1
          overflow-hidden rounded-2xl bg-white
          shadow-[0_24px_60px_rgba(35,25,66,0.24)]
          lg:min-h-[540px] lg:grid-cols-2
          [@media(max-height:500px)_and_(max-width:1023px)]:min-h-0
          [@media(max-height:500px)_and_(max-width:1023px)]:max-w-[480px]
        "
      >
        <section
          className="
            login-welcome relative flex flex-col items-center justify-center
            gap-8 overflow-hidden
            bg-[linear-gradient(155deg,#6f58d4_0%,#5B44BA_55%,#48339e_100%)]
            px-6 py-10 text-center text-white
            sm:px-10 lg:items-start lg:py-14 lg:text-left
            [@media(max-height:500px)_and_(max-width:1023px)]:hidden
          "
        >
          <Stars points={panelStars} />
          <WelcomeBotanicalAccent />

          <span aria-hidden="true" className="absolute -left-12 bottom-6 h-44 w-44 rounded-full bg-white/10" />
          <span aria-hidden="true" className="absolute left-[38%] top-[58%] hidden h-16 w-16 rounded-full bg-white/10 lg:block" />
          <span aria-hidden="true" className="absolute right-[14%] top-[22%] hidden h-10 w-10 rounded-full bg-[#a78bfa]/30 lg:block" />

          <div className="relative min-w-0 [overflow-wrap:anywhere]">
            <p className="text-[28px] font-semibold tracking-tight sm:text-[34px]">
              Welcome to MobG
            </p>
            <p className="mt-1.5 text-[14px] text-white/80">
              Log in to manage your projects and tasks.
            </p>
          </div>

          <div
            aria-hidden="true"
            className="relative flex h-36 w-36 items-center justify-center rounded-[28px] border border-white/20 bg-[#6522D6] shadow-[0_16px_36px_rgba(32,14,74,0.32)] sm:h-44 sm:w-44 lg:h-56 lg:w-56 lg:self-center"
          >
            <MobGBrandLogo />
          </div>
        </section>

        <section
          className="
            login-form-panel relative z-10 flex items-center justify-center
            bg-white
          "
        >
          <CloudEdge />

          {/* Feathered sliding viewport: [Register | Login | Forgot Password] */}
          <div
            className="
              login-slide-mask relative z-10 w-full overflow-hidden py-8 lg:py-10
              [@media(max-height:500px)_and_(max-width:1023px)]:py-2
            "
          >
            <div
              className="flex w-[300%] items-center transition-transform motion-reduce:!transition-none"
              style={{
                transform: trackTranslate,
                transitionDuration: '850ms',
                transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
              }}
            >
              {/* Slide 0: Create Your Account */}
              <div
                aria-hidden={activeView !== 'register'}
                className={`flex w-1/3 shrink-0 justify-center px-6 transition-opacity duration-500 ease-out sm:px-12 [@media(max-height:500px)_and_(max-width:1023px)]:px-[14px] ${
                  activeView === 'register'
                    ? 'visible opacity-100'
                    : isSliding
                      ? 'pointer-events-none visible opacity-0'
                      : 'pointer-events-none invisible opacity-0'
                }`}
              >
                <div className="w-full min-w-0 max-w-[340px] [overflow-wrap:anywhere]">
                  <div
                    className="
                      mb-4 text-center
                      [@media(max-height:500px)_and_(max-width:1023px)]:mb-1
                    "
                  >
                    <h2 className="text-[25px] font-bold tracking-tight text-[#5B44BA] sm:text-[27px]">
                      Create your account
                    </h2>
                    <p className="mt-1 text-[12.5px] leading-snug text-[#6e6487]">
                      Use an email address you can access. You&apos;ll need to verify it before logging in.
                    </p>
                  </div>

                  {regError && (
                    <div
                      role="alert"
                      className="mb-3 flex items-center gap-2.5 rounded-xl border border-[#fecaca] bg-[#fef2f2] p-2.5 text-[#991b1b]"
                    >
                      <span className="shrink-0 font-bold text-[#dc2626]" aria-hidden="true">
                        !
                      </span>
                      <span className="min-w-0 text-[12.5px] font-medium leading-tight">
                        {regError}
                      </span>
                    </div>
                  )}

                  <form
                    method="post"
                    onSubmit={handleRegisterSubmit}
                    noValidate
                    aria-busy={regPending}
                    className="flex flex-col gap-2.5"
                  >
                    <div className="flex flex-col gap-1">
                      <label htmlFor="register-name" className="pl-3 text-[11.5px] font-semibold text-[#3b2d63]">
                        Name
                      </label>
                      <div className="relative">
                        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#5B44BA]">
                          <UserIcon />
                        </span>
                        <input
                          ref={regNameInputRef}
                          id="register-name"
                          name="name"
                          type="text"
                          autoComplete="name"
                          maxLength={100}
                          required
                          value={regName}
                          disabled={regPending || activeView !== 'register'}
                          placeholder="Your name"
                          onChange={(event) => {
                            setRegName(event.target.value);
                            setRegError('');
                          }}
                          className={compactFieldBase}
                        />
                      </div>
                    </div>

                    <div className="flex flex-col gap-1">
                      <label htmlFor="register-email" className="pl-3 text-[11.5px] font-semibold text-[#3b2d63]">
                        Email address
                      </label>
                      <div className="relative">
                        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#5B44BA]">
                          <MailIcon />
                        </span>
                        <input
                          id="register-email"
                          name="email"
                          type="email"
                          autoComplete="email"
                          maxLength={255}
                          required
                          value={regEmail}
                          disabled={regPending || activeView !== 'register'}
                          placeholder="you@example.com"
                          onChange={(event) => {
                            setRegEmail(event.target.value);
                            setRegError('');
                          }}
                          className={compactFieldBase}
                        />
                      </div>
                    </div>

                    <div className="flex flex-col gap-1">
                      <label htmlFor="register-password" className="pl-3 text-[11.5px] font-semibold text-[#3b2d63]">
                        Password
                      </label>
                      <div className="relative">
                        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#5B44BA]">
                          <LockIcon />
                        </span>
                        <input
                          id="register-password"
                          name="password"
                          type="password"
                          autoComplete="new-password"
                          minLength={8}
                          maxLength={128}
                          required
                          aria-describedby="register-password-hint"
                          value={regPassword}
                          disabled={regPending || activeView !== 'register'}
                          placeholder="Create a password"
                          onChange={(event) => {
                            setRegPassword(event.target.value);
                            setRegError('');
                          }}
                          className={compactFieldBase}
                        />
                      </div>
                      <p id="register-password-hint" className="pl-3 text-[11px] text-[#6b6680]">
                        Use 8–128 characters.
                      </p>
                    </div>

                    <div className="flex flex-col gap-1">
                      <label htmlFor="register-confirm-password" className="pl-3 text-[11.5px] font-semibold text-[#3b2d63]">
                        Confirm password
                      </label>
                      <div className="relative">
                        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#5B44BA]">
                          <LockIcon />
                        </span>
                        <input
                          id="register-confirm-password"
                          name="confirmPassword"
                          type="password"
                          autoComplete="new-password"
                          minLength={8}
                          maxLength={128}
                          required
                          value={regConfirm}
                          disabled={regPending || activeView !== 'register'}
                          placeholder="Re-enter your password"
                          onChange={(event) => {
                            setRegConfirm(event.target.value);
                            setRegError('');
                          }}
                          className={compactFieldBase}
                        />
                      </div>
                    </div>

                    <Button
                      type="submit"
                      disabled={!hydrated || regPending || activeView !== 'register'}
                      isLoading={regPending}
                      className="mt-1.5 min-h-10 rounded-full bg-[#5B44BA] px-4 py-2 text-[14px] font-semibold text-white shadow-[0_6px_18px_rgba(91,68,186,0.28)] hover:bg-[#4c37a3] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5B44BA]"
                    >
                      Create account
                    </Button>
                  </form>

                  <div className="mt-4 flex justify-center">
                    <Link
                      href="/login"
                      tabIndex={activeView === 'register' ? 0 : -1}
                      onClick={(event) => {
                        event.preventDefault();
                        triggerSlide('login');
                      }}
                      className="inline-flex min-h-8 items-center gap-1.5 text-[13px] font-semibold text-[#5B44BA] underline-offset-2 hover:text-[#47329e] hover:underline"
                    >
                      <ArrowLeftIcon />
                      <span>Back to Log in</span>
                    </Link>
                  </div>
                </div>
              </div>

              {/* Slide 1: User Login */}
              <div
                aria-hidden={activeView !== 'login'}
                className={`flex w-1/3 shrink-0 justify-center px-6 transition-opacity duration-500 ease-out sm:px-12 [@media(max-height:500px)_and_(max-width:1023px)]:px-[14px] ${
                  activeView === 'login'
                    ? 'visible opacity-100'
                    : isSliding
                      ? 'pointer-events-none visible opacity-0'
                      : 'pointer-events-none invisible opacity-0'
                }`}
              >
                <div className="w-full min-w-0 max-w-[340px] [overflow-wrap:anywhere]">
                  <div
                    className="
                      login-heading mb-7 text-center
                      [@media(max-height:500px)_and_(max-width:1023px)]:mb-1
                    "
                  >
                    <h1 className="text-[28px] font-bold tracking-tight text-[#5B44BA] sm:text-[30px]">
                      User login
                    </h1>
                    <p className="mt-1.5 text-[14px] text-[#6e6487]">
                      Welcome to MobG
                    </p>
                  </div>

                  {formError && (
                    <div
                      id="login-form-error"
                      role="alert"
                      className="mb-3 flex items-center gap-3 rounded-xl border border-[#fecaca] bg-[#fef2f2] p-3 text-[#991b1b]"
                    >
                      <span className="shrink-0 font-bold text-[#dc2626]" aria-hidden="true">
                        !
                      </span>
                      <span className="min-w-0 text-[13px] font-medium leading-tight">
                        {formError}
                      </span>
                    </div>
                  )}

                  <p className="sr-only" aria-live="polite" aria-atomic="true">
                    {emailAnnouncement}
                  </p>

                  <form
                    method="post"
                    onSubmit={handleLogin}
                    noValidate
                    className="
                      login-form flex flex-col gap-4
                      [@media(max-height:500px)_and_(max-width:1023px)]:gap-1
                    "
                  >
                    <div className="flex flex-col gap-1.5">
                      <label htmlFor="login-email" className="pl-3 text-[12px] font-semibold text-[#3b2d63]">
                        Email address
                      </label>

                      <div className="relative">
                        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#5B44BA]">
                          <UserIcon />
                        </span>

                        <input
                          ref={emailInputRef}
                          id="login-email"
                          name="email"
                          type="email"
                          autoComplete="email"
                          value={email}
                          disabled={isLoading || activeView !== 'login'}
                          placeholder="you@example.com"
                          aria-invalid={showEmailError}
                          aria-describedby={showEmailError ? 'login-email-error' : undefined}
                          onBlur={() => setEmailTouched(true)}
                          onChange={(event) => handleEmailChange(event.target.value)}
                          className={`
                            ${fieldBase}
                            ${showEmailError ? 'border-[#dc2626] focus:border-[#dc2626] focus:ring-[#dc2626]/20 forced-colors:border-[Mark]' : ''}
                          `}
                        />
                      </div>

                      {showEmailError && (
                        <p
                          id="login-email-error"
                          className="pl-3 text-[12px] font-medium text-[#dc2626]"
                        >
                          {emailValidationError}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label htmlFor="login-password" className="pl-3 text-[12px] font-semibold text-[#3b2d63]">
                        Password
                      </label>

                      <div className="relative">
                        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#5B44BA]">
                          <LockIcon />
                        </span>

                        <input
                          id="login-password"
                          name="password"
                          type="password"
                          autoComplete="current-password"
                          value={password}
                          disabled={isLoading || activeView !== 'login'}
                          placeholder="Enter your password"
                          onChange={(event) => {
                            setPassword(event.target.value);
                            setFormError('');
                          }}
                          className={fieldBase}
                        />
                      </div>

                      <div className="flex justify-end pr-2">
                        <Link
                          href="/forgot-password"
                          tabIndex={activeView === 'login' ? 0 : -1}
                          onClick={(event) => {
                            event.preventDefault();
                            triggerSlide('forgot');
                          }}
                          className="
                            login-forgot inline-flex items-center py-0.5
                            text-[11.5px] font-medium text-[#5B44BA] underline-offset-2 hover:text-[#47329e] hover:underline
                          "
                        >
                          Forgot password?
                        </Link>
                      </div>
                    </div>

                    <Button
                      type="submit"
                      disabled={!hydrated || isLoading || activeView !== 'login'}
                      isLoading={isLoading}
                      className="mt-2 min-h-11 rounded-full bg-[#5B44BA] px-4 py-2.5 text-[14px] font-semibold text-white shadow-[0_6px_18px_rgba(91,68,186,0.28)] hover:bg-[#4c37a3] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5B44BA]"
                    >
                      Log in
                    </Button>
                  </form>

                  <div
                    className="
                      login-links mt-9 flex flex-col items-center gap-1
                      text-[13px]
                      [@media(max-height:500px)_and_(max-width:1023px)]:mt-2
                    "
                  >
                    <p className="text-center text-[#6e6487]">
                      Don&apos;t have an account?{' '}
                      <Link
                        href="/register"
                        tabIndex={activeView === 'login' ? 0 : -1}
                        onClick={(event) => {
                          event.preventDefault();
                          triggerSlide('register');
                        }}
                        className="
                          inline-flex min-h-9 items-center font-semibold text-[#5B44BA] underline-offset-2 hover:text-[#47329e] hover:underline
                          [@media(max-height:500px)_and_(max-width:1023px)]:min-h-6
                        "
                      >
                        Create an account
                      </Link>
                    </p>

                    <Link
                      href="/verify-email"
                      tabIndex={activeView === 'login' ? 0 : -1}
                      className="
                        inline-flex min-h-9 items-center text-[12px] font-medium text-[#5B44BA] underline underline-offset-2 hover:text-[#47329e]
                        [@media(max-height:500px)_and_(max-width:1023px)]:min-h-6
                      "
                    >
                      Resend verification email
                    </Link>
                  </div>
                </div>
              </div>

              {/* Slide 2: Forgot Your Password */}
              <div
                aria-hidden={activeView !== 'forgot'}
                className={`flex w-1/3 shrink-0 justify-center px-6 transition-opacity duration-500 ease-out sm:px-12 [@media(max-height:500px)_and_(max-width:1023px)]:px-[14px] ${
                  activeView === 'forgot'
                    ? 'visible opacity-100'
                    : isSliding
                      ? 'pointer-events-none visible opacity-0'
                      : 'pointer-events-none invisible opacity-0'
                }`}
              >
                <div className="w-full min-w-0 max-w-[340px] [overflow-wrap:anywhere]">
                  <div
                    className="
                      mb-7 text-center
                      [@media(max-height:500px)_and_(max-width:1023px)]:mb-2
                    "
                  >
                    <h2 className="text-[26px] font-bold tracking-tight text-[#5B44BA] sm:text-[28px]">
                      Forgot your password?
                    </h2>
                    <p className="mt-2 text-[13.5px] leading-relaxed text-[#6e6487]">
                      Enter your email to request a password reset link.
                    </p>
                  </div>

                  {forgotError && (
                    <div
                      role="alert"
                      className="mb-4 flex items-center gap-3 rounded-xl border border-[#fecaca] bg-[#fef2f2] p-3 text-[#991b1b]"
                    >
                      <span className="shrink-0 font-bold text-[#dc2626]" aria-hidden="true">
                        !
                      </span>
                      <span className="min-w-0 text-[13px] font-medium leading-tight">
                        {forgotError}
                      </span>
                    </div>
                  )}

                  {forgotDone && (
                    <p
                      role="status"
                      className="mb-5 rounded-2xl border border-[#dcd4ff] bg-[#f7f5ff] p-4 text-[13.5px] leading-6 text-[#231942]"
                    >
                      If an account exists for this email, look for a reset link in your inbox or spam folder.
                    </p>
                  )}

                  {!forgotDone && (
                    <form
                      method="post"
                      onSubmit={handleForgotSubmit}
                      noValidate
                      aria-busy={forgotPending}
                      className="flex flex-col gap-4"
                    >
                      <div className="flex flex-col gap-1.5">
                        <label htmlFor="forgot-email" className="pl-3 text-[12px] font-semibold text-[#3b2d63]">
                          Email address
                        </label>

                        <div className="relative">
                          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#5B44BA]">
                            <UserIcon />
                          </span>

                          <input
                            ref={forgotEmailInputRef}
                            id="forgot-email"
                            name="email"
                            type="email"
                            autoComplete="email"
                            maxLength={255}
                            required
                            value={forgotEmail}
                            disabled={forgotPending || activeView !== 'forgot'}
                            placeholder="you@example.com"
                            onChange={(event) => {
                              setForgotEmail(event.target.value);
                              setForgotError('');
                            }}
                            className={fieldBase}
                          />
                        </div>
                      </div>

                      <Button
                        type="submit"
                        disabled={!hydrated || forgotPending || activeView !== 'forgot'}
                        isLoading={forgotPending}
                        className="mt-2 min-h-11 rounded-full bg-[#5B44BA] px-4 py-2.5 text-[14px] font-semibold text-white shadow-[0_6px_18px_rgba(91,68,186,0.28)] hover:bg-[#4c37a3] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5B44BA]"
                      >
                        Send reset link
                      </Button>
                    </form>
                  )}

                  <div className="mt-8 flex justify-center">
                    <Link
                      href="/login"
                      tabIndex={activeView === 'forgot' ? 0 : -1}
                      onClick={(event) => {
                        event.preventDefault();
                        triggerSlide('login');
                      }}
                      className="inline-flex min-h-9 items-center gap-1.5 text-[13px] font-semibold text-[#5B44BA] underline-offset-2 hover:text-[#47329e] hover:underline"
                    >
                      <ArrowLeftIcon />
                      <span>Back to Log in</span>
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}