'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email) {
      setError('Please enter your email.');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError('Please enter a valid email.');
      return;
    }

    if (!password) {
      setError('Please enter your password.');
      return;
    }

    const usersStr = localStorage.getItem('mobg_demo_users') || '[]';
    const users = JSON.parse(usersStr);
    const user = users.find((u: any) => u.email === email.toLowerCase());

    if (!user) {
      setError('Account not found. Please register first.');
      return;
    }

    if (user.password !== password) {
      setError('Incorrect password. Please try again.');
      return;
    }

    localStorage.setItem('mobg_current_user', JSON.stringify({ name: user.name, email: user.email }));
    router.push('/dashboard');
  };

  return (
    <main className="min-h-screen bg-[#f8f7fc] text-[#1e1b2e] flex items-center justify-center p-6">
      <div className="w-full max-w-[420px] bg-white border border-[#e9e5f5] rounded-2xl p-[36px_40px] shadow-[0_10px_32px_rgba(109,40,217,0.06)]">
        {/* LOGO */}
        <div className="w-[56px] h-[56px] border-2 border-dashed border-[#8b5cf6] rounded-[14px] bg-[#f3e8ff] text-[#6d28d9] flex items-center justify-center font-bold text-[11px] tracking-wider mb-6">
          LOGO
        </div>

        <h1 className="text-[26px] font-bold text-[#1e1b2e] mb-2">Welcome to MobG</h1>
        <p className="text-[14px] text-[#6b6680] leading-[1.6] mb-6">
          Log in to manage your projects and tasks.
        </p>

        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          <div className="flex flex-col">
            <label className="text-[14px] font-semibold text-[#3b3554] mb-1.5">Email address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full p-[12px_14px] border border-[#e2dcf2] rounded-lg outline-none focus:border-[#6D28D9] focus:ring-2 focus:ring-[#6D28D9]/15 text-[14px]"
            />
          </div>

          <div className="flex flex-col">
            <label className="text-[14px] font-semibold text-[#3b3554] mb-1.5">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              className="w-full p-[12px_14px] border border-[#e2dcf2] rounded-lg outline-none focus:border-[#6D28D9] focus:ring-2 focus:ring-[#6D28D9]/15 text-[14px]"
            />
          </div>

          {error && <p className="text-[#dc2626] text-[13px] font-medium -mt-1">{error}</p>}

          <button
            type="submit"
            className="w-full mt-1 p-3 bg-[#6D28D9] hover:bg-[#5B21B6] text-white rounded-lg text-[15px] font-semibold transition-colors cursor-pointer"
          >
            Log in
          </button>
        </form>

        <p className="mt-5 text-center text-[14px] text-[#6b6680]">
          Don't have an account?{' '}
          <Link href="/register" className="text-[#6D28D9] font-semibold hover:underline">
            Register
          </Link>
        </p>
      </div>
    </main>
  );
}