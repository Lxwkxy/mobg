import { Suspense } from 'react';
import Sidebar from '@/components/Sidebar';
import Topbar from '@/components/Topbar';

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col lg:flex-row bg-[#e8e8e8] text-[#2b2b2b]">
      <Suspense
        fallback={
          <aside className="h-24 lg:h-auto lg:fixed lg:inset-y-0 lg:left-0 lg:w-[240px] border-r border-[#e0e0e0] bg-white" />
        }
      >
        <Sidebar />
      </Suspense>

      <div className="min-w-0 lg:ml-[240px] flex-1 flex flex-col min-h-screen">
        <Topbar />

        <main className="min-w-0 p-4 sm:p-6 lg:p-[32px_36px] flex-1">
          <Suspense
            fallback={
              <p className="text-[13px] text-[#777777]">
                Loading page...
              </p>
            }
          >
            {children}
          </Suspense>
        </main>
      </div>
    </div>
  );
}
