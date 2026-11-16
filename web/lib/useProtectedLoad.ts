
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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

export function useProtectedLoad<T>(load: () => Promise<T>) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    token: object;
    outcome: Outcome<T>;
  } | null>(null);

  const token = useMemo(() => ({ load, attempt }), [load, attempt]);

  // เมื่อกลับมาเปิดแท็บ ให้ตรวจ Session และโหลดข้อมูลใหม่
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        setAttempt((value) => value + 1);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener(
        'visibilitychange',
        handleVisibilityChange,
      );
    };
  }, []);

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

        return { status: 'error', httpStatus };
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

  const isStale = result === null || result.token !== token;
  const outcome = isStale ? undefined : result.outcome;

  const status: LoadStatus =
    outcome === undefined
      ? 'loading'
      : outcome.status;

  return {
    status,
    data: outcome?.status === 'ready' ? outcome.data : null,
    user: outcome?.status === 'ready' ? outcome.user : null,
    userId:
      outcome?.status === 'ready'
        ? outcome.user.userId
        : null,
    httpStatus:
      outcome?.status === 'error'
        ? outcome.httpStatus
        : undefined,
    isRefreshing: isStale,
    retry,
  };
}
