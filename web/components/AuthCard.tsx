import type { ReactNode } from 'react';
import { Card } from '@/components/ui/Card';

export default function AuthCard({ title, description, children }: {
  title: string; description: string; children: ReactNode;
}) {
  return (
    <main className="min-h-dvh bg-[#f8f7fc] text-[#1e1b2e] flex flex-col items-center p-4 sm:p-6">
      <Card className="my-auto min-w-0 w-full max-w-[420px] p-5 sm:p-[36px_40px] [overflow-wrap:anywhere]">
        <p className="mb-5 font-bold text-[#6d28d9]">MobG</p>
        <h1 className="mb-2 text-[26px] font-bold">{title}</h1>
        <p className="mb-6 text-[14px] leading-6 text-[#6b6680]">{description}</p>
        {children}
      </Card>
    </main>
  );
}
