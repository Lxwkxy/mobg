'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Sidebar() {
  const pathname = usePathname();

  const navItems = [
    { name: 'Overview', href: '/dashboard' },
    { name: 'Projects', href: '/projects' },
    { name: 'My tasks', href: '/mytasks' },
  ];

  return (
    <aside className="w-[240px] bg-white p-8 flex flex-col fixed inset-y-0 left-0 z-10 border-r border-[#e0e0e0]">
      {/* Brand Logo */}
      <div className="flex items-center gap-3 text-[22px] font-bold text-[#1f1f1f] mb-9">
        <div className="w-5 h-5 bg-[#222222] rounded-full" />
        <span>MobG</span>
      </div>

      {/* Navigation */}
      <div className="text-[12px] text-[#8c8c8c] mb-3">Menu</div>
      <nav className="flex flex-col gap-1.5">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`px-4 py-2.5 rounded-[10px] text-[14px] font-medium transition-all ${
                isActive
                  ? 'bg-[#e8e8e8] text-[#111111] font-semibold'
                  : 'text-[#555555] hover:bg-[#f2f2f2]'
              }`}
            >
              {item.name}
            </Link>
          );
        })}
      </nav>

      {/* Sidebar Bottom Banner */}
      <div className="mt-auto">
        <div className="bg-[#f4f4f4] p-5 rounded-[14px]">
          <strong className="block text-[13px] text-[#1f1f1f] mb-2">
            See the big picture
          </strong>
          <p className="m-0 text-[11px] text-[#777777] leading-[1.5]">
            Check your projects, upcoming tasks, and deadlines at a glance.
          </p>
        </div>
      </div>
    </aside>
  );
}