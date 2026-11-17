
type ConfirmationDialogProps = {
  open: boolean;
  title: string;
  description: string;
  itemName: string;
  confirmLabel?: string;
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
  isLoading = false,
  error = '',
  onCancel,
  onConfirm,
}: ConfirmationDialogProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
      role="presentation"
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirmation-dialog-title"
        aria-describedby="confirmation-dialog-description"
        className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl sm:p-6"
      >
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-red-50 text-xl text-red-600">
          !
        </div>

        <h2
          id="confirmation-dialog-title"
          className="mb-2 text-lg font-bold text-[#222222]"
        >
          {title}
        </h2>

        <p
          id="confirmation-dialog-description"
          className="text-[13px] leading-6 text-[#666666]"
        >
          {description}
        </p>

        <div className="my-4 rounded-lg bg-[#f5f5f5] px-3 py-3">
          <p className="break-words text-[13px] font-semibold text-[#333333]">
            {itemName}
          </p>
        </div>

        <p className="mb-4 text-[12px] text-red-600">
          This action cannot be undone.
        </p>

        {error && (
          <p
            role="alert"
            className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-[12px] text-red-700"
          >
            {error}
          </p>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="min-h-11 rounded-lg border border-[#dddddd] px-5 py-2 text-[13px] font-medium text-[#444444] hover:bg-[#f5f5f5] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className="min-h-11 rounded-lg bg-red-600 px-5 py-2 text-[13px] font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? 'Deleting...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
