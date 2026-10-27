export default function Sidebar({ items, active, onNavigate }) {
  return (
    <nav className="sidebar" aria-label="Main">
      <div className="brand">
        <div className="brand-mark">P</div>
        <div className="brand-name">ParkSpot</div>
      </div>
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
          </a>
        ))}
      </div>
    </nav>
  );
}
