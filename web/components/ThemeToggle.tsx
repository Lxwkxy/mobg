'use client';

import { useSyncExternalStore } from 'react';

type Theme = 'light' | 'dark';

const STORAGE_KEY = 'mobg-theme';
const listeners = new Set<() => void>();

function getTheme(): Theme {
  return document.documentElement.dataset.theme === 'dark'
    ? 'dark'
    : 'light';
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;

  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Storage may be blocked; the theme still applies for this visit.
  }

  listeners.forEach((listener) => listener());
}

export default function ThemeToggle() {
  // Server and first client render assume light; the real value
  // (set by the inline script in the root layout) is read after hydration.
  const theme = useSyncExternalStore<Theme>(
    subscribe,
    getTheme,
    () => 'light',
  );

  const isDark = theme === 'dark';
  const label = isDark
    ? 'Switch to light mode'
    : 'Switch to dark mode';

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={() => applyTheme(isDark ? 'light' : 'dark')}
      className="theme-toggle shrink-0 w-11 h-11 rounded-full border border-[#e7e1ff] bg-[#faf9ff] text-[#5B44BA] flex items-center justify-center cursor-pointer hover:bg-[#f2eeff] hover:border-[#d7ccff] transition-colors duration-200"
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {isDark ? (
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </>
        ) : (
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        )}
      </svg>
    </button>
  );
}
