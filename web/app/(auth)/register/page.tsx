'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function RegisterPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // 1. Check empty name
    if (!name.trim()) {
      setError('Please enter your full name.');
      return;
    }

    // 2. Check empty email
    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }

    // 3. Check email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      setError('Please enter a valid email address (e.g. name@example.com).');
      return;
    }

    // 4. Check password length
    if (!password || password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    // 5. Check password match
    if (password !== confirmPassword) {
      setError('Passwords do not match. Please check again.');
      return;
    }

    // 6. Check duplicate email in system
    const usersStr = localStorage.getItem('mobg_demo_users') || '[]';
    const users = JSON.parse(usersStr);

    if (users.some((u: any) => u.email === email.trim().toLowerCase())) {
      setError('This email is already registered.');
      return;
    }

    // ผ่านการตรวจ -> บันทึกบัญชีใหม่และเข้าสู่ระบบ
    const newUser = {
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password,
    };

    users.push(newUser);
    localStorage.setItem('mobg_demo_users', JSON.stringify(users));
    localStorage.setItem(
      'mobg_current_user',
      JSON.stringify({ name: newUser.name, email: newUser.email })
    );

    router.push('/dashboard');
  };

  return (
    <main className="min-h-screen bg-[#f8f7fc] text-[#1e1b2e] flex items-center justify-center p-6">
      <div className="w-full max-w-[420px] bg-white border border-[#e9e5f5] rounded-2xl p-[36px_40px] shadow-[0_10px_32px_rgba(109,40,217,0.06)]">
        {/* LOGO PLACEHOLDER */}
        <div className="w-[56px] h-[56px] border-2 border-dashed border-[#8b5cf6] rounded-[14px] bg-[#f3e8ff] text-[#6d28d9] flex items-center justify-center font-bold text-[11px] tracking-wider mb-6">
          LOGO
        </div>

        <h1 className="text-[26px] font-bold text-[#1e1b2e] mb-2">Create an account</h1>
        <p className="text-[14px] text-[#6b6680] leading-[1.6] mb-6">
          Join MobG to organize your projects and tasks.
        </p>

        <form onSubmit={handleRegister} className="flex flex-col gap-4">
          <div className="flex flex-col">
            <label className="text-[14px] font-semibold text-[#3b3554] mb-1.5">Full name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your full name"
              className="w-full p-[12px_14px] border border-[#e2dcf2] rounded-lg outline-none focus:border-[#6D28D9] focus:ring-2 focus:ring-[#6D28D9]/15 text-[14px]"
            />
          </div>

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
              placeholder="At least 6 characters"
              className="w-full p-[12px_14px] border border-[#e2dcf2] rounded-lg outline-none focus:border-[#6D28D9] focus:ring-2 focus:ring-[#6D28D9]/15 text-[14px]"
            />
          </div>

          <div className="flex flex-col">
            <label className="text-[14px] font-semibold text-[#3b3554] mb-1.5">Confirm password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Enter your password again"
              className="w-full p-[12px_14px] border border-[#e2dcf2] rounded-lg outline-none focus:border-[#6D28D9] focus:ring-2 focus:ring-[#6D28D9]/15 text-[14px]"
            />
          </div>

          {error && <p className="text-[#dc2626] text-[13px] font-medium -mt-1">{error}</p>}

          <button
            type="submit"
            className="w-full mt-1 p-3 bg-[#6D28D9] hover:bg-[#5B21B6] text-white rounded-lg text-[15px] font-semibold transition-colors cursor-pointer"
          >
            Create account
          </button>
        </form>

        <p className="mt-5 text-center text-[14px] text-[#6b6680]">
          Already have an account?{' '}
          <Link href="/login" className="text-[#6D28D9] font-semibold hover:underline">
            Log in
          </Link>
        </p>
      </div>
    </main>
  );
}