import type { KeyboardEvent } from 'react';

export function getNextItemIndex(key: string, current: number, length: number) {
  if (!length) return -1;
  switch (key) {
    case 'Home': return 0;
    case 'End': return length - 1;
    case 'ArrowDown':
    case 'ArrowRight': return (current + 1) % length;
    case 'ArrowUp':
    case 'ArrowLeft': return current <= 0 ? length - 1 : current - 1;
    default: return -1;
  }
}

export function handleResultKeys(event: KeyboardEvent<HTMLElement>, panelId: string, close: () => void) {
  if (event.defaultPrevented || event.nativeEvent.isComposing || event.ctrlKey || event.altKey || event.metaKey) return;
  const input = event.currentTarget.querySelector('input');
  const panel = event.currentTarget.querySelector(`#${CSS.escape(panelId)}`);
  if (!input || !panel) return;

  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    input.focus();
    close();
    return;
  }

  const items = [...panel.querySelectorAll<HTMLElement>('a[href], button:not(:disabled)')];
  const current = items.findIndex((item) => item === event.target);
  if (current < 0 && (event.target !== input || !['ArrowDown', 'ArrowUp'].includes(event.key))) return;
  if (current === 0 && event.key === 'ArrowUp') {
    event.preventDefault();
    input.focus();
    return;
  }
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
  const next = items[getNextItemIndex(event.key, current, items.length)];
  if (next) {
    event.preventDefault();
    next.focus();
  }
}
