import { useState } from 'react';

export default function MobileHeader({ items, active, onNavigate, user, onSignOut }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mobile-header">
      <div className="mobile-bar">
        <div className="brand">
          <div className="brand-mark brand-mark-sm">R</div>
          <span className="brand-name">Rush Hour</span>
        </div>
        <button
          type="button"
          className="icon-btn"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? '✕' : '☰'}
        </button>
      </div>

      {open && (
        <nav className="mobile-nav" aria-label="Main">
          {items.map((item) => (
            <a
              key={item.label}
              href={item.href}
              className={`nav-link${active === item.label ? ' is-active' : ''}`}
              onClick={() => {
                onNavigate(item.label);
                setOpen(false);
              }}
            >
              {item.label}
            </a>
          ))}
          <div className="account account-row">
            <div>
              <div className="account-note">{user.guest ? 'Browsing as guest' : 'Signed in as'}</div>
              <div className="account-name">{user.name}</div>
            </div>
            <button type="button" className="btn-ghost" onClick={onSignOut}>
              {user.guest ? 'Back to login' : 'Sign out'}
            </button>
          </div>
        </nav>
      )}
    </div>
  );
}