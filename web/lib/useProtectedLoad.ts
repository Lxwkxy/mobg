
'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { usePathname } from 'next/navigation';

import { getCurrentUser } from '@/lib/authService';
import type { User } from '@/types';

export type LoadStatus =
  | 'loading'
  | 'ready'
  | 'login-required'
  | 'no-profile'
  | 'error';

type Outcome<T> =
  | { status: 'ready'; data: T; user: User }
  | { status: 'login-required' }
  | { status: 'no-profile' }
  | { status: 'session-changed' }
  | { status: 'error'; httpStatus?: number };

export type ProtectedLoadOptions = {
  /**
   * ตรวจ Session และโหลดข้อมูลใหม่เมื่อกลับมาเปิดหน้าต่างหรือแท็บ
   */
  revalidateOnFocus?: boolean;

  /**
   * ซ่อนข้อมูลเดิมระหว่างตรวจ Session และโหลดข้อมูลใหม่
   */
  hideDataWhileRefreshing?: boolean;

  /**
   * ตรวจ Session และโหลดข้อมูลใหม่เมื่อกลับเข้าหน้าที่กำหนด
   */
  revalidateOnRoute?: string;
};

export function useProtectedLoad<T>(
  load: () => Promise<T>,
  options: ProtectedLoadOptions = {},
) {
  const {
    revalidateOnFocus = false,
    hideDataWhileRefreshing = false,
    revalidateOnRoute,
  } = options;

  const pathname = usePathname();

  const routeActive =
    !revalidateOnRoute || pathname === revalidateOnRoute;

  const [attempt, setAttempt] = useState(0);

  const [result, setResult] = useState<{
    token: object;
    outcome: Outcome<T>;
  } | null>(null);

  const lastFocusRefreshAt = useRef(0);

  const token = useMemo(
    () => ({ load, attempt, routeActive }),
    [load, attempt, routeActive],
  );

  // ตรวจ Session และโหลดข้อมูลใหม่เมื่อกลับมาเปิดหน้าต่างหรือแท็บ
  useEffect(() => {
    if (!revalidateOnFocus) {
      return;
    }

    const refresh = () => {
      const now = Date.now();

      // ป้องกันการโหลดซ้ำจาก focus และ visibilitychange
      if (now - lastFocusRefreshAt.current < 500) {
        return;
      }

      lastFocusRefreshAt.current = now;
      setAttempt((value) => value + 1);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refresh();
      }
    };

    window.addEventListener('focus', refresh);

    document.addEventListener(
      'visibilitychange',
      handleVisibilityChange,
    );

    return () => {
      window.removeEventListener('focus', refresh);

      document.removeEventListener(
        'visibilitychange',
        handleVisibilityChange,
      );
    };
  }, [revalidateOnFocus]);

  // ตรวจ Session ก่อนโหลดข้อมูลทุกครั้ง
  useEffect(() => {
    if (!routeActive) {
      return;
    }

    let cancelled = false;

    async function run(): Promise<Outcome<T>> {
      try {
        // ตรวจสอบบัญชีก่อนโหลดข้อมูล
        const initialUser = await getCurrentUser();

        if (!initialUser) {
          return { status: 'login-required' };
        }

        const data = await load();

        // ตรวจสอบบัญชีอีกครั้งหลังโหลดข้อมูลเสร็จ
        const currentUser = await getCurrentUser();

        if (!currentUser) {
          return { status: 'login-required' };
        }

        // หากบัญชีเปลี่ยนระหว่างโหลด ให้โหลดข้อมูลใหม่
        // โดยไม่แสดงข้อมูลจากบัญชีเดิม
        if (currentUser.userId !== initialUser.userId) {
          return { status: 'session-changed' };
        }

        return {
          status: 'ready',
          data,
          user: currentUser,
        };
      } catch (error) {
        const httpStatus = (error as { status?: number }).status;

        if (httpStatus === 401) {
          return { status: 'login-required' };
        }

        if (httpStatus === 403) {
          return { status: 'no-profile' };
        }

        console.error(
          'Failed to verify session or load data:',
          error,
        );

        return {
          status: 'error',
          httpStatus,
        };
      }
    }

    void run().then((outcome) => {
      if (cancelled) {
        return;
      }

      if (outcome.status === 'session-changed') {
        setAttempt((value) => value + 1);
        return;
      }

      setResult({ token, outcome });
    });

    return () => {
      cancelled = true;
    };
  }, [token, load, routeActive]);

  const retry = useCallback(() => {
    setAttempt((value) => value + 1);
  }, []);

  const isStale =
    result === null || result.token !== token;

  const outcome = result?.outcome;

  // ซ่อนข้อมูลเดิมระหว่างตรวจสอบ Session และโหลดข้อมูลใหม่
  const visibleOutcome =
    hideDataWhileRefreshing && isStale
      ? undefined
      : outcome;

  // แปลง session-changed เป็น loading
  // เพื่อไม่ให้หลุดเข้าไปใน LoadStatus
  const status: LoadStatus =
    visibleOutcome === undefined ||
    visibleOutcome.status === 'session-changed'
      ? 'loading'
      : visibleOutcome.status === 'ready'
        ? 'ready'
        : isStale
          ? 'loading'
          : visibleOutcome.status;

  return {
    status,

    data:
      visibleOutcome?.status === 'ready'
        ? visibleOutcome.data
        : null,

    user:
      visibleOutcome?.status === 'ready'
        ? visibleOutcome.user
        : null,

    userId:
      visibleOutcome?.status === 'ready'
        ? visibleOutcome.user.userId
        : null,

    httpStatus:
      visibleOutcome?.status === 'error'
        ? visibleOutcome.httpStatus
        : undefined,

    isRefreshing:
      isStale && outcome?.status === 'ready',

    retry,
  };
}
