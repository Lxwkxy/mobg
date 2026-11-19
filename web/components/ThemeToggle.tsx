'use client';

import { useSyncExternalStore } from 'react';

import { THEME_STORAGE_KEY, type Theme } from '@/lib/theme';

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
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
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

  // The icon and the accessible name are switched by CSS on
  // html[data-theme] (set by the pre-paint script), so they are correct from
  // the first paint, before React hydrates. Only the hover tooltip depends on
  // React state.
  return (
    <button
      type="button"
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      onClick={() => applyTheme(isDark ? 'light' : 'dark')}
      className="shrink-0 w-11 h-11 rounded-full border border-[#e7e1ff] bg-[#faf9ff] text-[#5B44BA] flex items-center justify-center cursor-pointer hover:bg-[#f2eeff] hover:border-[#d7ccff] transition-colors duration-200"
    >
      <span className="sr-only theme-label-light">
        Switch to dark mode
      </span>
      <span className="sr-only theme-label-dark">
        Switch to light mode
      </span>

      <svg
        className="theme-icon-moon"
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
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
      </svg>
      <svg
        className="theme-icon-sun"
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
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    </button>
  );
}
