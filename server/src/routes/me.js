import express from 'express';
import { requireAuth } from '../auth.js';
import { cancelFee, increaseFee } from '../billing.js';
import { pool, withTransaction } from '../db.js';
import { expireNoShows } from '../expiry.js';
import { checkHours, endSession, formatHours, HttpError, logActivity, MAX_CARS_PER_USER, normalizePlate, priceFor, RESERVE_MAX_HOURS } from '../util.js';

// The signed-in user's own cars and charges.
const router = express.Router();
router.use(requireAuth);

async function listVehicles(userId) {
  const [rows] = await pool.query(
    `SELECT v.id, v.plate, ps.kind, s.code AS spot, ps.reserved_for
     FROM vehicles v
     LEFT JOIN parking_sessions ps ON ps.vehicle_id = v.id AND ps.ended_at IS NULL
     LEFT JOIN spots s ON s.id = ps.spot_id
     WHERE v.owner_user_id = ?
     ORDER BY v.plate`,
    [userId]
  );
  return rows.map((r) => ({
    id: r.id,
    plate: r.plate,
    status: r.kind === 'parked' ? 'parked' : r.kind === 'reservation' ? 'reserved' : null,
    spot: r.spot,
    reservedFor: r.reserved_for,
  }));
}

router.get('/vehicles', async (req, res) => {
  await expireNoShows();
  res.json({ vehicles: await listVehicles(req.user.id) });
});

// Add a plate to my cars.
router.post('/vehicles', async (req, res) => {
  const plate = normalizePlate(req.body?.plate, { required: true });
  await withTransaction(async (conn) => {
    const [[{ n }]] = await conn.execute('SELECT COUNT(*) AS n FROM vehicles WHERE owner_user_id = ?', [req.user.id]);
    if (n >= MAX_CARS_PER_USER) throw new HttpError(409, `You can save up to ${MAX_CARS_PER_USER} cars.`);
    const [[existing]] = await conn.execute('SELECT id, owner_user_id FROM vehicles WHERE plate = ? FOR UPDATE', [plate]);
    if (existing?.owner_user_id === req.user.id) throw new HttpError(409, `${plate} is already in your cars.`);
    if (existing?.owner_user_id) throw new HttpError(409, `${plate} is registered to another account.`);
    if (existing) {
      await conn.execute('UPDATE vehicles SET owner_user_id = ? WHERE id = ?', [req.user.id, existing.id]);
    } else {
      await conn.execute('INSERT INTO vehicles (plate, owner_user_id) VALUES (?, ?)', [plate, req.user.id]);
    }
  });
  res.status(201).json({ vehicles: await listVehicles(req.user.id) });
});

// Remove a plate from my cars (its parking history is kept).
router.delete('/vehicles/:id', async (req, res) => {
  const id = Number(req.params.id);
  await withTransaction(async (conn) => {
    const [[v]] = await conn.execute('SELECT id, plate FROM vehicles WHERE id = ? AND owner_user_id = ? FOR UPDATE', [
      id,
      req.user.id,
    ]);
    if (!v) throw new HttpError(404, 'That car is not in your list.');
    const [[open]] = await conn.execute('SELECT kind FROM parking_sessions WHERE vehicle_id = ? AND ended_at IS NULL', [id]);
    if (open) {
      throw new HttpError(409, `${v.plate} is ${open.kind === 'parked' ? 'parked' : 'reserved'} right now. Check out or cancel first.`);
    }
    await conn.execute('UPDATE vehicles SET owner_user_id = NULL WHERE id = ?', [id]);
  });
  res.json({ vehicles: await listVehicles(req.user.id) });
});

// ---- Reservations --------------------------------------------------------
// A reservation is mine if I made it or it's for one of my cars.
const MINE = '(ps.created_by = ? OR ps.customer_id = ? OR v.owner_user_id = ?)';

const OUTCOME = { checked_in: 'checked_in', checked_out: 'checked_in', cancelled: 'cancelled', no_show: 'no_show', admin: 'cancelled_by_admin' };

// Current (holding a spot) and past reservations, newest first.
router.get('/reservations', async (req, res) => {
  await expireNoShows();
  const [rows] = await pool.query(
    `SELECT ps.id, s.code AS spot, v.plate, ps.started_at, ps.reserved_for, ps.reserved_minutes,
            ps.reserved_amount_cents, ps.ended_at, ps.end_reason, c.amount_cents AS charged_cents, c.status AS charge_status
     FROM parking_sessions ps
     JOIN spots s ON s.id = ps.spot_id
     LEFT JOIN vehicles v ON v.id = ps.vehicle_id
     LEFT JOIN charges c ON c.session_id = ps.id
     WHERE ps.kind = 'reservation' AND ${MINE}
     ORDER BY ps.ended_at IS NULL DESC, ps.started_at DESC, ps.id DESC
     LIMIT 50`,
    [req.user.id, req.user.id, req.user.id]
  );
  res.json({
    reservations: rows.map((r) => ({
      id: r.id,
      spot: r.spot,
      plate: r.plate,
      bookedAt: r.started_at,
      arrival: r.reserved_for,
      hours: r.reserved_minutes ? r.reserved_minutes / 60 : null,
      amountCents: r.reserved_amount_cents,
      endedAt: r.ended_at,
      status: r.ended_at ? OUTCOME[r.end_reason] ?? 'ended' : 'active',
      chargedCents: r.charged_cents,
      chargeStatus: r.charge_status, // 'due' (pending), 'paid' (processed) or 'waived' (cancelled)
    })),
    maxHours: RESERVE_MAX_HOURS,
  });
});

// Locks one of my open reservations for the rest of the transaction.
async function lockMyOpenReservation(conn, id, userId) {
  const [[r]] = await conn.execute(
    `SELECT ps.id, ps.spot_id, ps.vehicle_id, ps.ended_at, ps.reserved_minutes, ps.reserved_amount_cents, ps.customer_id, ps.created_by, s.code
     FROM parking_sessions ps JOIN spots s ON s.id = ps.spot_id LEFT JOIN vehicles v ON v.id = ps.vehicle_id
     WHERE ps.id = ? AND ps.kind = 'reservation' AND ${MINE} FOR UPDATE`,
    [id, userId, userId, userId]
  );
  if (!r) throw new HttpError(404, 'That reservation was not found.');
  if (r.ended_at) throw new HttpError(409, 'This reservation has already ended.');
  return r;
}

router.post('/reservations/:id/cancel', async (req, res) => {
  await expireNoShows(); // a reservation past its deadline is a no-show, not a free cancel
  await withTransaction(async (conn) => {
    const r = await lockMyOpenReservation(conn, Number(req.params.id), req.user.id);
    await endSession(conn, r.id, req.user.id, 'cancelled');
    await cancelFee(conn, r.id); // not charged
    await logActivity(conn, { spotId: r.spot_id, vehicleId: r.vehicle_id, userId: req.user.id, event: 'Reservation cancelled' });
  });
  res.json({ ok: true });
});

// Add hours to a reservation's length of stay. The extra hours are priced at the
// current hourly rate. The arrival time (and so the check-in deadline) doesn't change.
router.post('/reservations/:id/extend', async (req, res) => {
  const hours = checkHours(req.body?.hours, { label: 'how much time to add' });
  await expireNoShows();
  const result = await withTransaction(async (conn) => {
    const r = await lockMyOpenReservation(conn, Number(req.params.id), req.user.id);
    if (!r.reserved_minutes) throw new HttpError(409, "This hold has no length of stay, so time can't be added.");
    const minutes = r.reserved_minutes + hours * 60;
    if (minutes > RESERVE_MAX_HOURS * 60) {
      throw new HttpError(409, `A reservation can be at most ${RESERVE_MAX_HOURS} hours long.`);
    }
    const [[lot]] = await conn.query('SELECT hourly_rate_cents FROM lot_settings WHERE id = 1');
    const extraCents = priceFor(lot?.hourly_rate_cents, hours);
    const amountCents = (r.reserved_amount_cents ?? 0) + extraCents;
    await conn.execute('UPDATE parking_sessions SET reserved_minutes = ?, reserved_amount_cents = ? WHERE id = ?', [
      minutes,
      amountCents,
      r.id,
    ]);
    await increaseFee(conn, {
      sessionId: r.id,
      userId: r.customer_id ?? r.created_by,
      vehicleId: r.vehicle_id,
      extraCents,
      description: `Reservation at ${r.code} (${formatHours(minutes / 60)})`,
    });
    await logActivity(conn, {
      spotId: r.spot_id,
      vehicleId: r.vehicle_id,
      userId: req.user.id,
      event: `Reservation extended (+${formatHours(hours)})`,
      amountCents: extraCents || null,
      details: { hours: [r.reserved_minutes / 60, minutes / 60] },
    });
    return { hours: minutes / 60, amountCents, extraCents };
  });
  res.json(result);
});

// My account: current balance and the transaction ledger, newest first.
router.get('/account', async (req, res) => {
  await expireNoShows();
  const [[user]] = await pool.execute('SELECT account_balance_cents FROM users WHERE id = ?', [req.user.id]);
  const [rows] = await pool.query(
    `SELECT t.id, t.type, t.amount_cents, t.balance_after_cents, t.status, t.description, t.created_at,
            c.reason, v.plate, s.code AS spot, ps.reserved_for
     FROM account_transactions t
     LEFT JOIN charges c ON c.id = t.charge_id
     LEFT JOIN vehicles v ON v.id = c.vehicle_id
     LEFT JOIN parking_sessions ps ON ps.id = c.session_id
     LEFT JOIN spots s ON s.id = ps.spot_id
     WHERE t.user_id = ?
     ORDER BY t.created_at DESC, t.id DESC
     LIMIT 100`,
    [req.user.id]
  );
  res.json({
    balanceCents: user?.account_balance_cents ?? 0,
    transactions: rows.map((r) => ({
      id: r.id,
      type: r.type,
      reason: r.reason,
      amountCents: r.amount_cents,
      balanceAfterCents: r.balance_after_cents,
      status: r.status,
      description: r.description,
      createdAt: r.created_at,
      plate: r.plate,
      spot: r.spot,
      reservedFor: r.reserved_for,
    })),
  });
});

// My charges, newest first.
router.get('/charges', async (req, res) => {
  await expireNoShows();
  const [rows] = await pool.query(
    `SELECT c.id, c.reason, c.amount_cents, c.status, c.description, c.created_at,
            v.plate, s.code AS spot, ps.reserved_for, ps.reserved_minutes
     FROM charges c
     LEFT JOIN vehicles v ON v.id = c.vehicle_id
     LEFT JOIN parking_sessions ps ON ps.id = c.session_id
     LEFT JOIN spots s ON s.id = ps.spot_id
     WHERE c.user_id = ?
     ORDER BY c.created_at DESC, c.id DESC
     LIMIT 50`,
    [req.user.id]
  );
  res.json({
    charges: rows.map((r) => ({
      id: r.id,
      reason: r.reason,
      amountCents: r.amount_cents,
      status: r.status,
      description: r.description,
      createdAt: r.created_at,
      plate: r.plate,
      spot: r.spot,
      reservedFor: r.reserved_for,
      reservedMinutes: r.reserved_minutes,
    })),
  });
});

export default router;
