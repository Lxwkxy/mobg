
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

import type { User } from '@/types';

export type LoadStatus =
  | 'loading'
  | 'ready'
  | 'login-required'
  | 'no-profile'
  | 'error';

type Outcome<T> =
  | { status: 'ready'; data: T }
  | { status: 'error'; httpStatus?: number };

type LoadResult<T> = {
  token: object;
  userId: User['userId'];
  outcome: Outcome<T>;
};

type LoadSuccess<T> = {
  token: object;
  userId: User['userId'];
  data: T;
};

export type ProtectedLoadOptions = {
  revalidateOnFocus?: boolean;
  hideDataWhileRefreshing?: boolean;
  revalidateOnRoute?: string;
};

function toLoadStatus(
  status: SessionStatus,
): LoadStatus {
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
  const [mountValidated, setMountValidated] = useState(false);

  const [result, setResult] =
    useState<LoadResult<T> | null>(null);

  const [lastSuccess, setLastSuccess] =
    useState<LoadSuccess<T> | null>(null);

  const lastRefreshAt = useRef(0);

  const currentUser = session.user;

  const sessionReady =
    session.status === 'ready' &&
    currentUser !== null;

  const sessionUserId =
    currentUser?.userId ?? null;

  const token = useMemo(
    () => ({
      load,
      attempt,
      revision: session.revision,
    }),
    [load, attempt, session.revision],
  );

  // ตรวจ Session ก่อนโหลดข้อมูลครั้งแรก
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

  // ตรวจ Session เมื่อกลับมาเปิดแท็บหรือหน้าต่าง
  useEffect(() => {
    if (!revalidateOnFocus) {
      return;
    }

    lastRefreshAt.current = Date.now();

    const refresh = (force = false) => {
      const now = Date.now();

      if (
        !force &&
        now - lastRefreshAt.current < 500
      ) {
        return;
      }

      lastRefreshAt.current = now;
      void refreshSession();
    };

    function handleFocus() {
      refresh();
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        refresh();
      }
    }

    function handlePageShow(
      event: PageTransitionEvent,
    ) {
      refresh(event.persisted);
    }

    window.addEventListener('focus', handleFocus);

    window.addEventListener(
      'pageshow',
      handlePageShow,
    );

    document.addEventListener(
      'visibilitychange',
      handleVisibilityChange,
    );

    return () => {
      window.removeEventListener(
        'focus',
        handleFocus,
      );

      window.removeEventListener(
        'pageshow',
        handlePageShow,
      );

      document.removeEventListener(
        'visibilitychange',
        handleVisibilityChange,
      );
    };
  }, [revalidateOnFocus, refreshSession]);

  // โหลดข้อมูลเมื่อ Session พร้อมแล้วเท่านั้น
  useEffect(() => {
    if (
      revalidateOnFocus &&
      !mountValidated
    ) {
      return;
    }

    if (!sessionReady || sessionUserId === null) {
      return;
    }

    let cancelled = false;
    let loadStarted = false;
    let postLoadVerificationStarted = false;

    const requestRevision = session.revision;
    const requestUserId = sessionUserId;

    const isRequestCurrent = () => {
      return (
        !cancelled &&
        isCurrentSessionRevision(requestRevision)
      );
    };

    // ตรวจว่าบัญชีปัจจุบันยังเป็นบัญชีเดียวกับ Request หรือไม่
    async function verifyCurrentSession(): Promise<boolean> {
      let verifiedUser: User | null;

      try {
        verifiedUser = await getCurrentUser();
      } catch (error) {
        if (!isRequestCurrent()) {
          return false;
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
        return false;
      }

      if (!verifiedUser) {
        replaceSession(
          null,
          'login-required',
          requestRevision,
        );

        return false;
      }

      // ถ้าบัญชีเปลี่ยน ให้เปลี่ยน Session
      // แล้วให้ Effect เริ่มโหลดข้อมูลใหม่ด้วยบัญชีล่าสุด
      if (verifiedUser.userId !== requestUserId) {
        replaceSession(
          verifiedUser,
          'ready',
          requestRevision,
        );

        return false;
      }

      // เป็นบัญชีเดิม อัปเดตข้อมูล User ได้
      const updated = updateSessionUser(
        verifiedUser,
        requestRevision,
      );

      return (
        updated &&
        isRequestCurrent()
      );
    }

    async function run(): Promise<Outcome<T>> {
      try {
        // ตรวจ Session ก่อนเริ่มโหลดข้อมูล
        if (revalidateOnFocus) {
          const verified = await verifyCurrentSession();

          if (!verified || !isRequestCurrent()) {
            return { status: 'error' };
          }
        }

        if (!isRequestCurrent()) {
          return { status: 'error' };
        }

        loadStarted = true;

        const data = await load();

        if (!isRequestCurrent()) {
          return { status: 'error' };
        }

        // ตรวจ Session หลังโหลดข้อมูลเสร็จ
        if (revalidateOnFocus) {
          postLoadVerificationStarted = true;

          const verified = await verifyCurrentSession();

          if (!verified || !isRequestCurrent()) {
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
        if (!isRequestCurrent()) {
          return { status: 'error' };
        }

        let errorToReport: unknown = error;

        // ถ้า Load API ล้มเหลว ให้ตรวจ Session อีกครั้ง
        // ก่อนนำ Error ของ Request เก่ามาแสดง
        if (
          revalidateOnFocus &&
          loadStarted &&
          !postLoadVerificationStarted
        ) {
          try {
            const verified = await verifyCurrentSession();

            if (!verified || !isRequestCurrent()) {
              return { status: 'error' };
            }
          } catch (verificationError) {
            if (!isRequestCurrent()) {
              return { status: 'error' };
            }

            errorToReport = verificationError;
          }
        }

        if (!isRequestCurrent()) {
          return { status: 'error' };
        }

        const httpStatus = (
          errorToReport as { status?: number }
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
            errorToReport,
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

      const nextResult: LoadResult<T> = {
        token,
        userId: requestUserId,
        outcome,
      };

      setResult(nextResult);

      if (outcome.status === 'ready') {
        setLastSuccess({
          token,
          userId: requestUserId,
          data: outcome.data,
        });
      }
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

  const resultOwnedByCurrentUser =
    result !== null &&
    sessionUserId !== null &&
    result.userId === sessionUserId;

  const isStale =
    result === null ||
    result.token !== token;

  const shouldHideData =
    !sessionReady ||
    !resultOwnedByCurrentUser ||
    (
      hideDataWhileRefreshing &&
      isStale
    );

  const visibleOutcome =
    shouldHideData
      ? undefined
      : result?.outcome;

  let status: LoadStatus;

  if (session.status !== 'ready') {
    status = toLoadStatus(session.status);
  } else if (!resultOwnedByCurrentUser) {
    status = 'loading';
  } else if (
    hideDataWhileRefreshing &&
    isStale
  ) {
    status = 'loading';
  } else if (
    isStale &&
    result?.outcome.status === 'error'
  ) {
    status = 'loading';
  } else if (!visibleOutcome) {
    status = 'loading';
  } else {
    status = visibleOutcome.status;
  }

  const data =
    status === 'ready' &&
    visibleOutcome?.status === 'ready'
      ? visibleOutcome.data
      : null;

  // รักษาข้อมูลเดิมไว้สำหรับ Edit Task
  // แต่จะแสดงได้เฉพาะเมื่อเป็นบัญชีเจ้าของข้อมูลเดิม
  const retainedAllowed =
    session.status === 'loading' ||
    session.status === 'error' ||
    (
      session.status === 'ready' &&
      currentUser !== null &&
      lastSuccess?.userId === currentUser.userId
    );

  const retained =
    retainedAllowed
      ? lastSuccess?.data ?? null
      : null;

  const retainedUserId =
    retained !== null
      ? lastSuccess?.userId ?? null
      : null;

  return {
    status,
    data,

    user: sessionReady
      ? currentUser
      : null,

    userId: sessionUserId,

    httpStatus:
      visibleOutcome?.status === 'error'
        ? visibleOutcome.httpStatus
        : undefined,

    isRefreshing:
      resultOwnedByCurrentUser &&
      isStale &&
      result?.outcome.status === 'ready',

    retained,
    retainedUserId,

    retry,
  };
}
