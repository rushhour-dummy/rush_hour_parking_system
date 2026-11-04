import { useEffect, useState } from 'react';
import { useMediaQuery } from './useMediaQuery.js';
import { AuthProvider, isAdmin, isStaff, useAuth } from './auth.jsx';
import { SettingsProvider } from './settings.jsx';
import { ParkingProvider, useParkingStore } from './parking.jsx';
import AdminPage from './pages/AdminPage.jsx';
import UsersPage from './pages/UsersPage.jsx';
import ActivitiesPage from './pages/ActivitiesPage.jsx';
import ManageLotPage from './pages/ManageLotPage.jsx';
import Sidebar from './components/Sidebar.jsx';
import MobileHeader from './components/MobileHeader.jsx';
import AppHeader from './components/AppHeader.jsx';
import AppFooter from './components/AppFooter.jsx';
import CheckInForm from './components/CheckInForm.jsx';
import SummaryCards from './components/SummaryCards.jsx';
import SpotGrid from './components/SpotGrid.jsx';
import SpotDetail from './components/SpotDetail.jsx';
import MapCard from './components/MapCard.jsx';
import ActivityLog from './components/ActivityLog.jsx';
import AuthModal from './components/AuthModal.jsx';
import ReserveDialog from './components/ReserveDialog.jsx';
import ProfilePage from './pages/ProfilePage.jsx';
import PaymentsPage from './pages/PaymentsPage.jsx';
import ReservationsPage from './pages/ReservationsPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';

export const NAV_ITEMS = [
  { label: 'Overview', view: 'dashboard', href: '#overview' },
  { label: 'Spots', view: 'spots', href: '#spots' },
  { label: 'Reservations', view: 'reservations', href: '#reservations' },
  { label: 'Payments', view: 'payments', href: '#payments' },
  { label: 'Settings', view: 'settings', href: '#settings' },
];

// The admin page's spot lists in the left panel (Users is added after them in Shell).
export const ADMIN_NAV = [
  { key: 'all', label: 'All spots', href: '#all-spots' },
  { key: 'open', label: 'Open spots', href: '#open-spots' },
  { key: 'reservations', label: 'Reservations', href: '#reservations' },
];

export default function App() {
  return (
    <AuthProvider>
      <SettingsProvider>
        <ParkingProvider>
          <Shell />
        </ParkingProvider>
      </SettingsProvider>
    </AuthProvider>
  );
}

function Shell() {
  const { user, ready } = useAuth();
  const store = useParkingStore();
  const { totals, lotName, address, rules } = store;
  const mobile = useMediaQuery('(max-width: 820px)');
  const admin = isAdmin(user);
  const staff = isStaff(user); // admins and attendants
  // Guests and customers start on the dashboard; staff start on All spots.
  const [view, setView] = useState(staff ? 'admin' : 'dashboard');
  const [adminFilter, setAdminFilter] = useState('all');
  const [active, setActive] = useState(staff ? 'All spots' : 'Overview');
  const [auth, setAuth] = useState({ open: false, mode: 'signin', message: '' });

  // Send each kind of user to their home page whenever they sign in or out.
  const signedIn = Boolean(user);
  useEffect(() => {
    if (staff) {
      setView('admin');
      setAdminFilter('all');
      setActive('All spots');
    } else {
      setView('dashboard');
      setActive('Overview');
    }
  }, [signedIn, staff]);

  function openAuth(mode = 'signin', message = '') {
    setAuth({ open: true, mode, message });
  }

  function openAdmin(key) {
    const item = ADMIN_NAV.find((n) => n.key === key) ?? ADMIN_NAV[0];
    setView('admin');
    setAdminFilter(item.key);
    setActive(item.label);
    window.scrollTo(0, 0);
  }

  function openView(next) {
    const names = { settings: 'Settings', profile: 'your profile', reservations: 'your reservations', payments: 'your payments' };
    if (next !== 'dashboard' && !user) {
      openAuth('signin', `Sign in to open ${names[next] ?? 'that page'}.`);
      return;
    }
    if (next === 'dashboard' && staff) return openAdmin('all');
    if (['users', 'activity', 'lot'].includes(next) && !admin) return; // admins only
    if (['reservations', 'payments', 'spots'].includes(next) && staff) return openAdmin('all'); // customer pages
    setView(next);
    setActive(
      { settings: 'Settings', dashboard: 'Overview', spots: 'Spots', users: 'Users', reservations: 'Reservations', payments: 'Payments', activity: 'Activities', lot: 'Manage Parking Lot' }[next] ?? ''
    );
    window.scrollTo(0, 0);
  }

  // The RushHourParkingSystem logo: back to the main landing page (All spots for admins).
  function goHome() {
    if (staff) return openAdmin('all');
    setView('dashboard');
    setActive('Overview');
    window.scrollTo(0, 0);
  }

  function navigate(item) {
    if (item.adminKey) return openAdmin(item.adminKey);
    if (item.view !== 'dashboard') return openView(item.view);
    setActive(item.label);
    setView('dashboard');
    // e.g. Map: scroll to its section once the Overview is showing
    requestAnimationFrame(() => document.querySelector(item.href)?.scrollIntoView({ block: 'start' }));
  }

  const adminCounts = { all: totals.total, reservations: totals.reserved + totals.occupied, open: totals.free };
  const navItems = !user
    ? []
    : staff
      ? [
          ...ADMIN_NAV.map((n) => ({ label: n.label, href: n.href, adminKey: n.key, count: adminCounts[n.key] })),
          // Admins only: attendants don't see activity history, manage users or change the lot.
          ...(admin
            ? [
                { label: 'Manage Parking Lot', href: '#manage-lot', view: 'lot' },
                { label: 'Users', href: '#users', view: 'users' },
                { label: 'Activities', href: '#activities', view: 'activity' },
              ]
            : []),
        ]
      : NAV_ITEMS;
  const roleBadge = staff ? user.role : null;

  // Wraps an action so signed-out visitors get the sign-in pop-up instead.
  function requireAuth(action, message) {
    return (...args) => {
      if (!user) {
        openAuth('signin', message);
        return undefined;
      }
      return action(...args);
    };
  }

  // The car picker with Check in / Check out lives in the header for signed-in
  // customers only (not guests or staff), so it's on every page. Only one copy is
  // rendered (desktop or phone).
  const carBar = !user || staff ? null : (
    <CheckInForm
      variant="header"
      signedIn
      cars={store.myVehicles}
      spots={store.allSpots}
      levelName={store.floors.find((f) => f.code === store.level)?.name ?? store.level}
      onCheckIn={store.checkIn}
      onCheckOut={store.releaseSpot}
      onAddCar={() => openView('settings')}
      onReserve={() => openView('spots')}
    />
  );

  // Wait until we know whether someone is signed in, so the wrong page never flashes.
  if (!ready) {
    return (
      <div className="splash" role="status">
        <div className="brand-mark">R</div>
        <span className="muted">Loading RushHourParkingSystem…</span>
      </div>
    );
  }

  return (
    <div className="app">
      <ServerBanner />
      {/* Desktop gets a header and footer; phones get MobileHeader. */}
      <AppHeader onHome={goHome} badge={roleBadge} lotName={lotName} onNavigate={openView} onOpenAuth={openAuth} carBar={mobile ? null : carBar} />
      <MobileHeader items={navItems} active={active} onNavigate={navigate} onOpenView={openView} onOpenAuth={openAuth} onHome={goHome} badge={roleBadge} carBar={mobile ? carBar : null} />

      <div className={`app-body${user ? ' has-nav' : ''}`}>
      {/* Navigation is for signed-in users only; guests get the landing page. */}
      {user && <Sidebar items={navItems} active={active} onNavigate={navigate} />}
      <div className="content">
        <main id="overview" className="main">
          {view === 'dashboard' && <Dashboard page="overview" requireAuth={requireAuth} onOpenView={openView} />}
          {view === 'spots' && user && !staff && <Dashboard page="spots" requireAuth={requireAuth} onOpenView={openView} />}
          {/* Staff only (admins and attendants): customers never get a route to this page. */}
          {view === 'admin' && staff && <AdminPage key={adminFilter} filter={adminFilter} />}
          {view === 'profile' && user && <ProfilePage />}
          {view === 'settings' && user && <SettingsPage />}
          {view === 'users' && admin && <UsersPage />}
          {view === 'activity' && admin && <ActivitiesPage />}
          {view === 'lot' && admin && <ManageLotPage />}
          {view === 'reservations' && user && !staff && <ReservationsPage onOpenView={openView} />}
          {view === 'payments' && user && !staff && <PaymentsPage />}
        </main>
      </div>
      </div>
      <AppFooter lotName={lotName} address={address} rules={rules} />

      <AuthModal
        open={auth.open}
        mode={auth.mode}
        message={auth.message}
        onModeChange={(mode) => setAuth((a) => ({ ...a, mode, message: '' }))}
        onClose={() => setAuth((a) => ({ ...a, open: false }))}
      />
    </div>
  );
}

// Customers' Overview and Spots pages. Overview: check-in, counts, map, activity.
// Spots: the spot map with the selected spot (reserve, cancel, check out).
// Guests have no left panel, so their landing page shows both.
function Dashboard({ page, requireAuth, onOpenView }) {
  const { user } = useAuth();
  const raw = useParkingStore();
  const [reserving, setReserving] = useState(null); // spot code while the reserve pop-up is open
  const release = requireAuth(raw.release, 'Sign in to check out vehicles.');
  const openReserve = requireAuth(() => setReserving(raw.selected), 'Sign in to reserve spots.');
  const addCar = () => {
    setReserving(null);
    onOpenView('settings');
  };
  const showOverview = !user || page === 'overview';
  const showSpots = !user || page === 'spots';

  return (
    <>
      <header className="page-header">
        <div>
          {(raw.lotName || raw.address) && (
            <div className="muted">{[raw.lotName, raw.address].filter(Boolean).join(' · ')}</div>
          )}
          <h1>{showOverview ? 'Parking overview' : 'Spots'}</h1>
        </div>
      </header>

      {/* Customers and guests don't see reservations as their own count: a held spot is simply taken. */}
      {showOverview && <SummaryCards level={raw.level} levelName={raw.floors.find((f) => f.code === raw.level)?.name} counts={raw.counts} rate={raw.hourlyRate} showReserved={isStaff(user)} floors={raw.floors} onLevelChange={raw.setLevel} />}

      {showSpots ? (
        <div className="split">
          <SpotGrid
            levels={raw.floors}
            level={raw.level}
            onLevelChange={raw.setLevel}
            spots={raw.levelSpots}
            selected={raw.selected}
            onSelect={raw.select}
          />
          <aside className="side">
            <SpotDetail key={raw.selected} id={raw.selected} spot={raw.selectedSpot} onReserve={openReserve} onRelease={release} />
            {showOverview && <MapCard />}
          </aside>
        </div>
      ) : (
        <MapCard />
      )}

      {/* Recent activity is for signed-in users only. */}
      {user && showOverview && <ActivityLog entries={raw.log} />}

      {showSpots && (
        <ReserveDialog
          open={Boolean(reserving && user)}
          spotCode={reserving}
          cars={raw.myVehicles}
          rate={raw.hourlyRate}
          rules={raw.rules}
          onClose={() => setReserving(null)}
          onReserve={(details) => raw.reserve(reserving, details)}
          onAddCar={addCar}
        />
      )}
    </>
  );
}

// Shown when the API or database can't be reached; retries on its own every 15 s.
function ServerBanner() {
  const { error, refresh } = useParkingStore();
  if (!error) return null;
  return (
    <div className="server-banner" role="alert">
      <span>{error}</span>
      <button type="button" className="btn-inline" onClick={refresh}>
        Try again
      </button>
    </div>
  );
}
