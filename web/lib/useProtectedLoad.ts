
'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { getCurrentUser } from '@/lib/authService';
import {
  useSession,
  type SessionStatus,
} from '@/lib/SessionProvider';

export type LoadStatus =
  | 'loading'
  | 'ready'
  | 'login-required'
  | 'no-profile'
  | 'error';

type Outcome<T> =
  | { status: 'ready'; data: T }
  | { status: 'error'; httpStatus?: number };

export type ProtectedLoadOptions = {
  revalidateOnFocus?: boolean;
  hideDataWhileRefreshing?: boolean;

  /**
   * Deprecated: ไม่ใช้ pathname เป็นตัวเริ่ม revalidation อีกต่อไป
   * เก็บไว้ชั่วคราวเพื่อรองรับหน้าที่ส่ง option นี้อยู่
   */
  revalidateOnRoute?: string;
};

function toLoadStatus(status: SessionStatus): LoadStatus {
  return status;
}

export function useProtectedLoad<T>(
  load: () => Promise<T>,
  options: ProtectedLoadOptions = {},
) {
  const {
    revalidateOnFocus = false,
    hideDataWhileRefreshing = false,
  } = options;

  const {
    session,
    refreshSession,
    replaceSession,
    updateSessionUser,
    isCurrentSessionRevision,
  } = useSession();

  const [attempt, setAttempt] = useState(0);

  // หน้าเหล่านี้ต้องตรวจ Session ใหม่ก่อนโหลดข้อมูลทุกครั้งที่ Mount
  const [mountValidated, setMountValidated] = useState(false);

  const [result, setResult] = useState<{
    token: object;
    outcome: Outcome<T>;
  } | null>(null);

  const lastRefreshAt = useRef(0);

  const token = useMemo(
    () => ({
      load,
      attempt,
      revision: session.revision,
    }),
    [load, attempt, session.revision],
  );

  // ตรวจ Session ก่อนเริ่มโหลดข้อมูลทุกครั้งที่เปิดหน้านี้
  useEffect(() => {
    if (!revalidateOnFocus) {
      return;
    }

    let cancelled = false;

    lastRefreshAt.current = Date.now();

    void refreshSession().then(() => {
      if (!cancelled) {
        setMountValidated(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [revalidateOnFocus, refreshSession]);

  // ตรวจ Session เมื่อกลับมาเปิดหน้าต่างหรือแท็บ
  useEffect(() => {
    if (!revalidateOnFocus) {
      return;
    }

    lastRefreshAt.current = Date.now();

    const refresh = () => {
      const now = Date.now();

      // ป้องกัน focus, visibilitychange และ pageshow
      // ทำให้เกิด Request ซ้ำในช่วงเวลาใกล้กัน
      if (now - lastRefreshAt.current < 500) {
        return;
      }

      lastRefreshAt.current = now;
      void refreshSession();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refresh();
      }
    };

    const handlePageShow = () => {
      refresh();
    };

    window.addEventListener('focus', refresh);
    window.addEventListener('pageshow', handlePageShow);

    document.addEventListener(
      'visibilitychange',
      handleVisibilityChange,
    );

    return () => {
      window.removeEventListener('focus', refresh);
      window.removeEventListener('pageshow', handlePageShow);

      document.removeEventListener(
        'visibilitychange',
        handleVisibilityChange,
      );
    };
  }, [revalidateOnFocus, refreshSession]);

  const sessionUserId = session.user?.userId;

  const sessionReady =
    session.status === 'ready' && session.user !== null;

  // โหลดข้อมูลเมื่อ Session ผ่านการตรวจสอบแล้วเท่านั้น
  useEffect(() => {
    // ถ้าเปิด revalidateOnFocus ต้องรอการตรวจ Session ตอน Mount ก่อน
    if (revalidateOnFocus && !mountValidated) {
      return;
    }

    if (!sessionReady || sessionUserId === undefined) {
      return;
    }

    let cancelled = false;

    // จำ Revision ตอนเริ่ม Request
    const requestRevision = session.revision;

    // ตรวจว่า Request ยังทำงานอยู่และ Revision ยังตรงกัน
    const isRequestCurrent = () => {
      return (
        !cancelled &&
        isCurrentSessionRevision(requestRevision)
      );
    };

    async function run(): Promise<Outcome<T>> {
      try {
        const data = await load();

        if (!isRequestCurrent()) {
          return { status: 'error' };
        }

        // ตรวจ /api/me รอบสองเฉพาะหน้าที่เปิด revalidateOnFocus
        if (revalidateOnFocus) {
          let currentUser;

          try {
            currentUser = await getCurrentUser();
          } catch (error) {
            if (!isRequestCurrent()) {
              return { status: 'error' };
            }

            const httpStatus = (
              error as { status?: number }
            ).status;

            if (httpStatus === 401) {
              replaceSession(
                null,
                'login-required',
                requestRevision,
              );
            } else if (httpStatus === 403) {
              replaceSession(
                null,
                'no-profile',
                requestRevision,
              );
            }

            throw error;
          }

          if (!isRequestCurrent()) {
            return { status: 'error' };
          }

          if (!currentUser) {
            replaceSession(
              null,
              'login-required',
              requestRevision,
            );

            return { status: 'error' };
          }

          // ถ้าบัญชีเปลี่ยนระหว่างโหลดข้อมูล
          // ให้เปลี่ยน Session และเริ่มโหลดข้อมูลใหม่
          if (currentUser.userId !== sessionUserId) {
            replaceSession(
              currentUser,
              'ready',
              requestRevision,
            );

            return { status: 'error' };
          }

          // อัปเดตชื่อและอีเมลของบัญชีเดิม
          // โดยไม่เพิ่ม Revision
          const updated = updateSessionUser(
            currentUser,
            requestRevision,
          );

          if (!updated || !isRequestCurrent()) {
            return { status: 'error' };
          }
        }

        if (!isRequestCurrent()) {
          return { status: 'error' };
        }

        return {
          status: 'ready',
          data,
        };
      } catch (error) {
        // Request เก่าหรือถูกยกเลิกไม่มีสิทธิ์เปลี่ยน Session
        if (!isRequestCurrent()) {
          return { status: 'error' };
        }

        const httpStatus = (
          error as { status?: number }
        ).status;

        if (httpStatus === 401) {
          replaceSession(
            null,
            'login-required',
            requestRevision,
          );
        } else if (httpStatus === 403) {
          replaceSession(
            null,
            'no-profile',
            requestRevision,
          );
        } else {
          console.error(
            'Failed to load protected data:',
            error,
          );
        }

        return {
          status: 'error',
          httpStatus,
        };
      }
    }

    void run().then((outcome) => {
      if (!isRequestCurrent()) {
        return;
      }

      setResult({
        token,
        outcome,
      });
    });

    return () => {
      cancelled = true;
    };
  }, [
    token,
    load,
    sessionReady,
    sessionUserId,
    session.revision,
    revalidateOnFocus,
    mountValidated,
    replaceSession,
    updateSessionUser,
    isCurrentSessionRevision,
  ]);

  const retry = useCallback(() => {
    if (session.status !== 'ready') {
      void refreshSession();
      return;
    }

    setAttempt((value) => value + 1);
  }, [session.status, refreshSession]);

  const isStale =
    result === null || result.token !== token;

  const outcome = result?.outcome;

  const shouldHideData =
    hideDataWhileRefreshing &&
    (
      isStale ||
      !sessionReady ||
      (revalidateOnFocus && !mountValidated)
    );

  const visibleOutcome = shouldHideData
    ? undefined
    : outcome;

  const status: LoadStatus =
    session.status !== 'ready'
      ? toLoadStatus(session.status)
      : visibleOutcome === undefined
        ? 'loading'
        : visibleOutcome.status === 'ready'
          ? 'ready'
          : isStale
            ? 'loading'
            : 'error';

  return {
    status,

    data:
      status === 'ready' &&
      visibleOutcome?.status === 'ready'
        ? visibleOutcome.data
        : null,

    user: sessionReady ? session.user : null,

    userId: sessionReady
      ? session.user?.userId ?? null
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
