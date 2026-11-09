'use client';
import { useSyncExternalStore } from 'react';
const subscribe = () => () => {};
// Keep credential forms disabled until React has attached the submit handler.
export function useHydrated() {
  return useSyncExternalStore(subscribe, () => true, () => false);
}
