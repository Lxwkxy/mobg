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
      <Link href="/login" className="inline-flex min-h-11 items-center text-[#6d28d9] underline">Log in</Link>
    </AuthCard>
  );
  return <AccountForm mode="verify" />;
}
