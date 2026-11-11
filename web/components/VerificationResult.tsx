'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import AccountForm from '@/components/AccountForm';
import AuthCard from '@/components/AuthCard';

export default function VerificationResult() {
  const params = useSearchParams();
  if (params.get('error')) return <AccountForm mode="verify" linkError="This verification link is invalid or expired. Request a new link below." />;
  if (params.get('verified') === '1') return (
    <AuthCard title="Email verified" description="You can now log in to your account.">
      <Link href="/login" className="flex min-h-11 w-full items-center justify-center rounded-lg bg-[#6d28d9] px-4 text-sm font-semibold text-white hover:bg-[#5b21b6] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6d28d9]">Log in</Link>
    </AuthCard>
  );
  return <AccountForm mode="verify" />;
}
