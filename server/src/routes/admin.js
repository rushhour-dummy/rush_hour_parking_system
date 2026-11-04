import bcrypt from 'bcryptjs';
import express from 'express';
import { publicUser, requireAdmin, requireStaff } from '../auth.js';
import { adjustFee, cancelFee, holdFee, restoreFee } from '../billing.js';
import { pool, withTransaction } from '../db.js';
import { expireNoShows } from '../expiry.js';
import { addParkedTime } from '../extend.js';
import layoutRoutes from './layout.js';
import {
  assertVehicleFree,
  checkArrival,
  checkHours,
  formatHours,
  priceFor,
  checkReservationTime,
  normalizePhone,
  endSession,
  HttpError,
  lockSpot,
  logActivity,
  normalizePlate,
  text,
  upsertVehicle,
} from '../util.js';

// Staff routes (admins and attendants) unless marked requireAdmin. All checked on the server.
const router = express.Router();
router.use(requireStaff);
router.use(layoutRoutes); // levels, spots and Activities (each route is admin only)

const KIND = { reserved: 'reservation', occupied: 'parked' };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Set a spot to open, reserved or occupied (used by the admin page and its Undo).
router.post('/spots/:code/status', async (req, res) => {
  const status = String(req.body?.status ?? '');
  if (!['free', 'reserved', 'occupied'].includes(status)) throw new HttpError(400, 'Unknown status.');
  const plate = normalizePlate(req.body?.plate, { required: status === 'occupied' });

  const result = await withTransaction(async (conn) => {
    const { spot, session } = await lockSpot(conn, req.params.code);
    let event;
    let endedSessionId = null;
    let createdSessionId = null;
    if (session) {
      await endSession(conn, session.id, req.user.id, 'admin');
      if (session.kind === 'reservation') await cancelFee(conn, session.id); // staff cancellation: not charged
      endedSessionId = session.id;
      event = session.kind === 'parked' ? 'Check out (admin)' : 'Reservation cancelled (admin)';
    }
    let vehicleId = session?.vehicle_id ?? null;
    if (status !== 'free') {
      vehicleId = plate ? await upsertVehicle(conn, plate) : null;
      await assertVehicleFree(conn, vehicleId, plate);
      // An admin hold has no arrival time, so it never expires on its own.
      const [r] = await conn.execute(
        'INSERT INTO parking_sessions (spot_id, vehicle_id, kind, started_at, created_by) VALUES (?, ?, ?, UTC_TIMESTAMP(), ?)',
        [spot.id, vehicleId, KIND[status], req.user.id]
      );
      createdSessionId = r.insertId;
      event = status === 'reserved' ? 'Reserved (admin)' : 'Check in (admin)';
    }
    if (event) await logActivity(conn, { spotId: spot.id, vehicleId, userId: req.user.id, event });
    return { endedSessionId, createdSessionId };
  });

  res.json({ ok: true, ...result });
});

// Undo an admin check-out or cancellation: reopens the original session, so
// its start time, arrival time and price come back unchanged.
// Edit a reservation's arrival time and/or length (staff). Its pending fee and
// expiration follow: extra hours are priced at the current rate.
router.patch('/spots/:code/reservation', async (req, res) => {
  await expireNoShows();
  const b = req.body ?? {};
  const result = await withTransaction(async (conn) => {
    const { spot, session } = await lockSpot(conn, req.params.code);
    if (!session || session.kind !== 'reservation') throw new HttpError(409, `${spot.code} has no reservation to edit.`);
    const [[r]] = await conn.execute(
      'SELECT reserved_for, reserved_minutes, reserved_amount_cents, customer_id, created_by, vehicle_id FROM parking_sessions WHERE id = ?',
      [session.id]
    );
    if (!r.reserved_for || !r.reserved_minutes) {
      throw new HttpError(409, 'This is a staff hold with no arrival time. Cancel it and reserve for the customer instead.');
    }
    const when = 'reservedFor' in b ? checkArrival(b.reservedFor) : r.reserved_for;
    const hours = 'hours' in b ? checkHours(b.hours) : r.reserved_minutes / 60;
    const [[lot]] = await conn.query('SELECT hourly_rate_cents FROM lot_settings WHERE id = 1');
    const deltaCents = priceFor(lot?.hourly_rate_cents, hours - r.reserved_minutes / 60);
    const amountCents = Math.max(0, (r.reserved_amount_cents ?? 0) + deltaCents);
    await conn.execute('UPDATE parking_sessions SET reserved_for = ?, reserved_minutes = ?, reserved_amount_cents = ? WHERE id = ?', [
      when,
      hours * 60,
      amountCents,
      session.id,
    ]);
    await adjustFee(conn, {
      sessionId: session.id,
      userId: r.customer_id ?? r.created_by,
      vehicleId: r.vehicle_id,
      deltaCents,
      description: `Reservation at ${spot.code} (${formatHours(hours)})`,
    });
    const oldHours = r.reserved_minutes / 60;
    await logActivity(conn, {
      spotId: spot.id,
      vehicleId: r.vehicle_id,
      userId: req.user.id,
      event: 'Reservation edited (staff)',
      amountCents: deltaCents || null,
      details: { arrival: [r.reserved_for, when], hours: [oldHours, hours], fee: [r.reserved_amount_cents ?? 0, amountCents] },
    });
    return { spot: spot.code, reservedFor: when, hours, amountCents };
  });
  res.json(result);
});

// Add paid time to an occupied spot (staff). The extra cost is processed now and
// the paid-until time moves later: from the current paid-until time, or from
// now if there isn't one or it has passed.
router.post('/spots/:code/extend', async (req, res) => {
  const hours = checkHours(req.body?.hours, { label: 'how much time to add' });
  const result = await withTransaction((conn) => addParkedTime(conn, { code: req.params.code, hours, userId: req.user.id }));
  res.json(result);
});

router.post('/sessions/:id/reopen', async (req, res) => {
  const id = Number(req.params.id);
  await withTransaction(async (conn) => {
    const [[s]] = await conn.execute(
      'SELECT id, kind, spot_id, vehicle_id, ended_at, end_reason FROM parking_sessions WHERE id = ? FOR UPDATE',
      [id]
    );
    if (!s) throw new HttpError(404, 'That session does not exist.');
    if (!s.ended_at) throw new HttpError(409, 'That session is already open.');
    if (s.end_reason !== 'admin') throw new HttpError(409, 'Only admin changes can be undone.');
    try {
      await conn.execute('UPDATE parking_sessions SET ended_at = NULL, ended_by = NULL, end_reason = NULL WHERE id = ?', [id]);
      if (s.kind === 'reservation') await restoreFee(conn, id); // its fee is pending again
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') throw new HttpError(409, "Can't undo: that spot or car is in use now.");
      throw err;
    }
    await logActivity(conn, { spotId: s.spot_id, vehicleId: s.vehicle_id, userId: req.user.id, event: 'Undo (admin)' });
  });
  res.json({ ok: true });
});

// Hourly rate: only admins can set it. Send a number of dollars, or null to clear it.
// Lot-wide settings: hourly rate, lot name and address. Only the fields sent are changed.
router.put('/lot', requireAdmin, async (req, res) => {
  const body = req.body ?? {};
  const sets = [];
  const args = [];
  if ('hourlyRate' in body) {
    const raw = body.hourlyRate;
    let cents = null;
    if (raw !== null && String(raw).trim() !== '') {
      const value = String(raw).trim().replace(/^\$/, '');
      if (!/^\d{1,4}(\.\d{1,2})?$/.test(value) || Number(value) > 1000) {
        throw new HttpError(400, 'Enter an hourly rate from 0 to 1000, with up to two decimals (e.g. 3.50).');
      }
      cents = Math.round(Number(value) * 100);
    }
    sets.push('hourly_rate_cents = ?');
    args.push(cents);
  }
  if ('lotName' in body) {
    sets.push('lot_name = ?');
    args.push(text(body.lotName, 100) || null);
  }
  if ('address' in body) {
    sets.push('address = ?');
    args.push(text(body.address, 200) || null);
  }
  if (sets.length) {
    await pool.execute('INSERT IGNORE INTO lot_settings (id) VALUES (1)');
    await pool.execute(`UPDATE lot_settings SET ${sets.join(', ')}, updated_by = ? WHERE id = 1`, [...args, req.user.id]);
    const changed = ['hourlyRate', 'lotName', 'address'].filter((k) => k in body);
    await logActivity(pool, { userId: req.user.id, event: 'Lot details updated', details: { changed } });
  }
  const [[row]] = await pool.query('SELECT hourly_rate_cents, lot_name, address FROM lot_settings WHERE id = 1');
  res.json({
    hourlyRate: row.hourly_rate_cents != null ? row.hourly_rate_cents / 100 : null,
    lotName: row.lot_name ?? '',
    address: row.address ?? '',
  });
});

// ---- Reserve a spot for a customer ------------------------------------------
// Same rules as a customer's own reservation (arrival time window, length,
// price, no-show charge). The customer is the one charged if they don't show.
router.post('/spots/:code/reserve', async (req, res) => {
  await expireNoShows();
  const userId = Number(req.body?.userId);
  const vehicleId = Number(req.body?.vehicleId);
  if (!userId) throw new HttpError(400, 'Choose a customer.');
  if (!vehicleId) throw new HttpError(400, "Choose one of the customer's cars.");
  const { when, hours } = checkReservationTime(req.body);

  const result = await withTransaction(async (conn) => {
    const [[customer]] = await conn.execute('SELECT id, name, role FROM users WHERE id = ?', [userId]);
    if (!customer || customer.role !== 'customer') throw new HttpError(404, 'That customer was not found.');
    const [[car]] = await conn.execute('SELECT id, plate FROM vehicles WHERE id = ? AND owner_user_id = ?', [vehicleId, userId]);
    if (!car) throw new HttpError(400, "That car isn't one of this customer's cars.");
    const { spot, session } = await lockSpot(conn, req.params.code);
    if (session) throw new HttpError(409, `${spot.code} is no longer open.`);
    await assertVehicleFree(conn, car.id, car.plate);
    const [[lot]] = await conn.query('SELECT hourly_rate_cents FROM lot_settings WHERE id = 1');
    const amountCents = priceFor(lot?.hourly_rate_cents, hours);
    try {
      await conn.execute(
        `INSERT INTO parking_sessions
           (spot_id, vehicle_id, kind, started_at, reserved_for, reserved_minutes, reserved_amount_cents, created_by, customer_id)
         VALUES (?, ?, 'reservation', UTC_TIMESTAMP(), ?, ?, ?, ?, ?)`,
        [spot.id, car.id, when, hours * 60, amountCents, req.user.id, customer.id]
      );
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'That spot or car was just taken. Try again.');
      throw err;
    }
    const [[{ id: sessionId }]] = await conn.query('SELECT LAST_INSERT_ID() AS id');
    await holdFee(conn, { userId: customer.id, vehicleId: car.id, sessionId, amountCents, description: `Reservation at ${spot.code} (${formatHours(hours)})` });
    await logActivity(conn, { spotId: spot.id, vehicleId: car.id, userId: req.user.id, event: 'Reserved by staff', amountCents: amountCents || null, details: { customer: customer.name, arrival: when, hours } });
    return { spot: spot.code, customer: customer.name, plate: car.plate, amountCents };
  });
  res.status(201).json(result);
});

// ---- Users -----------------------------------------------------------------
const ROLES = ['customer', 'attendant', 'admin'];
const roleFrom = (value) => {
  const role = String(value ?? '').toLowerCase();
  if (!ROLES.includes(role)) throw new HttpError(400, 'Role must be Customer, Attendant or Admin.');
  return role;
};
function checkNewPassword(password) {
  if (password.length < 8) throw new HttpError(400, 'Password must be at least 8 characters.');
  if (password.length > 200) throw new HttpError(400, 'Password is too long.');
}
const USER_FIELDS = 'id, name, email, phone, role, account_balance_cents, created_at, last_login_at';
const adminView = (r) => ({
  ...publicUser(r),
  balanceCents: r.account_balance_cents,
  createdAt: r.created_at,
  lastLoginAt: r.last_login_at,
});
async function otherAdmins(conn, exceptId) {
  const [[{ n }]] = await conn.execute("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND id <> ?", [exceptId]);
  return n;
}

// Everyone with an account, newest first.
router.get('/users', requireAdmin, async (_req, res) => {
  const [rows] = await pool.query(`SELECT ${USER_FIELDS} FROM users ORDER BY created_at DESC, id DESC`);
  res.json({ users: rows.map(adminView) });
});

// Customers to reserve for (staff): just what the picker needs.
router.get('/customers', async (_req, res) => {
  const [rows] = await pool.query("SELECT id, name, email FROM users WHERE role = 'customer' ORDER BY name, email");
  res.json({ customers: rows });
});

// A user's cars and where each one is (for "Reserve for a customer").
router.get('/users/:id/vehicles', async (req, res) => {
  await expireNoShows();
  const [rows] = await pool.query(
    `SELECT v.id, v.plate, ps.kind, s.code AS spot
     FROM vehicles v
     LEFT JOIN parking_sessions ps ON ps.vehicle_id = v.id AND ps.ended_at IS NULL
     LEFT JOIN spots s ON s.id = ps.spot_id
     WHERE v.owner_user_id = ? ORDER BY v.plate`,
    [Number(req.params.id)]
  );
  res.json({
    vehicles: rows.map((r) => ({
      id: r.id,
      plate: r.plate,
      status: r.kind === 'parked' ? 'parked' : r.kind === 'reservation' ? 'reserved' : null,
      spot: r.spot,
    })),
  });
});

// Add a user. Customers by default; admins can also add other admins.
router.post('/users', requireAdmin, async (req, res) => {
  const name = text(req.body?.name, 100);
  const email = text(req.body?.email, 255).toLowerCase();
  const phone = normalizePhone(req.body?.phone);
  const password = String(req.body?.password ?? '');
  const role = req.body?.role ? roleFrom(req.body.role) : 'customer';
  if (!name) throw new HttpError(400, 'Enter a name.');
  if (!EMAIL.test(email)) throw new HttpError(400, 'Enter a valid email address.');
  checkNewPassword(password);

  const hash = await bcrypt.hash(password, 12);
  let id;
  try {
    const [r] = await pool.execute('INSERT INTO users (name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, ?)', [
      name,
      email,
      phone,
      hash,
      role,
    ]);
    id = r.insertId;
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'An account with that email already exists.');
    throw err;
  }
  const [[row]] = await pool.execute(`SELECT ${USER_FIELDS} FROM users WHERE id = ?`, [id]);
  res.status(201).json({ user: adminView(row) });
});

// Edit a user: any of { name, email, phone, role, password }. A new password
// signs that user out everywhere.
router.patch('/users/:id', requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const b = req.body ?? {};
  await withTransaction(async (conn) => {
    const [[u]] = await conn.execute('SELECT id, role FROM users WHERE id = ? FOR UPDATE', [id]);
    if (!u) throw new HttpError(404, 'That user was not found.');
    const sets = [];
    const args = [];
    if ('name' in b) {
      const name = text(b.name, 100);
      if (!name) throw new HttpError(400, 'Name is required.');
      sets.push('name = ?');
      args.push(name);
    }
    if ('email' in b) {
      const email = text(b.email, 255).toLowerCase();
      if (!EMAIL.test(email)) throw new HttpError(400, 'Enter a valid email address.');
      sets.push('email = ?');
      args.push(email);
    }
    if ('phone' in b) {
      sets.push('phone = ?');
      args.push(normalizePhone(b.phone));
    }
    if ('role' in b) {
      const role = roleFrom(b.role);
      if (role !== u.role) {
        if (id === req.user.id) throw new HttpError(400, "You can't change your own role.");
        if (u.role === 'admin' && (await otherAdmins(conn, id)) === 0) {
          throw new HttpError(409, 'There must always be at least one admin.');
        }
        sets.push('role = ?');
        args.push(role);
      }
    }
    if (b.password) {
      const password = String(b.password);
      checkNewPassword(password);
      sets.push('password_hash = ?', 'session_version = session_version + 1');
      args.push(await bcrypt.hash(password, 12));
    }
    if (!sets.length) return;
    try {
      await conn.execute(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, [...args, id]);
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'Another account already uses that email.');
      throw err;
    }
  });
  const [[row]] = await pool.execute(`SELECT ${USER_FIELDS} FROM users WHERE id = ?`, [id]);
  res.json({ user: adminView(row) });
});

// Delete a user. Their past parking and payment records are kept (unlinked).
router.delete('/users/:id', requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user.id) throw new HttpError(400, "You can't delete your own account.");
  await withTransaction(async (conn) => {
    const [[u]] = await conn.execute('SELECT id, name, role, account_balance_cents FROM users WHERE id = ? FOR UPDATE', [id]);
    if (!u) throw new HttpError(404, 'That user was not found.');
    if (u.role === 'admin' && (await otherAdmins(conn, id)) === 0) {
      throw new HttpError(409, 'There must always be at least one admin.');
    }
    const [[{ open }]] = await conn.execute(
      `SELECT COUNT(*) AS open FROM parking_sessions ps LEFT JOIN vehicles v ON v.id = ps.vehicle_id
       WHERE ps.ended_at IS NULL AND (v.owner_user_id = ? OR ps.customer_id = ?)`,
      [id, id]
    );
    if (open > 0) throw new HttpError(409, `${u.name} has a car parked or a reservation. Check out or cancel it first.`);
    if (u.account_balance_cents > 0) {
      throw new HttpError(409, `${u.name} still owes $${(u.account_balance_cents / 100).toFixed(2)}. Settle the balance before deleting.`);
    }
    await conn.execute('DELETE FROM users WHERE id = ?', [id]);
  });
  res.status(204).end();
});

export default router;
