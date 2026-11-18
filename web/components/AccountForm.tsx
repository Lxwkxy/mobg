'use client';

import { useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import AuthCard from '@/components/AuthCard';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import {
  resendVerification,
  resetAccountPassword,
} from '@/lib/accountService';
import {
  normalizeAccountEmail,
  usePasswordResetRequestAction,
  useRegisterAction,
  validateAccountEmail,
  validateAccountPassword,
} from '@/lib/useAccountActions';
import { useHydrated } from '@/lib/useHydrated';

type Mode = 'register' | 'forgot' | 'reset' | 'verify';
const copy = {
  register: { title: 'Create your account', description: 'Use an email address you can access. You’ll need to verify it before logging in.', action: 'Create account' },
  forgot: { title: 'Forgot your password?', description: 'Enter your email to request a password reset link.', action: 'Send reset link' },
  reset: { title: 'Choose a new password', description: 'Use 8–128 characters. Your other sessions will be signed out.', action: 'Reset password' },
  verify: { title: 'Check your email', description: 'Look for a verification message from MobG in your inbox or spam folder. Enter your email below if you need a new link.', action: 'Resend verification email' },
};

export default function AccountForm({ mode, token, linkError }: { mode: Mode; token?: string; linkError?: string }) {
  const hydrated = useHydrated();
  const busy = useRef(false);
  const [localPending, setLocalPending] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [localError, setLocalError] = useState('');
  const [localDone, setLocalDone] = useState(false);

  const registerAction = useRegisterAction();
  const forgotAction = usePasswordResetRequestAction();

  const pending =
    mode === 'register'
      ? registerAction.pending
      : mode === 'forgot'
        ? forgotAction.pending
        : localPending;

  const error =
    mode === 'register'
      ? registerAction.error
      : mode === 'forgot'
        ? forgotAction.error
        : localError;

  const done = mode === 'forgot' ? forgotAction.done : localDone;

  const hasPassword = mode === 'register' || mode === 'reset';
  const invalidReset = mode === 'reset' && !done && (!token || Boolean(linkError));
  const content = copy[mode];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (mode === 'register') {
      await registerAction.submitRegister({
        name,
        email,
        password,
        confirmation,
      });
      return;
    }

    if (mode === 'forgot') {
      await forgotAction.submitPasswordResetRequest(email);
      return;
    }

    if (busy.current) return;
    setLocalError('');

    if (mode === 'verify') {
      const emailError = validateAccountEmail(email);
      if (emailError) {
        setLocalError(emailError);
        return;
      }
    }

    if (mode === 'reset') {
      const passwordError = validateAccountPassword(password, confirmation);
      if (passwordError) {
        setLocalError(passwordError);
        return;
      }
      if (invalidReset) return;
    }

    setLocalDone(false);
    busy.current = true;
    setLocalPending(true);

    try {
      if (mode === 'verify') {
        await resendVerification(normalizeAccountEmail(email));
      } else if (mode === 'reset') {
        await resetAccountPassword(token!, password);
      }

      setLocalDone(true);
      setPassword('');
      setConfirmation('');
      if (mode === 'reset') window.history.replaceState(null, '', '/reset-password');
    } catch (cause) {
      setLocalError(cause instanceof Error ? cause.message : 'Unable to connect. Please try again.');
    } finally {
      busy.current = false;
      setLocalPending(false);
    }
  }

  return (
    <AuthCard title={content.title} description={content.description}>
      {linkError && !done && <p role="alert" className="mb-4 text-sm text-red-700">{linkError}</p>}
      {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {done && (
        <p role="status" className="mb-4 rounded-lg border border-violet-100 bg-violet-50 p-3 text-sm leading-6 text-violet-950">
          {mode === 'reset' ? 'Your password has been reset. Log in with your new password.'
            : mode === 'forgot' ? 'If an account exists for this email, look for a reset link in your inbox or spam folder.'
              : 'If this account needs verification, look for a new link in your inbox or spam folder.'}
        </p>
      )}
      {invalidReset && (
        <p className="text-sm">This reset link is missing or expired. <Link className="underline text-[#6d28d9]" href="/forgot-password">Request a new link</Link>.</p>
      )}
      {!invalidReset && (!done || mode === 'verify') && (
        <form method="post" onSubmit={submit} noValidate aria-busy={pending} className="flex flex-col gap-4">
          {mode === 'register' && <Input label="Name" name="name" autoComplete="name" maxLength={100} required
            value={name} disabled={pending} onChange={event => setName(event.target.value)} />}
          {mode !== 'reset' && <Input label="Email address" name="email" type="email" autoComplete="email" placeholder="you@example.com" maxLength={255} required
            value={email} disabled={pending} onChange={event => setEmail(event.target.value)} />}
          {hasPassword && <>
            <Input label="Password" name="password" type="password" autoComplete="new-password" minLength={8} maxLength={128} required
              aria-describedby={mode === 'register' ? 'register-password-hint' : undefined}
              value={password} disabled={pending} onChange={event => setPassword(event.target.value)} />
            {mode === 'register' && <p id="register-password-hint" className="-mt-2 text-xs text-[#6b6680]">Use 8–128 characters.</p>}
            <Input label="Confirm password" name="confirmPassword" type="password" autoComplete="new-password" minLength={8} maxLength={128} required
              value={confirmation} disabled={pending} onChange={event => setConfirmation(event.target.value)} />
          </>}
          <Button type="submit" disabled={!hydrated} isLoading={pending}>{content.action}</Button>
          {mode === 'reset' && <Link href="/forgot-password" className="inline-flex min-h-11 items-center text-sm text-[#6d28d9] underline">Request a new link</Link>}
        </form>
      )}
      <Link href="/login" className="mt-5 inline-flex min-h-11 items-center text-sm font-medium text-[#6d28d9] underline">Back to Log in</Link>
    </AuthCard>
  );
}