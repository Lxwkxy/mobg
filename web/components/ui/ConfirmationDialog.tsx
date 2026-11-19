'use client';

import {
  useEffect,
  useId,
  useRef,
  type KeyboardEvent,
  type SyntheticEvent,
} from 'react';

type ConfirmationDialogProps = {
  open: boolean;
  title: string;
  description: string;
  itemName: string;
  confirmLabel?: string;
  pendingLabel?: string;
  irreversible?: boolean;
  isLoading?: boolean;
  error?: string;
  onCancel: () => void;
  onConfirm: () => void;
};

export default function ConfirmationDialog({
  open,
  title,
  description,
  itemName,
  confirmLabel = 'Delete',
  pendingLabel = 'Deleting...',
  irreversible = true,
  isLoading = false,
  error = '',
  onCancel,
  onConfirm,
}: ConfirmationDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;

    if (!dialog || !open) return;

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    if (!dialog.open) {
      dialog.showModal();
    }

    cancelButtonRef.current?.focus();

    return () => {
      if (dialog.open) {
        dialog.close();
      }

      const previous = previousFocusRef.current;
      if (previous?.isConnected && !previous.matches(':disabled')) {
        previous.focus();
      } else {
        document.getElementById('main-content')?.focus({ preventScroll: true });
      }
      previousFocusRef.current = null;
    };
  }, [open]);

  const handleCancel = (event: SyntheticEvent<HTMLDialogElement>) => {
    event.preventDefault();

    if (isLoading) return;

    onCancel();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (event.key !== 'Tab') return;

    const dialog = dialogRef.current;

    if (!dialog) return;

    const focusableElements = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((element) => element.offsetParent !== null);

    if (focusableElements.length === 0) {
      event.preventDefault();
      dialog.focus();
      return;
    }

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (event.shiftKey) {
      if (
        document.activeElement === firstElement ||
        !dialog.contains(document.activeElement)
      ) {
        event.preventDefault();
        lastElement.focus();
      }

      return;
    }

    if (
      document.activeElement === lastElement ||
      !dialog.contains(document.activeElement)
    ) {
      event.preventDefault();
      firstElement.focus();
    }
  };

  return (
    <dialog
      ref={dialogRef}
      onCancel={handleCancel}
      onKeyDown={handleKeyDown}
      onClick={(event) => {
        if (event.target === dialogRef.current && !isLoading) {
          onCancel();
        }
      }}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      aria-modal="true"
      className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-[470px] max-h-[calc(100dvh-2rem)] overflow-hidden rounded-[24px] border border-[#e5e0f5] bg-white p-0 text-center shadow-[0_20px_50px_rgba(15,15,25,0.22)] backdrop:bg-black/45 backdrop:backdrop-blur-[1px] [overflow-wrap:anywhere]"
    >
      <div className="flex max-h-[calc(100dvh-2rem)] flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pt-7 pb-4 sm:px-8 sm:pt-8">
          <div className="mx-auto mb-3.5 flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-600">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              <line x1="10" y1="11" x2="10" y2="17" />
              <line x1="14" y1="11" x2="14" y2="17" />
            </svg>
          </div>

          <h2
            id={titleId}
            className="text-[22px] sm:text-[24px] font-extrabold tracking-tight text-[#1f1f1f]"
          >
            {title}
          </h2>

          <p className="mt-2.5 text-[15px] font-semibold text-[#2b2b2b] break-words">
            {itemName}
          </p>

          <p
            id={descriptionId}
            className="mt-3 text-[13px] leading-relaxed text-[#777777]"
          >
            {description}
            {irreversible && (
              <span className="font-medium text-rose-600"> This action cannot be undone.</span>
            )}
          </p>

          {error && (
            <p
              role="alert"
              aria-live="assertive"
              className="mt-4 w-full rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-left text-[12.5px] font-medium text-rose-600"
            >
              {error}
            </p>
          )}
        </div>

        <div className="shrink-0 flex flex-col-reverse gap-2.5 border-t border-[#f2effa] bg-white px-6 py-4 sm:flex-row sm:justify-end sm:px-8 sm:py-5">
          <button
            ref={cancelButtonRef}
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="min-h-11 rounded-xl border border-[#dcdce0] bg-white px-6 py-2.5 text-[13.5px] font-semibold text-[#222222] transition-colors hover:bg-[#f5f5f7] cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className="min-h-11 inline-flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-6 py-2.5 text-[13.5px] font-semibold text-white transition-colors hover:bg-rose-700 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading && (
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                aria-hidden="true"
                className="animate-spin"
              >
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
            )}
            <span>{isLoading ? pendingLabel : confirmLabel}</span>
          </button>
        </div>
      </div>
    </dialog>
  );
}
