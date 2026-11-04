import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './api.js';
import { useAuth } from './auth.jsx';
import { spotId } from './data.js';
import { useSettings } from './settings.jsx';

// One shared copy of the parking data from the database, used by the dashboard,
// Settings and the admin page. Refreshes after every change and every 15 s, so
// several people working at once see each other's updates.
const ParkingContext = createContext(null);
const REFRESH_MS = 15000;
const DEFAULT_RULES = { graceMinutes: 15, maxHoursAhead: 1, maxHours: 12 };

export function formatTime(iso, timeFormat) {
  if (!iso) return '';
  const d = new Date(iso);
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: timeFormat === '12h' });
  const today = new Date().toDateString() === d.toDateString();
  return today ? time : `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${time}`;
}

export const money = (cents) => `$${((cents ?? 0) / 100).toFixed(2)}`;

// Lengths of stay and added time go in 15-minute steps: 0.25, 0.5, … hours.
export const STEP_HOURS = 0.25;
export const durationOptions = (maxHours) =>
  Array.from({ length: Math.max(0, Math.round(maxHours / STEP_HOURS)) }, (_, i) => (i + 1) * STEP_HOURS);
// 1.25 -> '1 h 15 min', 0.5 -> '30 min', 2 -> '2 h'
export function formatHours(hours) {
  const total = Math.round((hours ?? 0) * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h ? (m ? `${h} h ${m} min` : `${h} h`) : `${m} min`;
}
// Same rounding as the server: hourly rate (dollars) × hours, to the cent.
export const priceCents = (rate, hours) => (rate != null ? Math.round(Math.round(rate * 100) * hours) : null);

function duration(ms) {
  const mins = Math.max(1, Math.round(ms / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? (m ? `${h} h ${m} min` : `${h} h`) : `${m} min`;
}

// Check-out warning: paid time that's left over isn't refunded.
export function checkoutNote(spot) {
  if (!spot?.paidUntilMs) return '';
  const left = spot.paidUntilMs - Date.now();
  if (left <= 0) return '';
  return `Your paid time runs until ${spot.paidUntil}. Checking out now won't refund the remaining ${duration(left)}.`;
}

export function ParkingProvider({ children }) {
  const { settings } = useSettings();
  const { user } = useAuth();
  const userId = user?.id;
  const startLevel = settings.defaultLevel || 'L1';

  const [floors, setFloors] = useState([]);
  const [rawSpots, setRawSpots] = useState([]);
  const [rawLog, setRawLog] = useState([]);
  const [rawVehicles, setRawVehicles] = useState([]);
  const [hourlyRate, setHourlyRateState] = useState(null);
  const [lotInfo, setLotInfo] = useState({ lotName: '', address: '' });
  const [rules, setRules] = useState(DEFAULT_RULES);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [changes, setChanges] = useState(0); // bumps after every change made here
  const [level, setLevelState] = useState(startLevel);
  const [selected, setSelected] = useState(spotId(startLevel, 3));

  const refresh = useCallback(async () => {
    try {
      const none = (key) => Promise.resolve({ [key]: [] });
      const [s, a, lot, v] = await Promise.all([
        api('/spots'),
        userId ? api('/activity?limit=8') : none('entries'),
        api('/lot'),
        userId ? api('/me/vehicles') : none('vehicles'),
      ]);
      setHourlyRateState(lot.hourlyRate);
      setLotInfo({ lotName: lot.lotName ?? '', address: lot.address ?? '' });
      setRules({ ...DEFAULT_RULES, ...lot.rules });
      setFloors(s.floors);
      setRawSpots(s.spots);
      setRawLog(a.entries);
      setRawVehicles(v.vehicles);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setReady(true);
    }
  }, [userId]);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  // If the chosen level doesn't exist in the database, fall back to the first one.
  useEffect(() => {
    if (floors.length && !floors.some((f) => f.code === level)) {
      setLevelState(floors[0].code);
      setSelected(spotId(floors[0].code, 1));
    }
  }, [floors, level]);

  const tf = settings.timeFormat;
  const allSpots = useMemo(
    () =>
      rawSpots.map((s) => {
        const holdUntil = s.reservedFor
          ? new Date(new Date(s.reservedFor).getTime() + rules.graceMinutes * 60000).toISOString()
          : null;
        let timeLabel = '';
        if (s.status === 'occupied' && s.since) timeLabel = `since ${formatTime(s.since, tf)}`;
        if (s.status === 'reserved') {
          timeLabel = s.reservedFor ? `arrives ${formatTime(s.reservedFor, tf)}` : s.since ? `held since ${formatTime(s.since, tf)}` : '';
        }
        // A checked-in reservation keeps its paid length of stay.
        const paidUntilIso =
          s.status === 'occupied' && s.reservedMinutes && s.since
            ? new Date(new Date(s.since).getTime() + s.reservedMinutes * 60000).toISOString()
            : null;
        return {
          id: s.code,
          level: s.floor,
          number: s.number,
          paidUntil: formatTime(paidUntilIso, tf),
          paidUntilMs: paidUntilIso ? Date.parse(paidUntilIso) : null,
          reservedForIso: s.reservedFor ?? null,
          status: s.status,
          mine: Boolean(s.mine),
          plate: s.plate ?? '',
          since: formatTime(s.since, tf),
          reservedFor: formatTime(s.reservedFor, tf),
          holdUntil: formatTime(holdUntil, tf),
          reservedHours: s.reservedMinutes ? s.reservedMinutes / 60 : null,
          reservedAmountCents: s.reservedAmountCents ?? null,
          customerName: s.customerName ?? '', // staff only
          customerEmail: s.customerEmail ?? '',
          hasDeadline: Boolean(s.reservedFor),
          timeLabel,
        };
      }),
    [rawSpots, tf, rules.graceMinutes]
  );

  const levelSpots = useMemo(() => allSpots.filter((s) => s.level === level), [allSpots, level]);

  const counts = useMemo(() => {
    const c = { free: 0, occupied: 0, reserved: 0 };
    levelSpots.forEach((s) => c[s.status]++);
    return c;
  }, [levelSpots]);

  const totals = useMemo(() => {
    const c = { total: 0, free: 0, occupied: 0, reserved: 0 };
    allSpots.forEach((s) => {
      c.total++;
      c[s.status]++;
    });
    return c;
  }, [allSpots]);

  const log = useMemo(
    () =>
      rawLog.map((e) => ({
        key: e.id,
        time: formatTime(e.time, tf),
        plate: e.plate || '—',
        spot: e.spot || '—',
        event: e.event,
        amount: e.amount_cents != null ? money(e.amount_cents) : '—',
      })),
    [rawLog, tf]
  );

  // My cars: status is 'parked', 'reserved' or null (free to use).
  const myVehicles = useMemo(
    () => rawVehicles.map((v) => ({ ...v, reservedFor: formatTime(v.reservedFor, tf) })),
    [rawVehicles, tf]
  );

  // Run a change, then reload so the screen matches the database.
  async function mutate(request) {
    try {
      return await request();
    } finally {
      await refresh();
      setChanges((n) => n + 1);
    }
  }

  function setLevel(next) {
    setLevelState(next);
    setSelected(spotId(next, 1));
  }

  async function checkIn(plate) {
    const r = await mutate(() => api('/check-in', { method: 'POST', body: { plate, floor: level } }));
    const parkedLevel = r.spot.split('-')[0];
    if (parkedLevel !== level) setLevelState(parkedLevel);
    setSelected(r.spot);
    return r; // { spot, chargedCents }
  }

  const selectedSpot = allSpots.find((s) => s.id === selected);

  const value = {
    ready,
    error,
    refresh,
    changes,
    floors,
    level,
    setLevel,
    levelSpots,
    counts,
    allSpots,
    totals,
    log,
    rules,
    selected,
    selectedSpot,
    selectedStatus: selectedSpot?.status ?? 'free',
    select: setSelected,
    myVehicles,
    // Hold a spot for one of my cars. `reservedFor` is an ISO time; `hours` a whole number.
    reserve: (code, { plate, reservedFor, hours }) =>
      mutate(() => api(`/spots/${code}/reserve`, { method: 'POST', body: { plate, reservedFor, hours } })),
    release: () => mutate(() => api(`/spots/${selected}/release`, { method: 'POST' })),
    // Add paid time to one of my parked cars (processed now).
    addTime: (code, hours) => mutate(() => api(`/spots/${code}/extend`, { method: 'POST', body: { hours } })),
    releaseSpot: (code) => mutate(() => api(`/spots/${code}/release`, { method: 'POST' })),
    checkIn,
    addVehicle: async (plate) => {
      const d = await api('/me/vehicles', { method: 'POST', body: { plate } });
      setRawVehicles(d.vehicles);
    },
    removeVehicle: async (id) => {
      const d = await api(`/me/vehicles/${id}`, { method: 'DELETE' });
      setRawVehicles(d.vehicles);
    },
    hourlyRate, // number of dollars, or null when not set
    lotName: lotInfo.lotName, // set by admins, shown to everyone
    address: lotInfo.address,
    // Admin only (the server checks the role). Send any of { hourlyRate, lotName, address }.
    setLotSettings: async (changes) => {
      const d = await api('/admin/lot', { method: 'PUT', body: changes });
      setHourlyRateState(d.hourlyRate);
      setLotInfo({ lotName: d.lotName, address: d.address });
      return d;
    },
    // Reserve a free spot for a customer, with one of their cars.
    adminReserve: (code, { userId, vehicleId, reservedFor, hours }) =>
      mutate(() => api(`/admin/spots/${code}/reserve`, { method: 'POST', body: { userId, vehicleId, reservedFor, hours } })),
    setSpotStatus: (id, status, plate) =>
      mutate(() => api(`/admin/spots/${id}/status`, { method: 'POST', body: { status, plate: plate || null } })),
    // Staff: change a reservation's arrival time and/or length.
    staffEditReservation: (code, changes) => mutate(() => api(`/admin/spots/${code}/reservation`, { method: 'PATCH', body: changes })),
    // Staff: add paid time to an occupied spot (the extra cost is processed now).
    staffAddTime: (code, hours) => mutate(() => api(`/admin/spots/${code}/extend`, { method: 'POST', body: { hours } })),
    // Admin: the lot's levels and spots (Manage parking lot).
    addLevel: (name, spots) => mutate(() => api('/admin/floors', { method: 'POST', body: { name, spots } })),
    renameLevel: (code, name) => mutate(() => api(`/admin/floors/${code}`, { method: 'PATCH', body: { name } })),
    removeLevel: (code) => mutate(() => api(`/admin/floors/${code}`, { method: 'DELETE' })),
    addSpots: (code, count) => mutate(() => api(`/admin/floors/${code}/spots`, { method: 'POST', body: { count } })),
    removeSpots: (codes) => mutate(() => api('/admin/spots/remove', { method: 'POST', body: { codes } })),
    reopenSession: (sessionId) => mutate(() => api(`/admin/sessions/${sessionId}/reopen`, { method: 'POST' })),
  };

  return <ParkingContext.Provider value={value}>{children}</ParkingContext.Provider>;
}

export function useParkingStore() {
  return useContext(ParkingContext);
}
