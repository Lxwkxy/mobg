
'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

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
  | { status: 'error'; httpStatus?: number };

export type ProtectedLoadOptions = {
  /**
   * ตรวจ Session และโหลดข้อมูลใหม่เมื่อกลับมาเปิดหน้าต่างหรือแท็บ
   * ค่าเริ่มต้น false
   */
  revalidateOnFocus?: boolean;

  /**
   * ซ่อนข้อมูลเดิมระหว่างตรวจ Session และโหลดข้อมูลใหม่
   * ค่าเริ่มต้น false
   */
  hideDataWhileRefreshing?: boolean;
};

export function useProtectedLoad<T>(
  load: () => Promise<T>,
  options: ProtectedLoadOptions = {},
) {
  const {
    revalidateOnFocus = false,
    hideDataWhileRefreshing = false,
  } = options;

  const [attempt, setAttempt] = useState(0);

  const [result, setResult] = useState<{
    token: object;
    outcome: Outcome<T>;
  } | null>(null);

  const lastFocusRefreshAt = useRef(0);

  const token = useMemo(
    () => ({ load, attempt }),
    [load, attempt],
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
    let cancelled = false;

    async function run(): Promise<Outcome<T>> {
      try {
        const user = await getCurrentUser();

        if (!user) {
          return { status: 'login-required' };
        }

        const data = await load();

        return {
          status: 'ready',
          data,
          user,
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
      if (!cancelled) {
        setResult({ token, outcome });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [token, load]);

  const retry = useCallback(() => {
    setAttempt((value) => value + 1);
  }, []);

  const isStale =
    result === null || result.token !== token;

  const outcome = result?.outcome;

  // ซ่อนข้อมูลเดิมเฉพาะหน้าที่เปิด hideDataWhileRefreshing
  const visibleOutcome =
    hideDataWhileRefreshing && isStale
      ? undefined
      : outcome;

  const status: LoadStatus =
    visibleOutcome === undefined
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
