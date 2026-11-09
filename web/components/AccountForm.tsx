'use client';

import { useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AuthCard from '@/components/AuthCard';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { registerAccount, requestPasswordReset, resendVerification, resetAccountPassword } from '@/lib/accountService';
import { useHydrated } from '@/lib/useHydrated';

type Mode = 'register' | 'forgot' | 'reset' | 'verify';
const copy = {
  register: { title: 'Create your account', description: 'Sign up to manage projects and tasks with your team.', action: 'Create account' },
  forgot: { title: 'Forgot your password?', description: 'Enter your email to request a password reset link.', action: 'Send reset link' },
  reset: { title: 'Choose a new password', description: 'Use 8–128 characters. Your other sessions will be signed out.', action: 'Reset password' },
  verify: { title: 'Check your email', description: 'Open the verification email before logging in. Need a new link? Enter your email below.', action: 'Resend verification email' },
};

export default function AccountForm({ mode, token, linkError }: { mode: Mode; token?: string; linkError?: string }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const hasPassword = mode === 'register' || mode === 'reset';
  const invalidReset = mode === 'reset' && !done && (!token || Boolean(linkError));
  const content = copy[mode];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    setError('');
    const normalizedEmail = email.trim().toLowerCase();
    if (mode === 'register' && (!name.trim() || name.trim().length > 100)) {
      setError('Enter a name between 1 and 100 characters.'); return;
    }
    if (mode !== 'reset' && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || normalizedEmail.length > 255)) {
      setError('Enter a valid email address.'); return;
    }
    if (hasPassword && (password.length < 8 || password.length > 128)) {
      setError('Use a password between 8 and 128 characters.'); return;
    }
    if (hasPassword && password !== confirmation) { setError('Passwords do not match.'); return; }
    if (invalidReset) return;
    busy.current = true; setPending(true);
    try {
      if (mode === 'register') {
        await registerAccount(name.trim(), normalizedEmail, password);
        router.replace('/verify-email');
      } else {
        if (mode === 'forgot') await requestPasswordReset(normalizedEmail);
        if (mode === 'verify') await resendVerification(normalizedEmail);
        if (mode === 'reset') await resetAccountPassword(token!, password);
        setDone(true); setPassword(''); setConfirmation('');
        if (mode === 'reset') window.history.replaceState(null, '', '/reset-password');
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to connect. Please try again.');
    } finally { busy.current = false; setPending(false); }
  }

  return (
    <AuthCard title={content.title} description={content.description}>
      {linkError && <p role="alert" className="mb-4 text-sm text-red-700">{linkError}</p>}
      {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {invalidReset ? (
        <p className="text-sm">This reset link is missing or expired. <Link className="underline text-[#6d28d9]" href="/forgot-password">Request a new link</Link>.</p>
      ) : done ? (
        <p role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-800">
          {mode === 'reset' ? 'Your password has been reset. Log in with your new password.'
            : mode === 'forgot' ? 'If an account exists for this email, a reset link has been sent. Check your inbox.'
              : 'If this account needs verification, a new link has been sent. Check your inbox.'}
        </p>
      ) : (
        <form method="post" onSubmit={submit} noValidate className="flex flex-col gap-4">
          {mode === 'register' && <Input label="Name" name="name" autoComplete="name" maxLength={100} required
            value={name} disabled={pending} onChange={event => setName(event.target.value)} />}
          {mode !== 'reset' && <Input label="Email address" name="email" type="email" autoComplete="email" maxLength={255} required
            value={email} disabled={pending} onChange={event => setEmail(event.target.value)} />}
          {hasPassword && <>
            <Input label="Password" name="password" type="password" autoComplete="new-password" minLength={8} maxLength={128} required
              value={password} disabled={pending} onChange={event => setPassword(event.target.value)} />
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
