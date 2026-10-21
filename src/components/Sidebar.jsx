export default function Sidebar({ items, active, onNavigate, user, onSignOut }) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">R</div>
        <div className="brand-name">Rush Hour</div>
      </div>

      <nav className="nav-list" aria-label="Main">
        {items.map((item) => (
          <a
            key={item.label}
            href={item.href}
            className={`nav-link${active === item.label ? ' is-active' : ''}`}
            onClick={() => onNavigate(item.label)}
          >
            {item.label}
          </a>
        ))}
      </nav>

      <div className="account">
        <div className="account-note">{user.guest ? 'Browsing as guest' : 'Signed in as'}</div>
        <div className="account-name">{user.name}</div>
        <button type="button" className="btn-ghost" onClick={onSignOut}>
          {user.guest ? 'Back to login' : 'Sign out'}
        </button>
      </div>
    </aside>
  );
}