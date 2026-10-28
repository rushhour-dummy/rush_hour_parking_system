/* eslint-disable react-refresh/only-export-components, react-hooks/set-state-in-effect */
import { useEffect, useState } from "react";
import { AuthProvider, useAuth } from "./auth.jsx";
import { SettingsProvider, useSettings } from "./settings.jsx";
import { useParking } from "./useParking.js";
import Sidebar from "./components/Sidebar.jsx";
import MobileHeader from "./components/MobileHeader.jsx";
import ProfileMenu from "./components/ProfileMenu.jsx";
import CheckInForm from "./components/CheckInForm.jsx";
import SummaryCards from "./components/SummaryCards.jsx";
import SpotGrid from "./components/SpotGrid.jsx";
import SpotDetail from "./components/SpotDetail.jsx";
import MapCard from "./components/MapCard.jsx";
import ActivityLog from "./components/ActivityLog.jsx";
import AuthModal from "./components/AuthModal.jsx";
import ProfilePage from "./pages/ProfilePage.jsx";
import SettingsPage from "./pages/SettingsPage.jsx";

export const NAV_ITEMS = [
  { label: "Overview", view: "dashboard", href: "#overview" },
  { label: "Spots", view: "dashboard", href: "#spots" },
  { label: "Map", view: "dashboard", href: "#map" },
  { label: "Reservations", view: "dashboard", href: "#activity" },
  { label: "Payments", view: "dashboard", href: "#activity" },
  { label: "Settings", view: "settings", href: "#settings" },
];

export default function App() {
  return (
    <AuthProvider>
      <SettingsProvider>
        <Shell />
      </SettingsProvider>
    </AuthProvider>
  );
}

function Shell() {
  const { user } = useAuth();
  // The app always launches on the main dashboard.
  const [view, setView] = useState("dashboard");
  const [active, setActive] = useState("Overview");
  const [auth, setAuth] = useState({
    open: false,
    mode: "signin",
    message: "",
  });

  // Leave account pages when signed out.
  useEffect(() => {
    if (!user && view !== "dashboard") {
      setView("dashboard");
      setActive("Overview");
    }
  }, [user, view]);

  function openAuth(mode = "signin", message = "") {
    setAuth({ open: true, mode, message });
  }

  function openView(next) {
    if (next !== "dashboard" && !user) {
      openAuth(
        "signin",
        `Sign in to open ${next === "settings" ? "Settings" : "your profile"}.`,
      );
      return;
    }
    setView(next);
    setActive(
      next === "settings" ? "Settings" : next === "dashboard" ? "Overview" : "",
    );
    window.scrollTo(0, 0);
  }

  function navigate(item) {
    if (item.view !== "dashboard") return openView(item.view);
    setActive(item.label);
    setView("dashboard");
  }

  // Wraps an action so signed-out visitors get the sign-in pop-up instead.
  function requireAuth(action, message) {
    return (...args) => {
      if (!user) {
        openAuth("signin", message);
        return undefined;
      }
      return action(...args);
    };
  }

  return (
    <div className="app">
      {/* Navigation is for signed-in users only; guests get the landing page. */}
      {user && (
        <Sidebar items={NAV_ITEMS} active={active} onNavigate={navigate} />
      )}
      <MobileHeader
        items={user ? NAV_ITEMS : []}
        active={active}
        onNavigate={navigate}
        onOpenView={openView}
        onOpenAuth={openAuth}
      />

      <div className="content">
        <div className={`topbar${user ? "" : " topbar-guest"}`}>
          {!user && (
            <div className="brand topbar-brand">
              <div className="brand-mark brand-mark-sm">P</div>
              <div className="brand-name">ParkSpot</div>
            </div>
          )}
          <ProfileMenu onNavigate={openView} onOpenAuth={openAuth} />
        </div>
        <main id="overview" className="main">
          {view === "dashboard" && <Dashboard requireAuth={requireAuth} />}
          {view === "profile" && user && <ProfilePage />}
          {view === "settings" && user && <SettingsPage />}
        </main>
      </div>

      <AuthModal
        open={auth.open}
        mode={auth.mode}
        message={auth.message}
        onModeChange={(mode) => setAuth((a) => ({ ...a, mode, message: "" }))}
        onClose={() => setAuth((a) => ({ ...a, open: false }))}
      />
    </div>
  );
}

function Dashboard({ requireAuth }) {
  const { user } = useAuth();
  const { settings } = useSettings();
  const raw = useParking(settings);
  const parking = {
    ...raw,
    checkIn: requireAuth(raw.checkIn, "Sign in to check in vehicles."),
    reserve: requireAuth(raw.reserve, "Sign in to reserve spots."),
    release: requireAuth(raw.release, "Sign in to check out vehicles."),
  };

  return (
    <>
      <header className="page-header">
        <div>
          <div className="muted">
            {settings.lotName} · {settings.address}
          </div>
          <h1>Parking overview</h1>
        </div>
        <CheckInForm onCheckIn={parking.checkIn} />
      </header>

      <SummaryCards
        level={parking.level}
        counts={parking.counts}
        rate={settings.hourlyRate}
      />

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

      {/* Recent activity is for signed-in users only. */}
      {user && <ActivityLog entries={parking.log} />}
    </>
  );
}
