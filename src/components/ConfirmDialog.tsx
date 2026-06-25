type ConfirmDialogProps = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-title" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <strong id="confirm-title">{title}</strong>
          <button onClick={onCancel}>{cancelLabel}</button>
        </div>
        <div className="modal-body">
          <p className="confirm-dialog__message">{message}</p>
          <div className="button-row confirm-dialog__actions">
            <button onClick={onCancel}>{cancelLabel}</button>
            <button className={danger ? "danger" : "primary"} onClick={onConfirm}>{confirmLabel}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

type NoticeDialogProps = {
  title: string;
  message: string;
  onClose: () => void;
};

export function NoticeDialog({ title, message, onClose }: NoticeDialogProps) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="notice-title" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <strong id="notice-title">{title}</strong>
          <button onClick={onClose}>Close</button>
        </div>
        <div className="modal-body">
          <p className="confirm-dialog__message">{message}</p>
          <div className="button-row confirm-dialog__actions">
            <button className="primary" onClick={onClose}>Got it</button>
          </div>
        </div>
      </div>
    </div>
  );
}
