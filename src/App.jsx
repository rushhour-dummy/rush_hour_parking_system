import { useState } from 'react';
import { useParking } from './UseParking.js';
import Login from './Login.jsx';
import Sidebar from './components/Sidebar.jsx';
import MobileHeader from './components/MobileHeader.jsx';
import CheckInForm from './components/CheckInForm.jsx';
import SummaryCards from './components/SummaryCards.jsx';
import SpotGrid from './components/SpotGrid.jsx';
import SpotDetail from './components/SpotDetail.jsx';
import MapCard from './components/MapCard.jsx';
import ActivityLog from './components/ActivityLog.jsx';

const LOT_NAME = 'Rush Hour Parking';
const LOT_ADDRESS = '[ADDRESS]';

export const NAV_ITEMS = [
  { label: 'Overview', href: '#overview' },
  { label: 'Spots', href: '#spots' },
  { label: 'Map', href: '#map' },
  { label: 'Reservations', href: '#activity' },
  { label: 'Payments', href: '#activity' },
  { label: 'Settings', href: '#overview' },
];

export default function App() {
  const parking = useParking();
  const [active, setActive] = useState('Overview');
  const [user, setUser] = useState(null); // null = show login

  if (!user) {
    return <Login onLogin={setUser} />;
  }

  const handleSignOut = () => setUser(null);

  return (
    <div className="app">
      <Sidebar items={NAV_ITEMS} active={active} onNavigate={setActive} user={user} onSignOut={handleSignOut} />
      <MobileHeader items={NAV_ITEMS} active={active} onNavigate={setActive} user={user} onSignOut={handleSignOut} />

      <main id="overview" className="main">
        <header className="page-header">
          <div>

            {/* <div className="muted">{LOT_NAME} </div> */}
            
            <h1>Parking Dashboard</h1>
          </div>
          <CheckInForm onCheckIn={parking.checkIn} />
        </header>

        <SummaryCards level={parking.level} counts={parking.counts} />

        <div className="split">
          <SpotGrid
            level={parking.level}
            onLevelChange={parking.setLevel}
            spots={parking.levelSpots}
            selected={parking.selected}
            onSelect={parking.select}
          />
          <aside className="side">
            <SpotDetail
              id={parking.selected}
              status={parking.selectedStatus}
              onReserve={parking.reserve}
              onRelease={parking.release}
            />
            <MapCard />
          </aside>
        </div>

        <ActivityLog entries={parking.log} />
      </main>
    </div>
  );
}