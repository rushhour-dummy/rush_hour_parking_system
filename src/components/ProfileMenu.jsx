import { useEffect, useRef, useState } from 'react';
import { initials, useAuth } from '../auth.jsx';

export default function ProfileMenu({ onNavigate, onOpenAuth, variant = 'light' }) {
  const { user } = useAuth();

  // Signed out: show sign-in / sign-up buttons instead of the avatar menu.
  if (!user) {
    return (
      <div className={`auth-actions ${variant === 'dark' ? 'auth-actions-dark' : ''}`}>
        <button type="button" className="btn-text" onClick={() => onOpenAuth('signin')}>Sign in</button>
        <button type="button" className="btn-primary btn-pad only-desktop" onClick={() => onOpenAuth('signup')}>Sign up</button>
      </div>
    );
  }

  return <AccountMenu onNavigate={onNavigate} variant={variant} />;
}

function AccountMenu({ onNavigate, variant }) {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const buttonRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    function onKey(e) {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function go(view) {
    setOpen(false);
    onNavigate(view);
  }

  return (
    <div className={`profile ${variant === 'dark' ? 'profile-dark' : ''}`} ref={wrapRef}>
      <button
        ref={buttonRef}
        type="button"
        className="profile-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu for ${user.name}`}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="avatar" aria-hidden="true">{initials(user.name)}</span>
        <span className="profile-name only-desktop">{user.name}</span>
        <svg className="only-desktop" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="profile-menu" role="menu">
          <div className="profile-menu-head">
            <span className="avatar avatar-lg" aria-hidden="true">{initials(user.name)}</span>
            <div style={{ minWidth: 0 }}>
              <div className="profile-menu-name">{user.name}</div>
              <div className="profile-menu-email">{user.email}</div>
              <div className="profile-menu-role">{user.role}</div>
            </div>
          </div>
          <button type="button" role="menuitem" className="menu-item" onClick={() => go('profile')}>
            Profile
          </button>
          <button type="button" role="menuitem" className="menu-item" onClick={() => go('settings')}>
            Settings
          </button>
          <div className="menu-sep" role="separator" />
          <button
            type="button"
            role="menuitem"
            className="menu-item menu-item-danger"
            onClick={() => {
              setOpen(false);
              logout();
              onNavigate('dashboard');
            }}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
