'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';

function MobGLogo() {
  return (
    <svg
      width="44"
      height="51"
      viewBox="0 0 100 116"
      fill="none"
      aria-hidden="true"
      className="shrink-0"
    >
      {/* กรอบตัว G สีขาว */}
      <path
        d="M10 4H90V24H30V74H70V60H55V42H90V92H10V4Z"
        fill="#FFFFFF"
      />

      {/* ขอบสีม่วงพื้นหลังตัดรอบตัวอักษร MOB */}
      <g
        stroke="#5B44BA"
        strokeWidth="14.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M14 109V84L25 96L36 84V109" />
        <rect x="43" y="84" width="19" height="25" rx="9.5" />
        <path d="M72 84H80.5C84.5 84 87 86.5 87 90C87 93.2 84.8 95.5 81.5 96C85.5 96.5 88 99 88 102.8C88 106.8 85 109 80.5 109H72V84ZM72 96H81.5" />
      </g>

      {/* ตัวอักษร MOB สีขาว */}
      <g
        stroke="#FFFFFF"
        strokeWidth="6.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M14 109V84L25 96L36 84V109" />
        <rect x="43" y="84" width="19" height="25" rx="9.5" />
        <path d="M72 84H80.5C84.5 84 87 86.5 87 90C87 93.2 84.8 95.5 81.5 96C85.5 96.5 88 99 88 102.8C88 106.8 85 109 80.5 109H72V84ZM72 96H81.5" />
      </g>
    </svg>
  );
}

function WorkIllustration() {
  return (
    <svg
      width="208"
      height="146"
      viewBox="0 0 220 155"
      fill="none"
      aria-hidden="true"
      className="mx-auto block"
    >
      {/* พื้นหลังวงรีโปร่งแสงรับกับพื้นสีม่วง */}
      <ellipse cx="110" cy="86" rx="88" ry="56" fill="#FFFFFF" fillOpacity="0.12" />

      {/* การ์ด Task & Checklist ลอยด้านหลัง */}
      <rect
        x="36"
        y="15"
        width="114"
        height="68"
        rx="10"
        fill="#FFFFFF"
        stroke="#DDD6FE"
        strokeWidth="1.5"
      />
      <circle cx="46" cy="24" r="2" fill="#C4B5FD" />
      <circle cx="53" cy="24" r="2" fill="#C4B5FD" />
      <circle cx="60" cy="24" r="2" fill="#C4B5FD" />

      {/* รายการที่ 1 (ติ๊กถูกแล้ว) */}
      <rect x="46" y="32" width="10" height="10" rx="2.5" fill="#5B44BA" />
      <path
        d="M48.5 37L50.3 38.8L53.8 35"
        stroke="#FFFFFF"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="62" y="35" width="52" height="4" rx="2" fill="#DDD6FE" />

      {/* รายการที่ 2 (ติ๊กถูกแล้ว) */}
      <rect x="46" y="47" width="10" height="10" rx="2.5" fill="#5B44BA" />
      <path
        d="M48.5 52L50.3 53.8L53.8 50"
        stroke="#FFFFFF"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="62" y="50" width="38" height="4" rx="2" fill="#EDE9FE" />

      {/* รายการที่ 3 (กำลังทำ) */}
      <rect
        x="46"
        y="62"
        width="10"
        height="10"
        rx="2.5"
        fill="#FFF4E5"
        stroke="#FFB74D"
        strokeWidth="1.3"
      />
      <rect x="62" y="65" width="46" height="4" rx="2" fill="#EDE9FE" />

      {/* การ์ดกราฟความคืบหน้ามุมขวาบน */}
      <rect
        x="136"
        y="24"
        width="48"
        height="34"
        rx="8"
        fill="#FFFFFF"
        stroke="#DDD6FE"
        strokeWidth="1.5"
      />
      <rect x="145" y="44" width="6" height="8" rx="2" fill="#C4B5FD" />
      <rect x="155" y="39" width="6" height="13" rx="2" fill="#8B5CF6" />
      <rect x="165" y="33" width="6" height="19" rx="2" fill="#5B44BA" />

      {/* ประกายดาวตกแต่ง */}
      <path
        d="M28 46L29.6 50.4L34 52L29.6 53.6L28 58L26.4 53.6L22 52L26.4 50.4L28 46Z"
        fill="#FBBF24"
      />
      <path
        d="M192 70L193.2 73.3L196.5 74.5L193.2 75.7L192 79L190.8 75.7L187.5 74.5L190.8 73.3L192 70Z"
        fill="#DDD6FE"
      />

      {/* ตัวการ์ตูนกำลังนั่งทำงาน */}
      {/* ผมด้านหลัง */}
      <circle cx="117" cy="67" r="12.5" fill="#231942" />
      {/* ลำตัวเสื้อสีม่วงสว่างตัดกับพื้นหลัง */}
      <path
        d="M95 123C95 103 103 90 116 90C129 90 136 103 136 123H95Z"
        fill="#9B87F5"
      />
      {/* คอ */}
      <rect x="111" y="81" width="8" height="10" rx="4" fill="#F7C59F" />
      {/* ใบหน้า */}
      <circle cx="114" cy="71" r="11.5" fill="#F7C59F" />
      {/* ผมด้านหน้า */}
      <path
        d="M103 69C103 62 108 58 115 58C121 58 125 62 125 67C121 65 114 65 103 69Z"
        fill="#231942"
      />
      {/* แขนเอื้อมพิมพ์งาน */}
      <path
        d="M122 98C115 105 107 111 98 114"
        stroke="#7E69AB"
        strokeWidth="7"
        strokeLinecap="round"
      />

      {/* แล็ปท็อปบนโต๊ะ */}
      <path d="M68 97H100L106 121H74L68 97Z" fill="#231942" />
      <path d="M71 100H97L102 118H76L71 100Z" fill="#EDE9FE" />
      <circle cx="87" cy="109" r="3" fill="#5B44BA" />
      <rect x="73" y="120.5" width="44" height="3.5" rx="1.75" fill="#DDD6FE" />

      {/* กระถางต้นไม้เล็กด้านซ้าย */}
      <path
        d="M44 113C41 107 36 106 35 110C39 111 41 112 44 113Z"
        fill="#34D399"
      />
      <path
        d="M45 113C47 106 52 105 53 109C49 110 47 112 45 113Z"
        fill="#10B981"
      />
      <rect x="39" y="113" width="11" height="10" rx="2.5" fill="#FF8A65" />

      {/* แก้วกาแฟด้านขวา */}
      <path
        d="M161 114H163.5C165.2 114 166.5 115.3 166.5 117C166.5 118.7 165.2 120 163.5 120H161"
        stroke="#FBBF24"
        strokeWidth="2"
      />
      <rect x="150" y="111" width="11" height="12" rx="2.5" fill="#FBBF24" />

      {/* โต๊ะทำงานและขาโต๊ะ */}
      <line
        x1="24"
        y1="124"
        x2="196"
        y2="124"
        stroke="#DDD6FE"
        strokeOpacity="0.75"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <line
        x1="48"
        y1="124"
        x2="42"
        y2="146"
        stroke="#DDD6FE"
        strokeOpacity="0.75"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <line
        x1="172"
        y1="124"
        x2="178"
        y2="146"
        stroke="#DDD6FE"
        strokeOpacity="0.75"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function NavIcon({ href }: { href: string }) {
  if (href === '/dashboard') {
    return (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="shrink-0"
      >
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <path d="M17.5 14v7" />
        <path d="M14 17.5h7" />
      </svg>
    );
  }

  if (href === '/projects') {
    return (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="shrink-0"
      >
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
      </svg>
    );
  }

  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      <polyline points="9 11 12 14 22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const [openPath, setOpenPath] = useState<string | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const isOpen = openPath === pathname;
  const menuId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const collapseLabel = isCollapsed ? 'Expand sidebar' : 'Collapse sidebar';

  useEffect(() => {
    // Match the lg breakpoint used by the desktop sidebar.
    const desktop = window.matchMedia('(min-width: 64rem)');
    function handleShortcut(event: KeyboardEvent) {
      if (!desktop.matches || event.defaultPrevented || event.isComposing ||
        !event.ctrlKey || event.altKey || event.shiftKey || event.metaKey ||
        event.key.toLowerCase() !== 'b') {
        return;
      }

      const target = event.target;
      if (target instanceof HTMLElement &&
        (target.isContentEditable || target.closest('input, textarea, select'))) {
        return;
      }

      event.preventDefault();
      if (!event.repeat) setIsCollapsed((previous) => !previous);
    }

    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, []);

  const navItems = [
    { name: 'Overview', href: '/dashboard' },
    { name: 'Projects', href: '/projects' },
    { name: 'My tasks', href: '/mytasks' },
  ];

  const smoothTransition =
    'transition-all duration-[350ms] ease-[cubic-bezier(0.22,1,0.36,1)]';

  return (
    <aside
      onBlur={(event) => {
        if (isOpen && !event.currentTarget.contains(event.relatedTarget)) setOpenPath(null);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && isOpen) {
          setOpenPath(null);
          toggleRef.current?.focus();
        }
      }}
      className={`relative w-full ${
        isCollapsed ? 'lg:w-[84px]' : 'lg:w-[248px]'
      } rounded-none lg:rounded-br-[32px] bg-[#5B44BA] text-white border-b lg:border-b-0 lg:border-r border-white/15 shadow-[4px_0_24px_rgba(91,68,186,0.16)] lg:sticky lg:top-0 lg:h-screen lg:shrink-0 z-30 transition-[width] duration-[350ms] ease-[cubic-bezier(0.22,1,0.36,1)]`}
    >
      {/* ปุ่มพับเข้า-กางออกบนหน้าจอใหญ่ */}
      <button
        type="button"
        aria-label={collapseLabel}
        aria-keyshortcuts="Control+B"
        title={`${collapseLabel} (Ctrl+B)`}
        aria-expanded={!isCollapsed}
        onClick={() => setIsCollapsed((prev) => !prev)}
        className="hidden lg:flex items-center justify-center w-7 h-7 rounded-full bg-white border border-[#e2d9ff] shadow-md text-[#5B44BA] hover:bg-[#f5f1ff] absolute -right-3.5 top-6 z-30 cursor-pointer transition-colors duration-200"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className={`transition-transform duration-[350ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
            isCollapsed ? 'rotate-180' : ''
          }`}
        >
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>

      <div className="h-full flex flex-col p-4 lg:px-5 lg:py-4 lg:overflow-y-auto lg:overflow-x-hidden">
        {/* Brand Logo */}
        <div className="flex items-center mb-3 lg:mb-7">
          <MobGLogo />
          <span
            className={`ml-3.5 text-[22px] font-extrabold tracking-tight text-white whitespace-nowrap ${smoothTransition} ${
              isCollapsed
                ? 'lg:ml-0 lg:max-w-0 lg:opacity-0 lg:overflow-hidden'
                : 'lg:max-w-[140px] lg:opacity-100'
            }`}
          >
            MobG
          </span>
          <button
            ref={toggleRef}
            type="button"
            aria-label="Menu"
            aria-expanded={isOpen}
            aria-controls={menuId}
            onClick={() => setOpenPath(isOpen ? null : pathname)}
            className="ml-auto min-h-11 min-w-11 rounded-xl border border-white/25 bg-white/10 text-white hover:bg-white/20 px-3 text-[14px] font-medium lg:hidden"
          >
            {isOpen ? 'Close menu' : 'Menu'}
          </button>
        </div>

        {/* Navigation */}
        <div
          className={`hidden lg:block px-3 text-[11px] font-semibold uppercase tracking-wider text-white/60 whitespace-nowrap overflow-hidden ${smoothTransition} ${
            isCollapsed
              ? 'lg:max-h-0 lg:opacity-0 lg:mb-0'
              : 'lg:max-h-6 lg:opacity-100 lg:mb-2.5'
          }`}
        >
          Menu
        </div>

        <nav
          id={menuId}
          aria-label="Main navigation"
          className={`${isOpen ? 'flex' : 'hidden'} flex-col lg:flex gap-1.5`}
        >
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                aria-label={item.name}
                title={isCollapsed ? item.name : undefined}
                onClick={() => setOpenPath(null)}
                className={`min-h-11 rounded-full text-[14px] flex items-center px-4 lg:px-[13px] py-2.5 ${smoothTransition} ${
                  isActive
                    ? 'bg-white/18 text-white font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.16)]'
                    : 'text-white/75 font-medium hover:bg-white/10 hover:text-white'
                }`}
              >
                <NavIcon href={item.href} />
                <span
                  className={`ml-3 whitespace-nowrap ${smoothTransition} ${
                    isCollapsed
                      ? 'lg:ml-0 lg:max-w-0 lg:opacity-0 lg:overflow-hidden'
                      : 'lg:max-w-[140px] lg:opacity-100'
                  }`}
                >
                  {item.name}
                </span>
              </Link>
            );
          })}
        </nav>

        {/* เส้นขีดกั้นใต้เมนู */}
        <div
          aria-hidden="true"
          className="hidden lg:block -mx-5 mt-5 border-t border-white/15"
        />

        {/* ภาพการ์ตูนการทำงาน + กล่องคำแนะนำ (ล็อกกึ่งกลางพื้นที่ส่วนล่าง) */}
        <div
          aria-hidden={isCollapsed}
          className={`hidden lg:block lg:my-auto ${smoothTransition} ${
            isCollapsed
              ? 'opacity-0 pointer-events-none'
              : 'opacity-100'
          }`}
        >
          <div className="w-[208px] py-3">
            <WorkIllustration />

            <div className="mt-3 bg-white/12 border border-white/15 p-4 rounded-2xl">
              <strong className="block text-[13px] text-white mb-1.5">
                See the big picture
              </strong>
              <p className="m-0 text-[11px] text-white/80 leading-[1.5]">
                Check your projects, upcoming tasks, and deadlines at a glance.
              </p>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
