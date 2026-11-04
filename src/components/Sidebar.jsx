// Left panel on desktop. The logo and role badge live in the header above it.
export default function Sidebar({ items, active, onNavigate }) {
  return (
    <nav className="sidebar" aria-label="Main">
      <div className="nav-list">
        {items.map((item) => (
          <a
            key={item.label}
            href={item.href}
            className={`nav-link${active === item.label ? ' is-active' : ''}`}
            aria-current={active === item.label ? 'page' : undefined}
            onClick={() => onNavigate(item)}
          >
            {item.label}
            {item.count != null && <span className="nav-count">{item.count}</span>}
          </a>
        ))}
      </div>
    </nav>
  );
}
