'use client';

import { usePathname } from 'next/navigation';
import { useLayoutEffect, useRef } from 'react';

export default function MainRouteFocus() {
  const pathname = usePathname();
  const previousPath = useRef(pathname);

  useLayoutEffect(() => {
    if (previousPath.current === pathname) return;
    previousPath.current = pathname;
    document.getElementById('main-content')?.focus({ preventScroll: true });
  }, [pathname]);

  return null;
}
