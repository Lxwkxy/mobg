'use client';

import { useLayoutEffect, useRef, type ComponentPropsWithRef, type KeyboardEvent, type RefObject } from 'react';
import { getNextItemIndex } from '@/lib/keyboardNavigation';

const triggerSelector = 'button[aria-haspopup]';
const optionSelector = '[role="option"], [role="menuitem"]';

export default function KeyboardPopup({
  open,
  onClose,
  ref,
  ...props
}: Omit<ComponentPropsWithRef<'div'>, 'onBlur' | 'onClickCapture' | 'onKeyDown' | 'ref'> & {
  open: boolean;
  onClose: () => void;
  ref?: RefObject<HTMLDivElement | null> | null;
}) {
  const ownRef = useRef<HTMLDivElement>(null);
  const rootRef = ref ?? ownRef;
  const openingDirection = useRef<'first' | 'last' | null>(null);

  function options(root: HTMLDivElement) {
    return [...root.querySelectorAll<HTMLElement>(optionSelector)]
      .filter((item) => !item.matches(':disabled, [aria-disabled="true"]'));
  }

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!open || !root) return;
    const items = options(root);
    const direction = openingDirection.current;
    openingDirection.current = null;
    const initial = direction === 'last' ? items.at(-1)
      : direction === 'first' ? items[0]
      : items.find((item) => item.getAttribute('aria-selected') === 'true') ?? items[0];
    initial?.focus();
  }, [open, rootRef]);

  function handleKeys(event: KeyboardEvent<HTMLDivElement>) {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    const root = event.currentTarget;
    const trigger = root.querySelector<HTMLButtonElement>(triggerSelector);
    if (!trigger || trigger.disabled) return;
    const verticalKeys = ['ArrowDown', 'ArrowUp', 'Home', 'End'];

    if (!open) {
      if (event.target === trigger && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
        event.preventDefault();
        openingDirection.current = event.key === 'ArrowUp' ? 'last' : 'first';
        trigger.click();
      }
      return;
    }

    if (event.key === 'Escape' || event.key === 'Tab') {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
      }
      trigger.focus({ preventScroll: true });
      onClose();
      return;
    }

    const items = options(root);
    const activeIndex = items.findIndex((item) => item === document.activeElement);
    if (verticalKeys.includes(event.key)) {
      event.preventDefault();
      items[getNextItemIndex(event.key, activeIndex, items.length)]?.focus();
    } else if (event.key === ' ' && items[activeIndex] instanceof HTMLAnchorElement) {
      event.preventDefault();
      items[activeIndex].click();
    }
  }

  return (
    <div
      {...props}
      ref={rootRef}
      onKeyDown={handleKeys}
      onBlur={(event) => {
        if (open && !event.currentTarget.contains(event.relatedTarget)) onClose();
      }}
      onClickCapture={(event) => {
        if (open && event.target instanceof Element && event.target.closest(optionSelector)) {
          event.currentTarget.querySelector<HTMLButtonElement>(triggerSelector)?.focus({ preventScroll: true });
        }
      }}
    />
  );
}
