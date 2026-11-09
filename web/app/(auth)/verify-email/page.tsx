import { Suspense } from 'react';
import VerificationResult from '@/components/VerificationResult';
export default function VerifyEmailPage() {
  return <Suspense fallback={<p>Loading verification...</p>}><VerificationResult /></Suspense>;
}
