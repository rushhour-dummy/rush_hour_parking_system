export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Reservation rules (override in server/.env if needed).
export const NO_SHOW_GRACE_MINUTES = Number(process.env.NO_SHOW_GRACE_MINUTES || 15);
export const RESERVE_MAX_HOURS_AHEAD = Number(process.env.RESERVE_MAX_HOURS_AHEAD || 1); // how far ahead a spot can be reserved
export const RESERVE_MAX_HOURS = Number(process.env.RESERVE_MAX_HOURS || 12);
export const MAX_CARS_PER_USER = 10;

export function text(value, max) {
  return String(value ?? '').trim().slice(0, max);
}

export const isAdminUser = (user) => user?.role === 'admin';
// Staff run the lot: admins and attendants.
export const isStaffUser = (user) => user?.role === 'admin' || user?.role === 'attendant';

// Lengths of stay and added time go in 15-minute steps (0.25, 0.5, … hours).
export const STEP_MINUTES = 15;

// Checks a length of time given in hours (e.g. 1.25 = 1 h 15 min). Returns hours.
export function checkHours(value, { max = RESERVE_MAX_HOURS, label = "how long you'll park" } = {}) {
  const hours = Number(value);
  const minutes = Math.round(hours * 60);
  if (!Number.isFinite(hours) || Math.abs(hours * 60 - minutes) > 1e-6 || minutes % STEP_MINUTES || minutes < STEP_MINUTES || minutes > max * 60) {
    throw new HttpError(400, `Choose ${label}: ${STEP_MINUTES} minutes to ${max} hours, in ${STEP_MINUTES}-minute steps.`);
  }
  return minutes / 60;
}

// Price for a length of time at the hourly rate, to the nearest cent.
export const priceFor = (rateCents, hours) => Math.round((rateCents ?? 0) * hours);

// 1.25 -> '1 h 15 min', 0.5 -> '30 min', 2 -> '2 h'
export function formatHours(hours) {
  const total = Math.round(hours * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h ? (m ? `${h} h ${m} min` : `${h} h`) : `${m} min`;
}

export function checkArrival(value) {
  const when = new Date(value);
  if (!value || Number.isNaN(when.getTime())) throw new HttpError(400, 'Choose an arrival time.');
  const now = Date.now();
  if (when.getTime() < now - 5 * 60 * 1000) throw new HttpError(400, 'The arrival time is in the past.');
  if (when.getTime() > now + RESERVE_MAX_HOURS_AHEAD * 60 * 60 * 1000) {
    const ahead = RESERVE_MAX_HOURS_AHEAD === 1 ? '1 hour' : `${RESERVE_MAX_HOURS_AHEAD} hours`;
    throw new HttpError(400, `Spots can only be reserved up to ${ahead} ahead.`);
  }
  return when;
}

export function checkReservationTime(body) {
  return { hours: checkHours(body?.hours), when: checkArrival(body?.reservedFor) };
}

// Phone numbers are stored as 123-456-7890. Returns null when empty.
export function normalizePhone(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length !== 10) throw new HttpError(400, 'Enter the phone number as 123-456-7890.');
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
}

const PLATE = /^[A-Z0-9][A-Z0-9 -]{0,14}[A-Z0-9]$/;

// Upper-cases and tidies a plate; returns null when empty, throws when invalid.
export function normalizePlate(value, { required = false } = {}) {
  const plate = String(value ?? '').trim().toUpperCase().replace(/\s+/g, ' ');
  if (!plate) {
    if (required) throw new HttpError(400, 'Enter a plate number.');
    return null;
  }
  if (!PLATE.test(plate)) throw new HttpError(400, 'Plates use 2–16 letters, numbers, spaces or dashes.');
  return plate;
}

// Returns the vehicle id for a plate, adding the vehicle the first time it's seen.
export async function upsertVehicle(conn, plate) {
  const [r] = await conn.execute(
    'INSERT INTO vehicles (plate) VALUES (?) ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)',
    [plate]
  );
  return r.insertId;
}

// Customers may only use cars saved under their account; staff may use any plate.
export async function vehicleForUser(conn, plate, user) {
  if (isStaffUser(user)) return upsertVehicle(conn, plate);
  const [[v]] = await conn.execute('SELECT id, owner_user_id FROM vehicles WHERE plate = ?', [plate]);
  if (!v || v.owner_user_id !== user.id) {
    throw new HttpError(403, `${plate} isn't one of your cars. Add it under Settings → My cars first.`);
  }
  return v.id;
}

// `details` is a small object (times, hours, codes) shown on the admin Activities
// page; it's stored as JSON so each viewer sees times in their own time zone.
export async function logActivity(conn, { spotId = null, vehicleId = null, userId = null, event, amountCents = null, details = null }) {
  let json = details ? JSON.stringify(details) : null;
  if (json && json.length > 255) json = JSON.stringify({ note: String(details.note ?? '').slice(0, 200) || 'Details too long to store' });
  await conn.execute(
    'INSERT INTO activity_log (spot_id, vehicle_id, user_id, event, amount_cents, details, created_at) VALUES (?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())',
    [spotId, vehicleId, userId, String(event).slice(0, 40), amountCents, json]
  );
}

// Locks a spot row for the rest of the transaction and returns it with its open session.
export async function lockSpot(conn, code) {
  const [[spot]] = await conn.execute('SELECT id, code FROM spots WHERE code = ? AND is_active = 1 FOR UPDATE', [
    String(code ?? '').toUpperCase(),
  ]);
  if (!spot) throw new HttpError(404, 'That spot does not exist.');
  const [[session]] = await conn.execute(
    'SELECT id, kind, vehicle_id, created_by, customer_id FROM parking_sessions WHERE spot_id = ? AND ended_at IS NULL',
    [spot.id]
  );
  return { spot, session: session || null };
}

// reason: 'checked_in' | 'checked_out' | 'cancelled' | 'no_show' | 'admin'
export async function endSession(conn, sessionId, userId, reason) {
  await conn.execute(
    'UPDATE parking_sessions SET ended_at = UTC_TIMESTAMP(), ended_by = ?, end_reason = ? WHERE id = ?',
    [userId, reason, sessionId]
  );
}

// Throws a friendly 409 if this vehicle already has an open session somewhere.
// This is what keeps every car to one spot (the database enforces it too).
export async function assertVehicleFree(conn, vehicleId, plate) {
  if (!vehicleId) return;
  const [[open]] = await conn.execute(
    `SELECT s.code, ps.kind FROM parking_sessions ps JOIN spots s ON s.id = ps.spot_id
     WHERE ps.vehicle_id = ? AND ps.ended_at IS NULL`,
    [vehicleId]
  );
  if (open) {
    const what = open.kind === 'parked' ? 'is already parked in' : 'already has a reservation for';
    throw new HttpError(409, `${plate} ${what} ${open.code}.`);
  }
}
