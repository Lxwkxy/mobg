
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
  ) => void;
  updateSessionUser: (user: User) => void;
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

  const revisionRef = useRef(0);
  const requestRef = useRef<Promise<SessionState> | null>(null);

  const replaceSession = useCallback(
    (
      user: User | null,
      status: SessionStatus = user ? 'ready' : 'login-required',
    ) => {
      revisionRef.current += 1;

      setSession({
        status,
        user,
        revision: revisionRef.current,
      });
    },
    [],
  );

  const updateSessionUser = useCallback((user: User) => {
    setSession((previous) => ({
      ...previous,
      status: 'ready',
      user,
    }));
  }, []);

  const clearSession = useCallback(() => {
    replaceSession(null, 'login-required');
  }, [replaceSession]);

  const refreshSession = useCallback((): Promise<SessionState> => {
    // ใช้ Promise เดียวกันเมื่อ focus และ visibilitychange
    // เกิดขึ้นใกล้กัน ป้องกัน GET /api/me ซ้ำ
    if (requestRef.current) {
      return requestRef.current;
    }

    revisionRef.current += 1;
    const revision = revisionRef.current;

    // ล้าง user เก่าทันที ก่อนส่ง request
    setSession({
      status: 'loading',
      user: null,
      revision,
    });

    const request = (async (): Promise<SessionState> => {
      try {
        const user = await getCurrentUser();

        const nextSession: SessionState = user
          ? {
              status: 'ready',
              user,
              revision,
            }
          : {
              status: 'login-required',
              user: null,
              revision,
            };

        setSession(nextSession);
        return nextSession;
      } catch (error) {
        const httpStatus = (
          error as { status?: number }
        ).status;

        const nextSession: SessionState = {
          status:
            httpStatus === 403
              ? 'no-profile'
              : 'error',
          user: null,
          revision,
        };

        setSession(nextSession);
        return nextSession;
      }
    })();

    requestRef.current = request;

    void request.finally(() => {
      if (requestRef.current === request) {
        requestRef.current = null;
      }
    });

    return request;
  }, []);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  const value = useMemo(
    () => ({
      session,
      refreshSession,
      replaceSession,
      updateSessionUser,
      clearSession,
    }),
    [
      session,
      refreshSession,
      replaceSession,
      updateSessionUser,
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
