'use client';

import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  registerAccount,
  requestPasswordReset,
} from '@/lib/accountService';

const ACCOUNT_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeAccountEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function validateAccountEmail(email: string): string | null {
  const normalized = normalizeAccountEmail(email);

  if (
    !ACCOUNT_EMAIL_PATTERN.test(normalized) ||
    normalized.length > 255
  ) {
    return 'Enter a valid email address.';
  }

  return null;
}

export function validateAccountPassword(
  password: string,
  confirmation: string,
): string | null {
  if (password.length < 8 || password.length > 128) {
    return 'Use a password between 8 and 128 characters.';
  }

  if (password !== confirmation) {
    return 'Passwords do not match.';
  }

  return null;
}

export function validateRegistrationInput({
  name,
  email,
  password,
  confirmation,
}: {
  name: string;
  email: string;
  password: string;
  confirmation: string;
}): string | null {
  const trimmedName = name.trim();

  if (!trimmedName || trimmedName.length > 100) {
    return 'Enter a name between 1 and 100 characters.';
  }

  const emailError = validateAccountEmail(email);
  if (emailError) {
    return emailError;
  }

  return validateAccountPassword(password, confirmation);
}

export function useRegisterAction() {
  const router = useRouter();
  const busyRef = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  const submitRegister = useCallback(
    async ({
      name,
      email,
      password,
      confirmation,
    }: {
      name: string;
      email: string;
      password: string;
      confirmation: string;
    }): Promise<boolean> => {
      if (busyRef.current) return false;

      setError('');

      const validationError = validateRegistrationInput({
        name,
        email,
        password,
        confirmation,
      });

      if (validationError) {
        setError(validationError);
        return false;
      }

      busyRef.current = true;
      setPending(true);

      try {
        await registerAccount(
          name.trim(),
          normalizeAccountEmail(email),
          password,
        );
        router.replace('/verify-email');
        return true;
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : 'Unable to connect. Please try again.',
        );
        return false;
      } finally {
        busyRef.current = false;
        setPending(false);
      }
    },
    [router],
  );

  return {
    pending,
    error,
    setError,
    submitRegister,
  };
}

export function usePasswordResetRequestAction() {
  const busyRef = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const submitPasswordResetRequest = useCallback(
    async (email: string): Promise<boolean> => {
      if (busyRef.current) return false;

      setError('');

      const emailError = validateAccountEmail(email);
      if (emailError) {
        setError(emailError);
        return false;
      }

      setDone(false);
      busyRef.current = true;
      setPending(true);

      try {
        await requestPasswordReset(normalizeAccountEmail(email));
        setDone(true);
        return true;
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : 'Unable to connect. Please try again.',
        );
        return false;
      } finally {
        busyRef.current = false;
        setPending(false);
      }
    },
    [],
  );

  const resetState = useCallback(() => {
    setError('');
    setDone(false);
  }, []);

  return {
    pending,
    error,
    done,
    setError,
    resetState,
    submitPasswordResetRequest,
  };
}