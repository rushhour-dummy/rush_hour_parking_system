import { useEffect, useState } from 'react';
import Modal from './Modal.jsx';

// A yes/no pop-up for actions that charge money or end a stay (add time, check
// out). `onConfirm` may return a promise; its error is shown in the pop-up and
// the pop-up stays open so the person can try again or cancel.
export default function ConfirmModal({ open, title, confirmLabel, cancelLabel = 'Cancel', danger = false, onConfirm, onClose, children }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setBusy(false);
      setError('');
    }
  }, [open]);

  async function confirm() {
    setBusy(true);
    setError('');
    try {
      await onConfirm();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} title={title} onClose={() => !busy && onClose()}>
      {children}
      {error && (
        <div className="field-error" role="alert">
          {error}
        </div>
      )}
      <div className="confirm-actions">
        <button type="button" className={`${danger ? 'btn-danger' : 'btn-primary'} btn-pad`} disabled={busy} onClick={confirm}>
          {busy ? 'Working…' : confirmLabel}
        </button>
        <button type="button" className="btn-outline btn-pad" disabled={busy} onClick={onClose}>
          {cancelLabel}
        </button>
      </div>
    </Modal>
  );
}
