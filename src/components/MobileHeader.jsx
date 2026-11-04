import { useState } from 'react';
import ProfileMenu from './ProfileMenu.jsx';

export default function MobileHeader({ items, active, onNavigate, onOpenView, onOpenAuth, onHome, badge, carBar }) {
  const [open, setOpen] = useState(false);
  const hasNav = items.length > 0; // guests get no navigation menu
  const menuOpen = open && hasNav;

  return (
    <div className="mobile-header">
      <div className="mobile-bar">
        {hasNav && (
          <button
            type="button"
            className="icon-btn"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            onClick={() => setOpen((o) => !o)}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              {menuOpen ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        )}
        <div className="brand">
          <button
            type="button"
            className="brand brand-btn"
            aria-label="RushHourParkingSystem home"
            onClick={() => {
              setOpen(false);
              onHome();
            }}
          >
            <span className="brand-mark brand-mark-sm" aria-hidden="true">R</span>
            <span className="brand-name">RushHourParkingSystem</span>
          </button>
          {badge && <span className="role-badge">{badge}</span>}
        </div>
        <ProfileMenu
          variant="dark"
          onOpenAuth={(mode) => {
            setOpen(false);
            onOpenAuth(mode);
          }}
          onNavigate={(view) => {
            setOpen(false);
            onOpenView(view);
          }}
        />
      </div>
      {carBar && <div className="mobile-carbar">{carBar}</div>}

      {menuOpen && (
        <nav id="mobile-nav" className="mobile-nav" aria-label="Main">
          {items.map((item) => (
            <a
              key={item.label}
              href={item.href}
              className={`nav-link${active === item.label ? ' is-active' : ''}`}
              aria-current={active === item.label ? 'page' : undefined}
              onClick={() => {
                onNavigate(item);
                setOpen(false);
              }}
            >
              {item.label}
              {item.count != null && <span className="nav-count">{item.count}</span>}
            </a>
          ))}
        </nav>
      )}
    </div>
  );
}
