
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

type SessionState = {
  status: SessionStatus;
  user: User | null;
  revision: number;
};

type SessionContextValue = {
  session: SessionState;
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
  isCurrentSessionRevision: (revision: number) => boolean;
  clearSession: () => void;
};

const SessionContext = createContext<SessionContextValue | null>(
  null,
);

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

  const sessionRef = useRef(session);
  const revisionRef = useRef(0);
  const requestRef = useRef<Promise<SessionState> | null>(null);

  // อัปเดตทั้ง React state และ ref ให้ตรงกันทันที
  const commitSession = useCallback((next: SessionState) => {
    sessionRef.current = next;
    setSession(next);
  }, []);

  // ตรวจว่า Revision ที่ Request เริ่มต้นมายังเป็น Revision ปัจจุบัน
  const isCurrentSessionRevision = useCallback(
    (revision: number) => {
      return revisionRef.current === revision;
    },
    [],
  );

  const replaceSession = useCallback(
    (
      user: User | null,
      status: SessionStatus = user
        ? 'ready'
        : 'login-required',
      expectedRevision?: number,
    ): boolean => {
      // ป้องกัน Response เก่าเปลี่ยน Session ใหม่
      if (
        expectedRevision !== undefined &&
        revisionRef.current !== expectedRevision
      ) {
        return false;
      }

      // ทำให้ Request ที่กำลังทำงานอยู่หมดสิทธิ์อัปเดต Session
      revisionRef.current += 1;
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

      commitSession({
        ...current,
        status: 'ready',
        user,
      });

      // ไม่เพิ่ม Revision เพราะเป็นการอัปเดตข้อมูลผู้ใช้บัญชีเดิม
      return true;
    },
    [commitSession],
  );

  const clearSession = useCallback(() => {
    replaceSession(null, 'login-required');
  }, [replaceSession]);

  const refreshSession = useCallback((): Promise<SessionState> => {
    // ป้องกัน focus, visibilitychange และ pageshow
    // เรียก GET /api/me ซ้ำในช่วงที่ Request เดิมยังทำงาน
    if (requestRef.current) {
      return requestRef.current;
    }

    revisionRef.current += 1;

    const requestRevision = revisionRef.current;

    // ซ่อนข้อมูลบัญชีเดิมทันทีที่เริ่มตรวจ Session
    commitSession({
      status: 'loading',
      user: null,
      revision: requestRevision,
    });

    // ใช้ Promise.resolve() เพื่อให้ requestRef ถูกกำหนดก่อน
    // ที่ Request จะเริ่มทำงานจริง
    const request = Promise.resolve().then(
      async (): Promise<SessionState> => {
        try {
          const user = await getCurrentUser();

          // ตรวจทั้ง Revision และตัว Request ก่อนอัปเดต
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

          // Error เก่าก็ไม่มีสิทธิ์เปลี่ยน Session เช่นกัน
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
      // Request เก่าห้ามล้าง reference ของ Request ใหม่
      if (requestRef.current === request) {
        requestRef.current = null;
      }
    });

    return request;
  }, [commitSession]);

  useEffect(() => {
    void refreshSession();

    return () => {
      // เมื่อ Provider ถูก unmount หรือ Effect ถูกยกเลิก
      // Response ที่ค้างอยู่จะไม่มีสิทธิ์อัปเดต Session
      revisionRef.current += 1;
      requestRef.current = null;
    };
  }, [refreshSession]);

  const value = useMemo(
    () => ({
      session,
      refreshSession,
      replaceSession,
      updateSessionUser,
      isCurrentSessionRevision,
      clearSession,
    }),
    [
      session,
      refreshSession,
      replaceSession,
      updateSessionUser,
      isCurrentSessionRevision,
      clearSession,
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
