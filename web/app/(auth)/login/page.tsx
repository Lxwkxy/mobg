'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { loginApi, MOCK_USERS } from '@/lib/authService';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [simulateServerError, setSimulateServerError] = useState(false); // สำหรับทดสอบระบบล่ม
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return; // ป้องกันการกดซ้ำระหว่างส่ง

    setError('');

    const cleanedEmail = email.replace(/\s+/g, '').trim();

    // Validations พื้นฐาน
    if (!cleanedEmail) {
      setError('Please enter your email.');
      return;
    }

    const emailParts = cleanedEmail.split('@');
    const isValidEmail =
      emailParts.length === 2 &&
      emailParts[0].length > 0 &&
      emailParts[1].includes('.') &&
      emailParts[1].split('.')[1].length >= 2;

    if (!isValidEmail) {
      setError('Please enter a valid email (e.g. name@example.com).');
      return;
    }

    if (!password) {
      setError('Please enter your password.');
      return;
    }

    // เริ่มการส่งข้อมูล (Set Loading & Lock Button)
    setIsLoading(true);

    try {
      // เรียกใช้ Mock Login API (ที่แยกส่วนออกมา)
      const res = await loginApi(cleanedEmail, password, simulateServerError);

      if (!res.success) {
        setError(res.error || 'Login failed');
        return;
      }

      // บันทึกข้อมูลผลลัพธ์ { userId, userName, email } ลงใน localStorage
      if (res.user) {
        localStorage.setItem('mobg_current_user', JSON.stringify(res.user));
        router.push('/dashboard');
      }
    } catch (err) {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false); // คืนสถานะเมื่อทำงานเสร็จ
    }
  };

  // Helper เติมข้อมูลบัญชี Mock ทันที
  const fillMockAccount = (mockEmail: string) => {
    setEmail(mockEmail);
    setPassword('password123');
    setError('');
  };

  return (
    <main className="min-h-screen bg-[#f8f7fc] text-[#1e1b2e] flex items-center justify-center p-6">
      <Card className="w-full max-w-[420px] p-[36px_40px]">
        {/* LOGO */}
        <div className="w-[56px] h-[56px] border-2 border-dashed border-[#8b5cf6] rounded-[14px] bg-[#f3e8ff] text-[#6d28d9] flex items-center justify-center font-bold text-[11px] tracking-wider mb-6">
          LOGO
        </div>

        <h1 className="text-[26px] font-bold text-[#1e1b2e] mb-2">Welcome to MobG</h1>
        <p className="text-[14px] text-[#6b6680] leading-[1.6] mb-6">
          Log in to manage your projects and tasks.
        </p>

        {/* ERROR ALERT BOX */}
        {error && (
          <div className="mb-5 p-3.5 bg-[#fef2f2] border border-[#fecaca] rounded-xl flex items-center gap-3 text-[#991b1b]">
            <svg className="w-5 h-5 text-[#dc2626] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <span className="text-[13px] font-medium leading-tight">{error}</span>
          </div>
        )}

        {/* FORM */}
        <form onSubmit={handleLogin} noValidate className="flex flex-col gap-4">
          <Input
            label="Email address"
            type="email"
            value={email}
            disabled={isLoading}
            onChange={(e) => {
              setEmail(e.target.value);
              if (error) setError('');
            }}
            placeholder="you@example.com"
            error={error && (error.includes('email') || error.includes('Invalid')) ? error : undefined}
          />

          <Input
            label="Password"
            type="password"
            value={password}
            disabled={isLoading}
            onChange={(e) => {
              setPassword(e.target.value);
              if (error) setError('');
            }}
            placeholder="Enter your password"
            error={error && (error.includes('password') || error.includes('Invalid')) ? error : undefined}
          />

          <Button type="submit" isLoading={isLoading} className="mt-2">
            Log in
          </Button>
        </form>

        {/* MOCK ACCOUNTS & TESTING TOOLBAR */}
        <div className="mt-6 pt-5 border-t border-[#f0ebfc] flex flex-col gap-2.5">
          <p className="text-[12px] font-semibold text-[#6b6680] uppercase tracking-wider">
            Quick Test Accounts
          </p>
          <div className="flex flex-wrap gap-2">
            {MOCK_USERS.map((user) => (
              <button
                key={user.userId}
                type="button"
                onClick={() => fillMockAccount(user.email)}
                className="text-[12px] bg-[#f3e8ff] text-[#6d28d9] hover:bg-[#e9d5ff] px-2.5 py-1 rounded-md transition-colors font-medium"
              >
                {user.userName} ({user.email})
              </button>
            ))}
          </div>

          {/* Toggle สำหรับทดสอบกรณี Server ล่ม */}
          <label className="flex items-center gap-2 mt-2 cursor-pointer text-[12px] text-[#6b6680]">
            <input
              type="checkbox"
              checked={simulateServerError}
              onChange={(e) => setSimulateServerError(e.target.checked)}
              className="rounded border-gray-300 text-[#6D28D9] focus:ring-[#6D28D9]"
            />
            <span>Simulate Server/Network Error (ทดสอบกรณีระบบล่ม)</span>
          </label>
        </div>
      </Card>
    </main>
  );
}