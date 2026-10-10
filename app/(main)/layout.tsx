import Sidebar from '@/components/Sidebar';
import Topbar from '@/components/Topbar';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-[#e8e8e8] text-[#2b2b2b]">
      <Sidebar />
      <div className="ml-[240px] flex-1 flex flex-col min-h-screen">
        <Topbar />
        <main className="p-[32px_36px] flex-1">{children}</main>
      </div>
    </div>
  );
}