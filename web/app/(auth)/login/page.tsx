'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useHydrated } from '@/lib/useHydrated';
import { loginApi } from '@/lib/authService';
import { Button } from '@/components/ui/Button';

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 3.6-6 8-6s8 2 8 6z" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
      <path d="M7 10V8a5 5 0 0 1 10 0v2h1a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1zm2 0h6V8a3 3 0 0 0-6 0z" />
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
  [10, 8, 3, 0.7], [28, 14, 2, 0.5], [46, 6, 4, 0.8],
  [64, 12, 2, 0.5], [82, 20, 3, 0.7], [8, 34, 2, 0.5],
  [90, 40, 3, 0.6], [14, 58, 4, 0.7], [34, 70, 2, 0.5],
  [58, 66, 3, 0.6], [78, 78, 2, 0.5], [20, 88, 3, 0.7],
  [48, 92, 2, 0.5], [70, 90, 4, 0.7],
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
            boxShadow: size >= 4 ? '0 0 8px 2px rgba(255,255,255,0.55)' : undefined,
          }}
        />
      ))}
    </div>
  );
}

const cloudBlobs = [
  { top: '4%', size: 56, left: -8 },
  { top: '14%', size: 88, left: -28 },
  { top: '30%', size: 120, left: -46 },
  { top: '50%', size: 150, left: -62 },
  { top: '70%', size: 120, left: -46 },
  { top: '86%', size: 90, left: -30 },
];

const cloudLayers = [
  { extraLeft: -44, extraSize: 34, color: 'rgba(190,150,228,0.35)' },
  { extraLeft: -24, extraSize: 18, color: 'rgba(222,203,242,0.65)' },
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
      <span className="absolute rounded-full bg-white/50" style={{ top: '8%', left: -110, width: 22, height: 22 }} />
      <span className="absolute rounded-full bg-white/40" style={{ top: '40%', left: -150, width: 16, height: 16 }} />
      <span className="absolute rounded-full bg-white/50" style={{ top: '78%', left: -120, width: 26, height: 26 }} />
    </div>
  );
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function validateEmail(value: string): string | null {
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
  'box-border min-w-0 w-full min-h-11 rounded-full border-2 border-[#6a1f86] bg-[#c4aae3] py-2.5 pl-10 pr-4 text-base sm:text-[15px] font-semibold text-[#0d0418] placeholder:font-normal placeholder:text-[#4a2c6b] outline-none transition focus:bg-[#b99bdd] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6a1f86] focus:ring-2 focus:ring-[#6a1f86] forced-colors:border-[CanvasText] forced-colors:focus-visible:outline-[Highlight] forced-colors:focus-visible:outline-solid';

export default function LoginPage() {
  const hydrated = useHydrated();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState('');
  const [emailTouched, setEmailTouched] = useState(false);
  const [emailAnnouncement, setEmailAnnouncement] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Prevent duplicate login requests before React updates isLoading.
  const isSubmitting = useRef(false);

  // Used to distinguish clicking Log in from submitting with Enter.
  const submitFromButton = useRef(false);

  const emailInputRef = useRef<HTMLInputElement>(null);
  const [emailFocusRequest, setEmailFocusRequest] = useState(0);

  useEffect(() => {
    if (emailFocusRequest > 0) {
      emailInputRef.current?.focus();
    }
  }, [emailFocusRequest]);

  const emailValidationError = validateEmail(email);
  const showEmailError = emailTouched && emailValidationError !== null;

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitting.current) return;

    const submittedFromButton = submitFromButton.current;
    submitFromButton.current = false;

    setFormError('');
    setEmailTouched(true);

    const validationError = validateEmail(email);

    if (validationError) {
      setEmailAnnouncement(validationError);

      // Keep focus where it is for Enter submission.
      // Move focus back to email when Log in was clicked.
      if (submittedFromButton) {
        setEmailFocusRequest((current) => current + 1);
      }

      return;
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

    const validationError = validateEmail(value);

    // Once validation has appeared, keep it visible while the email
    // remains invalid. Clear it as soon as the email becomes valid.
    if (!validationError) {
      setEmailTouched(false);
      setEmailAnnouncement('');
    }
  }

  return (
    <main
      className="
        login-main relative flex min-h-[100dvh] items-center justify-center
        overflow-x-hidden bg-[#5f1c7e] p-4 sm:p-6
        lg:bg-[linear-gradient(90deg,#5f1c7e_50%,#d9cbe9_50%)]
        [@media(max-height:500px)_and_(max-width:1023px)]:p-2
      "
      style={{
        minHeight: '100dvh',
        flexShrink: 0,
      }}
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <span className="absolute left-[4%] top-[7%] hidden h-20 w-20 rounded-full bg-[radial-gradient(circle_at_35%_35%,#c93ca6,#8a2a8f_70%)] opacity-70 sm:block" />
        <span className="absolute -left-10 bottom-[6%] h-44 w-44 rounded-full bg-white/10" />
        <span className="absolute left-[18%] top-[38%] hidden h-14 w-14 rounded-full bg-white/10 sm:block" />
        <span className="absolute left-[8%] top-[56%] hidden h-6 w-6 rounded-full bg-white/15 sm:block" />
      </div>

      <Stars points={pageStars} hideOnLarge />

      <div
        className="
          relative z-10 grid w-full max-w-[960px] grid-cols-1
          overflow-hidden rounded-sm bg-white
          shadow-[0_24px_60px_rgba(40,8,60,0.45)]
          lg:min-h-[520px] lg:grid-cols-2
          [@media(max-height:500px)_and_(max-width:1023px)]:min-h-0
          [@media(max-height:500px)_and_(max-width:1023px)]:max-w-[480px]
        "
      >
        <section
          className="
            login-welcome relative flex flex-col items-center justify-center
            gap-8 overflow-hidden
            bg-[linear-gradient(160deg,#7a2a97_0%,#5a1d7a_100%)]
            px-6 py-10 text-center text-white
            sm:px-10 lg:items-start lg:py-14 lg:text-left
            [@media(max-height:500px)_and_(max-width:1023px)]:hidden
          "
        >
          <Stars points={panelStars} />

          <span aria-hidden="true" className="absolute -left-12 bottom-6 h-44 w-44 rounded-full bg-white/10" />
          <span aria-hidden="true" className="absolute left-[38%] top-[58%] hidden h-16 w-16 rounded-full bg-white/10 lg:block" />
          <span aria-hidden="true" className="absolute right-[14%] top-[22%] hidden h-10 w-10 rounded-full bg-[#c93ca6]/30 lg:block" />

          <div className="relative min-w-0 [overflow-wrap:anywhere]">
            <p className="text-[28px] font-light tracking-wide sm:text-[34px]">
              Welcome to MobG
            </p>
            <p className="mt-1 text-[14px] text-white/80">
              Log in to manage your projects and tasks.
            </p>
          </div>

          <div
            aria-hidden="true"
            className="relative flex h-36 w-36 items-center justify-center rounded-3xl border-2 border-dashed border-white/50 text-[12px] font-bold tracking-wider text-white/70 sm:h-44 sm:w-44 lg:h-56 lg:w-56 lg:self-center"
          >
            LOGO
          </div>
        </section>

        <section
          className="
            login-form-panel relative z-10 flex items-center justify-center
            bg-white px-6 py-10 sm:px-12 lg:py-14
            [@media(max-height:500px)_and_(max-width:1023px)]:px-[14px]
            [@media(max-height:500px)_and_(max-width:1023px)]:py-2
          "
        >
          <CloudEdge />

          <div className="relative w-full min-w-0 max-w-[340px] [overflow-wrap:anywhere]">
            <div
              className="
                login-heading mb-6 text-center
                [@media(max-height:500px)_and_(max-width:1023px)]:mb-1
              "
            >
              <h1 className="text-[20px] font-semibold tracking-wide text-[#6a1f86]">
                User login
              </h1>
              <p className="mt-1 text-[12px] text-[#7d6a8c]">
                Welcome to MobG
              </p>
            </div>

            {/* Server/API errors are separate from email validation errors. */}
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

            {/* Live region stays mounted so Enter submission can announce errors. */}
            <p
              className="sr-only"
              aria-live="polite"
              aria-atomic="true"
            >
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
              <div className="flex flex-col gap-1">
                <label htmlFor="login-email" className="pl-3 text-[12px] font-semibold text-[#5a1d7a]">
                  Email address
                </label>

                <div className="relative">
                  <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#2d0a42]">
                    <UserIcon />
                  </span>

                  <input
                    ref={emailInputRef}
                    id="login-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    disabled={isLoading}
                    placeholder="you@example.com"
                    aria-invalid={showEmailError}
                    aria-describedby={showEmailError ? 'login-email-error' : undefined}
                    onBlur={() => setEmailTouched(true)}
                    onChange={(event) => handleEmailChange(event.target.value)}
                    className={`
                      ${fieldBase}
                      ${showEmailError ? 'border-[#991b1b] forced-colors:border-[Mark]' : ''}
                    `}
                  />
                </div>

                {showEmailError && (
                  <p
                    id="login-email-error"
                    className="pl-3 text-[12px] font-medium text-[#991b1b]"
                  >
                    {emailValidationError}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="login-password" className="pl-3 text-[12px] font-semibold text-[#5a1d7a]">
                  Password
                </label>

                <div className="relative">
                  <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#2d0a42]">
                    <LockIcon />
                  </span>

                  <input
                    id="login-password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    disabled={isLoading}
                    placeholder="Enter your password"
                    onChange={(event) => {
                      setPassword(event.target.value);
                      setFormError('');
                    }}
                    className={fieldBase}
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <Link
                  href="/forgot-password"
                  className="
                    login-forgot inline-flex min-h-11 items-center
                    text-[12px] text-[#6a1f86] underline
                    [@media(max-height:500px)_and_(max-width:1023px)]:min-h-6
                  "
                >
                  Forgot password?
                </Link>
              </div>

              <Button
                type="submit"
                onClick={() => {
                  submitFromButton.current = true;
                }}
                disabled={!hydrated || isLoading}
                isLoading={isLoading}
                className="mt-1 min-h-11 rounded-sm bg-[#6a1f86] px-4 py-2.5 text-[14px] hover:bg-[#561670] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6a1f86]"
              >
                Log in
              </Button>
            </form>

            <div
              className="
                login-links mt-3 flex flex-col items-center
                text-[13px] text-[#6a1f86]
                [@media(max-height:500px)_and_(max-width:1023px)]:mt-1
              "
            >
              <Link
                href="/register"
                className="
                  inline-flex min-h-11 items-center underline
                  [@media(max-height:500px)_and_(max-width:1023px)]:min-h-6
                "
              >
                Create an account
              </Link>

              <Link
                href="/verify-email"
                className="
                  inline-flex min-h-11 items-center underline
                  [@media(max-height:500px)_and_(max-width:1023px)]:min-h-6
                "
              >
                Resend verification email
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}