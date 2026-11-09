'use client';
import { useSearchParams } from 'next/navigation';
import AccountForm from '@/components/AccountForm';
export default function ResetPasswordForm() {
  const params = useSearchParams();
  return <AccountForm mode="reset" token={params.get('token') || undefined}
    linkError={params.get('error') ? 'This reset link is invalid or expired.' : undefined} />;
}
