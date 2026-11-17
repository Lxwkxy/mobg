'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { getCurrentUser } from '@/lib/authService';
import type { User } from '@/types';

export type SessionStatus =
  | 'loading'
  | 'ready'
  | 'login-required'
  | 'no-profile'
  | 'error';

export type SessionState = {
  status: SessionStatus;
  user: User | null;
  revision: number;
};

type SessionContextValue = {
  session: SessionState;

  getLatestSession: () => SessionState;

  refreshSession: () => Promise<SessionState>;

  replaceSession: (
    user: User | null,
    status?: SessionStatus,
    expectedRevision?: number,
  ) => boolean;

  updateSessionUser: (
    user: User,
    expectedRevision?: number,
  ) => boolean;

  invalidateSession: () => void;

  clearSession: () => void;

  isCurrentSessionRevision: (
    revision: number,
  ) => boolean;
};

const SessionContext =
  createContext<SessionContextValue | null>(null);

export function SessionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [session, setSession] = useState<SessionState>({
    status: 'loading',
    user: null,
    revision: 0,
  });

  // ใช้ Ref เป็นแหล่งข้อมูล Session ปัจจุบัน
  // เพื่อให้ Request ตรวจสอบค่าได้ทันทีโดยไม่รอ React render
  const sessionRef = useRef(session);

  const revisionRef = useRef(0);

  const requestRef =
    useRef<Promise<SessionState> | null>(null);

  const commitSession = useCallback(
    (nextSession: SessionState) => {
      sessionRef.current = nextSession;
      setSession(nextSession);
    },
    [],
  );

  const getLatestSession = useCallback(
    (): SessionState => sessionRef.current,
    [],
  );

  const isCurrentSessionRevision = useCallback(
    (revision: number) => {
      return revisionRef.current === revision;
    },
    [],
  );

  // เปลี่ยน Session พร้อมยกเลิกสิทธิ์ของ Request เก่า
  const replaceSession = useCallback(
    (
      user: User | null,
      status: SessionStatus = user
        ? 'ready'
        : 'login-required',
      expectedRevision?: number,
    ): boolean => {
      if (
        expectedRevision !== undefined &&
        revisionRef.current !== expectedRevision
      ) {
        return false;
      }

      revisionRef.current += 1;

      // Request เก่าจะไม่มีสิทธิ์แก้ Session อีก
      requestRef.current = null;

      commitSession({
        status,
        user,
        revision: revisionRef.current,
      });

      return true;
    },
    [commitSession],
  );

  // ใช้สำหรับอัปเดตชื่อหรืออีเมลของบัญชีเดิม
  // โดยไม่เปลี่ยน Revision
  const updateSessionUser = useCallback(
    (
      user: User,
      expectedRevision?: number,
    ): boolean => {
      if (
        expectedRevision !== undefined &&
        revisionRef.current !== expectedRevision
      ) {
        return false;
      }

      const current = sessionRef.current;

      if (
        current.status !== 'ready' ||
        !current.user ||
        current.user.userId !== user.userId
      ) {
        return false;
      }

      commitSession({
        ...current,
        user,
      });

      return true;
    },
    [commitSession],
  );

  // ใช้ตอนเริ่ม Logout:
  // ซ่อนข้อมูลเก่าและยกเลิก Request ที่กำลังตรวจ Session
  // แต่ยังไม่เปลี่ยนสถานะเป็น login-required
  const invalidateSession = useCallback(() => {
    revisionRef.current += 1;
    requestRef.current = null;

    commitSession({
      status: 'loading',
      user: null,
      revision: revisionRef.current,
    });
  }, [commitSession]);

  const clearSession = useCallback(() => {
    replaceSession(null, 'login-required');
  }, [replaceSession]);

  // ตรวจ Session จาก Backend
  const refreshSession =
    useCallback((): Promise<SessionState> => {
      // ถ้ามี Request ของ Revision ปัจจุบันอยู่แล้ว
      // ใช้ Request เดิม ไม่ยิงซ้ำ
      if (requestRef.current) {
        return requestRef.current;
      }

      revisionRef.current += 1;

      const requestRevision = revisionRef.current;

      // ซ่อนข้อมูลบัญชีเดิมทันที
      commitSession({
        status: 'loading',
        user: null,
        revision: requestRevision,
      });

      // ให้ Request เริ่มหลังจากกำหนด requestRef แล้ว
      const request = Promise.resolve().then(
        async (): Promise<SessionState> => {
          try {
            const user = await getCurrentUser();

            // ป้องกัน Response เก่าทับ Session ใหม่
            if (
              revisionRef.current !== requestRevision ||
              requestRef.current !== request
            ) {
              return sessionRef.current;
            }

            const nextSession: SessionState = user
              ? {
                  status: 'ready',
                  user,
                  revision: requestRevision,
                }
              : {
                  status: 'login-required',
                  user: null,
                  revision: requestRevision,
                };

            commitSession(nextSession);

            return nextSession;
          } catch (error) {
            const httpStatus = (
              error as { status?: number }
            ).status;

            // Error จาก Request เก่าก็ไม่มีสิทธิ์แก้ Session
            if (
              revisionRef.current !== requestRevision ||
              requestRef.current !== request
            ) {
              return sessionRef.current;
            }

            const nextSession: SessionState = {
              status:
                httpStatus === 401
                  ? 'login-required'
                  : httpStatus === 403
                    ? 'no-profile'
                    : 'error',
              user: null,
              revision: requestRevision,
            };

            commitSession(nextSession);

            return nextSession;
          }
        },
      );

      requestRef.current = request;

      void request.finally(() => {
        // Request เก่าห้ามล้าง Reference ของ Request ใหม่
        if (requestRef.current === request) {
          requestRef.current = null;
        }
      });

      return request;
    }, [commitSession]);

  useEffect(() => {
    void refreshSession();

    return () => {
      // เมื่อ Provider ถูกถอดออกจากหน้าจอ
      // Request ที่ยังค้างอยู่จะหมดสิทธิ์อัปเดต Session
      revisionRef.current += 1;
      requestRef.current = null;
    };
  }, [refreshSession]);

  const value = useMemo(
    () => ({
      session,
      getLatestSession,
      refreshSession,
      replaceSession,
      updateSessionUser,
      invalidateSession,
      clearSession,
      isCurrentSessionRevision,
    }),
    [
      session,
      getLatestSession,
      refreshSession,
      replaceSession,
      updateSessionUser,
      invalidateSession,
      clearSession,
      isCurrentSessionRevision,
    ],
  );

  return (
    <SessionContext.Provider value={value}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const context = useContext(SessionContext);

  if (!context) {
    throw new Error(
      'useSession must be used inside SessionProvider.',
    );
  }

  return context;
}