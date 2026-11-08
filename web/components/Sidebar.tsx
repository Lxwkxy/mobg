'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useId, useRef, useState } from 'react';

export default function Sidebar() {
  const pathname = usePathname();
  const [openPath, setOpenPath] = useState<string | null>(null);
  const isOpen = openPath === pathname;
  const menuId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);

  const navItems = [
    { name: 'Overview', href: '/dashboard' },
    { name: 'Projects', href: '/projects' },
    { name: 'My tasks', href: '/mytasks' },
  ];

  return (
    <aside onKeyDown={(event) => {
      if (event.key === 'Escape' && isOpen) {
        setOpenPath(null);
        toggleRef.current?.focus();
      }
    }} className="w-full lg:w-[240px] bg-white p-4 lg:p-8 flex flex-col lg:fixed lg:inset-y-0 lg:left-0 lg:overflow-y-auto z-10 border-b lg:border-r border-[#e0e0e0]">
      {/* Brand Logo */}
      <div className="flex items-center gap-3 text-[22px] font-bold text-[#1f1f1f] mb-3 lg:mb-9">
        <div className="w-5 h-5 bg-[#222222] rounded-full" />
        <span>MobG</span>
        <button ref={toggleRef} type="button" aria-label="Menu" aria-expanded={isOpen}
          aria-controls={menuId} onClick={() => setOpenPath(isOpen ? null : pathname)}
          className="ml-auto min-h-11 min-w-11 rounded-lg border border-[#e0e0e0] px-3 text-[14px] lg:hidden">
          {isOpen ? 'Close menu' : 'Menu'}
        </button>
      </div>

      {/* Navigation */}
      <div className="hidden lg:block text-[12px] text-[#8c8c8c] mb-3">Menu</div>
      <nav id={menuId} aria-label="Main navigation" className={`${isOpen ? 'flex' : 'hidden'} flex-col lg:flex gap-1.5`}>
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? 'page' : undefined}
              onClick={() => setOpenPath(null)}
              className={`min-h-11 px-3 lg:px-4 py-2.5 rounded-[10px] text-[14px] font-medium transition-all ${
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
      <div className="hidden lg:block mt-auto">
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
