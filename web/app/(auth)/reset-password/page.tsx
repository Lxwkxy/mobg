import { Suspense } from 'react';
import ResetPasswordForm from '@/components/ResetPasswordForm';
export const metadata = { referrer: 'no-referrer' as const };
export default function ResetPasswordPage() {
  return <Suspense fallback={<p>Loading reset form...</p>}><ResetPasswordForm /></Suspense>;
}
