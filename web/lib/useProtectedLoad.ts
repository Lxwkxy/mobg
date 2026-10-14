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

/**
 * ตรวจ session (GET /api/me) แล้วโหลดข้อมูลของหน้า
 *
 * - `load` ต้องมี identity คงที่ (module-level function หรือ useCallback)
 *   เมื่อ `load` เปลี่ยน (เช่น เปลี่ยนหน้า pagination) จะโหลดใหม่เอง
 * - ไม่เรียก setState แบบ synchronous ใน effect: สถานะ loading คำนวณจาก
 *   token เทียบกับผลล่าสุด ส่วน setState เกิดหลัง await เท่านั้น
 * - ระหว่างโหลดใหม่ ถ้าผลก่อนหน้าสำเร็จ จะคง `data` เดิมไว้และตั้ง isRefreshing
 * - 401 -> login-required, 403 -> no-profile, อย่างอื่น -> error (พร้อม httpStatus)
 */
export function useProtectedLoad<T>(load: () => Promise<T>) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    token: object;
    outcome: Outcome<T>;
  } | null>(null);

  // identity ของ token เปลี่ยนทุกครั้งที่ load เปลี่ยนหรือกด retry
  const token = useMemo(() => ({ load, attempt }), [load, attempt]);

  useEffect(() => {
    let cancelled = false;

    async function run(): Promise<Outcome<T>> {
      try {
        const user = await getCurrentUser();
        if (!user) return { status: 'login-required' };

        return { status: 'ready', data: await load(), user };
      } catch (error) {
        const httpStatus = (error as { status?: number }).status;

        if (httpStatus === 401) return { status: 'login-required' };
        if (httpStatus === 403) return { status: 'no-profile' };

        console.error('Failed to verify session or load data:', error);
        return { status: 'error', httpStatus };
      }
    }

    void run().then((outcome) => {
      if (!cancelled) setResult({ token, outcome });
    });

    return () => {
      cancelled = true;
    };
  }, [token, load]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  const outcome = result?.outcome;
  const isStale = result === null || result.token !== token;

  const status: LoadStatus =
    outcome === undefined
      ? 'loading'
      : outcome.status === 'ready'
        ? 'ready'
        : isStale
          ? 'loading'
          : outcome.status;

  return {
    status,
    data: outcome?.status === 'ready' ? outcome.data : null,
    user: outcome?.status === 'ready' ? outcome.user : null,
    httpStatus: outcome?.status === 'error' ? outcome.httpStatus : undefined,
    isRefreshing: isStale && outcome?.status === 'ready',
    retry,
  };
}