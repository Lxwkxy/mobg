
'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { loginApi } from '@/lib/authService';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isLoading) return;

    setError('');

    const cleanedEmail = email.trim();

    if (!cleanedEmail) {
      setError('Please enter your email.');
      return;
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

    if (!emailPattern.test(cleanedEmail)) {
      setError('Please enter a valid email address.');
      return;
    }

    if (!password) {
      setError('Please enter your password.');
      return;
    }

    setIsLoading(true);

    try {
      const result = await loginApi(cleanedEmail, password);

      if (!result.success || !result.user) {
        setError(result.error || 'Login failed. Please try again.');
        return;
      }

      router.replace('/dashboard');
      router.refresh();
    } catch {
      setError('Unable to connect to the server. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f8f7fc] text-[#1e1b2e] flex items-center justify-center p-6">
      <Card className="w-full max-w-[420px] p-[36px_40px]">
        <div className="w-[56px] h-[56px] border-2 border-dashed border-[#8b5cf6] rounded-[14px] bg-[#f3e8ff] text-[#6d28d9] flex items-center justify-center font-bold text-[11px] tracking-wider mb-6">
          LOGO
        </div>

        <h1 className="text-[26px] font-bold text-[#1e1b2e] mb-2">
          Welcome to MobG
        </h1>

        <p className="text-[14px] text-[#6b6680] leading-[1.6] mb-6">
          Log in to manage your projects and tasks.
        </p>

        {error && (
          <div
            role="alert"
            className="mb-5 p-3.5 bg-[#fef2f2] border border-[#fecaca] rounded-xl flex items-center gap-3 text-[#991b1b]"
          >
            <span className="text-[#dc2626] font-bold" aria-hidden="true">
              !
            </span>
            <span className="text-[13px] font-medium leading-tight">
              {error}
            </span>
          </div>
        )}

        <form onSubmit={handleLogin} noValidate className="flex flex-col gap-4">
          <Input
            label="Email address"
            type="email"
            value={email}
            disabled={isLoading}
            onChange={(event) => {
              setEmail(event.target.value);
              setError('');
            }}
            placeholder="you@example.com"
            error={
              error.toLowerCase().includes('email') ||
              error.toLowerCase().includes('invalid')
                ? error
                : undefined
            }
          />

          <Input
            label="Password"
            type="password"
            value={password}
            disabled={isLoading}
            onChange={(event) => {
              setPassword(event.target.value);
              setError('');
            }}
            placeholder="Enter your password"
          />

          <Button
            type="submit"
            isLoading={isLoading}
            className="mt-2"
          >
            Log in
          </Button>
        </form>
      </Card>
    </main>
  );
}
