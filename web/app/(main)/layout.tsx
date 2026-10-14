import { Suspense } from 'react';
import Sidebar from '@/components/Sidebar';
import Topbar from '@/components/Topbar';

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-[#e8e8e8] text-[#2b2b2b]">
      <Suspense
        fallback={
          <aside className="fixed inset-y-0 left-0 w-[240px] border-r border-[#e0e0e0] bg-white" />
        }
      >
        <Sidebar />
      </Suspense>

      <div className="ml-[240px] flex-1 flex flex-col min-h-screen">
        <Topbar />

        <main className="p-[32px_36px] flex-1">
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