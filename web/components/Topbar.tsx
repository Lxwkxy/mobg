'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

export default function Topbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [user, setUser] = useState({ userName: 'User', email: '' });
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    const currentUserStr = localStorage.getItem('mobg_current_user');
    if (currentUserStr) {
      try {
        const parsed = JSON.parse(currentUserStr);
        // อ่าน userName เป็นหลัก ตาม Login service
        setUser({
          userName: parsed.userName || parsed.name || 'User',
          email: parsed.email || '',
        });
      } catch (e) {
        console.error('Error parsing user session:', e);
      }
    }
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('mobg_current_user');
    router.push('/login');
  };

  return (
    <header className="h-[72px] bg-white flex items-center justify-end px-[36px] border-b border-[#e0e0e0] relative">
      {/* Search Box */}
      <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2.5 bg-[#eaeaea] px-4 py-2 rounded-full w-[580px]">
        <span className="text-[14px] text-[#888888]">🔍</span>
        <input
          type="text"
          placeholder="Search projects, tasks ..."
          className="border-none bg-transparent outline-none w-full text-[12px] text-[#333333]"
        />
        <span className="bg-white px-2.5 py-0.5 rounded-xl text-[11px] text-[#666666] shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
          Enter
        </span>
      </div>

      {/* Topbar Actions & User Account */}
      <div className="flex items-center gap-5">
        <div className="relative inline-block" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="flex items-center gap-2.5 p-1.5 px-2.5 rounded-lg hover:bg-[#f4f4f4] transition-colors cursor-pointer"
          >
            <div className="w-[34px] h-[34px] rounded-full bg-[#e0e0e0] flex items-center justify-center text-[16px]">
              👤
            </div>
            <span className="text-[13px] font-semibold text-[#333333]">{user.userName}</span>
            <span className="flex items-center justify-center text-[#666666] w-[14px] h-[14px]">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </span>
          </button>

          {/* Dropdown Menu */}
          {isOpen && (
            <div className="absolute top-[calc(100%+8px)] right-0 bg-white border border-[#e0e0e0] rounded-xl shadow-[0_10px_25px_rgba(0,0,0,0.15)] w-[200px] p-2 z-[99999]">
              {user.email && (
                <div className="p-2 text-[12px] text-[#666666] border-b border-[#f0f0f0] mb-1.5 break-all">
                  {user.email}
                </div>
              )}
              <button
                type="button"
                onClick={handleLogout}
                className="w-full p-2 text-left text-[#dc2626] text-[13px] font-medium rounded-md hover:bg-[#fef2f2] flex items-center gap-2 cursor-pointer transition-colors"
              >
                <span>↪</span> Log out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}