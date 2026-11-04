import ProfileMenu from './ProfileMenu.jsx';

// Desktop header: logo (back to the landing page), lot name, the car picker with
// Check in / Check out (customers and guests), and the profile menu.
// Phones use MobileHeader instead.
export default function AppHeader({ onHome, badge, lotName, onNavigate, onOpenAuth, carBar }) {
  return (
    <header className="app-header">
      <div className="app-header-left">
        <button type="button" className="brand brand-btn header-brand" onClick={onHome} aria-label="RushHourParkingSystem home">
          <span className="brand-mark brand-mark-sm" aria-hidden="true">R</span>
          <span className="brand-name">RushHourParkingSystem</span>
        </button>
        {badge && <span className="role-badge">{badge}</span>}
        {lotName && <span className="header-lot">{lotName}</span>}
      </div>
      <div className="app-header-right">
        {carBar}
        <ProfileMenu onNavigate={onNavigate} onOpenAuth={onOpenAuth} />
      </div>
    </header>
  );
}
