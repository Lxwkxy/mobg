import { Suspense } from 'react';

import Sidebar from '@/components/Sidebar';
import Topbar from '@/components/Topbar';
import MainRouteFocus from '@/components/MainRouteFocus';
import { SessionProvider } from '@/lib/SessionProvider';

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SessionProvider>
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <div className="flex min-h-screen flex-col lg:flex-row bg-[#f3efff] text-[#2b2b2b]">
        <Suspense
          fallback={
            <aside className="h-20 lg:h-screen lg:sticky lg:top-0 lg:shrink-0 lg:w-[248px] lg:rounded-br-[32px] bg-white" />
          }
        >
          <Sidebar />
        </Suspense>

        <div className="min-w-0 flex-1 flex flex-col">
          <Suspense
            fallback={
              <header className="h-[72px] bg-white border-b border-[#e7e1ff]" />
            }
          >
            <Topbar />
          </Suspense>

          <main id="main-content" tabIndex={-1} className="min-w-0 p-4 sm:p-6 lg:px-8 lg:py-6 flex-1">
            <Suspense fallback={null}>
              <MainRouteFocus />
            </Suspense>
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
    </SessionProvider>
  );
}
