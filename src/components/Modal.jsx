import { useEffect, useRef } from 'react';

// A pop-up window built on <dialog>, which handles focus and the Escape key.
// Closes on Escape, the × button, or a click on the dimmed background.
export default function Modal({ open, title, onClose, children, wide = false }) {
  const ref = useRef(null);
  const titleId = useRef(`modal-${Math.random().toString(36).slice(2)}`).current;

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={`auth-modal${wide ? ' modal-wide' : ''}`}
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      {open && (
        <div className="auth-body">
          <div className="auth-head">
            <h2 id={titleId} className="auth-title">
              {title}
            </h2>
            <button type="button" className="close-btn" aria-label="Close" onClick={onClose}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}
