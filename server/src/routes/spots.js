import express from 'express';
import { requireAuth } from '../auth.js';
import { pool, withTransaction } from '../db.js';
import { cancelFee, holdFee, settleFee } from '../billing.js';
import { expireNoShows } from '../expiry.js';
import { addParkedTime } from '../extend.js';
import {
  assertVehicleFree,
  checkHours,
  formatHours,
  priceFor,
  checkReservationTime,
  endSession,
  HttpError,
  isStaffUser,
  lockSpot,
  logActivity,
  normalizePlate,
  RESERVE_MAX_HOURS,
  RESERVE_MAX_HOURS_AHEAD,
  vehicleForUser,
} from '../util.js';

const router = express.Router();

// Floors and every spot's status. Guests get status only. Signed-in users also
// get the details of their own cars' spots; admins get every spot's details.
router.get('/spots', async (req, res) => {
  await expireNoShows();
  const [floors] = await pool.query('SELECT code, name FROM floors WHERE is_active = 1 ORDER BY sort_order, id');
  const [rows] = await pool.query(
    `SELECT ss.code, ss.floor_code, ss.number, ss.status, ss.plate, ss.since, ss.reserved_for, ss.reserved_minutes,
            ss.reserved_amount_cents, ss.owner_user_id, ss.created_by, ss.customer_id, cu.name AS customer_name, cu.email AS customer_email
     FROM spot_status ss
     LEFT JOIN users cu ON cu.id = COALESCE(ss.customer_id, ss.owner_user_id)
     ORDER BY ss.floor_sort, ss.floor_code, ss.number`
  );
  const me = req.user;
  const admin = isStaffUser(me);
  res.json({
    floors,
    spots: rows.map((r) => {
      const base = { code: r.code, floor: r.floor_code, number: r.number, status: r.status };
      if (!me) return base;
      const mine = r.status !== 'free' && [r.owner_user_id, r.created_by, r.customer_id].includes(me.id);
      if (!admin && !mine) return { ...base, mine: false };
      return {
        ...base,
        mine,
        plate: r.plate,
        since: r.since,
        reservedFor: r.reserved_for,
        reservedMinutes: r.reserved_minutes,
        reservedAmountCents: r.reserved_amount_cents,
        ...(admin ? { customerName: r.customer_name, customerEmail: r.customer_email } : {}),
      };
    }),
  });
});

// Lot-wide settings anyone can read. Changing them is admin-only (routes/admin.js).
router.get('/lot', async (_req, res) => {
  const [[row]] = await pool.query('SELECT hourly_rate_cents, lot_name, address FROM lot_settings WHERE id = 1');
  res.json({
    hourlyRate: row?.hourly_rate_cents != null ? row.hourly_rate_cents / 100 : null,
    lotName: row?.lot_name ?? '',
    address: row?.address ?? '',
    rules: { graceMinutes: Number(process.env.NO_SHOW_GRACE_MINUTES || 15), maxHoursAhead: RESERVE_MAX_HOURS_AHEAD, maxHours: RESERVE_MAX_HOURS, stepMinutes: 15 },
  });
});

// Check one of your cars in. This is when the parking clock starts and the
// reservation's fee is processed. Customers can only check in a car that has a
// reservation (it parks in its reserved spot). Staff can still check in a car
// without one; it takes the first open spot on the chosen floor.
router.post('/check-in', requireAuth, async (req, res) => {
  await expireNoShows();
  const plate = normalizePlate(req.body?.plate, { required: true });
  const floor = String(req.body?.floor ?? '').toUpperCase();

  const spotCode = await withTransaction(async (conn) => {
    const vehicleId = await vehicleForUser(conn, plate, req.user);
    const [[open]] = await conn.execute(
      `SELECT ps.id, ps.kind, ps.spot_id, ps.customer_id, ps.created_by, ps.reserved_minutes, ps.reserved_amount_cents, s.code
       FROM parking_sessions ps JOIN spots s ON s.id = ps.spot_id
       WHERE ps.vehicle_id = ? AND ps.ended_at IS NULL FOR UPDATE`,
      [vehicleId]
    );
    if (open?.kind === 'parked') throw new HttpError(409, `${plate} is already parked in ${open.code}.`);

    let spot;
    let event = 'Check in';
    if (open?.kind === 'reservation') {
      await endSession(conn, open.id, req.user.id, 'checked_in');
      spot = { id: open.spot_id, code: open.code };
      event = 'Check in (reserved)';
    } else if (!isStaffUser(req.user)) {
      throw new HttpError(409, `No spot is reserved for ${plate}. Reserve a spot first, then check in.`);
    } else {
      [[spot]] = await conn.execute(
        `SELECT s.id, s.code FROM spots s JOIN floors f ON f.id = s.floor_id
         WHERE f.code = ? AND s.is_active = 1
           AND NOT EXISTS (SELECT 1 FROM parking_sessions ps WHERE ps.spot_id = s.id AND ps.ended_at IS NULL)
         ORDER BY s.number LIMIT 1 FOR UPDATE`,
        [floor]
      );
      if (!spot) throw new HttpError(409, 'No open spots on this level.');
    }

    try {
      // A reserved car keeps its paid length of stay, so check-out can tell if time is left.
      await conn.execute(
        `INSERT INTO parking_sessions (spot_id, vehicle_id, kind, started_at, reserved_minutes, reserved_amount_cents, created_by, customer_id)
         VALUES (?, ?, 'parked', UTC_TIMESTAMP(), ?, ?, ?, ?)`,
        [
          spot.id,
          vehicleId,
          open?.kind === 'reservation' ? open.reserved_minutes : null,
          open?.kind === 'reservation' ? open.reserved_amount_cents : null,
          req.user.id,
          isStaffUser(req.user) ? open?.customer_id ?? null : req.user.id,
        ]
      );
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'That spot was just taken. Try again.');
      throw err;
    }
    // Checking in on a reservation processes its pending fee (see billing.js).
    let chargedCents = 0;
    if (open?.kind === 'reservation') {
      const hours = open.reserved_minutes ? formatHours(open.reserved_minutes / 60) : 'reservation';
      chargedCents = await settleFee(conn, {
        sessionId: open.id,
        userId: open.customer_id ?? open.created_by,
        vehicleId,
        amountCents: open.reserved_amount_cents ?? 0,
        reason: 'parking',
        description: `Reservation at ${spot.code} (${hours})`,
      });
    }
    await logActivity(conn, { spotId: spot.id, vehicleId, userId: req.user.id, event, amountCents: chargedCents || null });
    return { spot: spot.code, chargedCents };
  });

  res.status(201).json(spotCode);
});

// Reserve a free spot for one of your cars. The spot is held from now on, but
// the parking clock doesn't start until check-in. If the car isn't checked in
// within the grace period after `reservedFor`, the spot is released and the
// full reserved amount is charged (see expiry.js).
router.post('/spots/:code/reserve', requireAuth, async (req, res) => {
  await expireNoShows();
  if (!req.body?.plate) throw new HttpError(400, 'Choose a car for this reservation.');
  const plate = normalizePlate(req.body.plate, { required: true });
  const { when, hours } = checkReservationTime(req.body);

  const result = await withTransaction(async (conn) => {
    const { spot, session } = await lockSpot(conn, req.params.code);
    if (session) throw new HttpError(409, `${spot.code} is no longer open.`);
    const vehicleId = await vehicleForUser(conn, plate, req.user);
    await assertVehicleFree(conn, vehicleId, plate); // one spot per car
    const [[lot]] = await conn.query('SELECT hourly_rate_cents FROM lot_settings WHERE id = 1');
    const amountCents = priceFor(lot?.hourly_rate_cents, hours); // price is locked in when reserving
    try {
      await conn.execute(
        `INSERT INTO parking_sessions
           (spot_id, vehicle_id, kind, started_at, reserved_for, reserved_minutes, reserved_amount_cents, created_by, customer_id)
         VALUES (?, ?, 'reservation', UTC_TIMESTAMP(), ?, ?, ?, ?, ?)`,
        [spot.id, vehicleId, when, hours * 60, amountCents, req.user.id, isStaffUser(req.user) ? null : req.user.id]
      );
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'That spot or car was just taken. Try again.');
      throw err;
    }
    // The full fee goes on the customer's account as pending until check-in.
    const [[{ id: sessionId }]] = await conn.query('SELECT LAST_INSERT_ID() AS id');
    if (!isStaffUser(req.user)) {
      await holdFee(conn, { userId: req.user.id, vehicleId, sessionId, amountCents, description: `Reservation at ${spot.code} (${formatHours(hours)})` });
    }
    await logActivity(conn, { spotId: spot.id, vehicleId, userId: req.user.id, event: 'Reserved', amountCents: amountCents || null, details: { arrival: when, hours } });
    return { spot: spot.code, amountCents, reservedFor: when };
  });

  res.status(201).json(result);
});

// Check out your parked car, or cancel your reservation.
router.post('/spots/:code/release', requireAuth, async (req, res) => {
  await withTransaction(async (conn) => {
    const { spot, session } = await lockSpot(conn, req.params.code);
    if (!session) throw new HttpError(409, `${spot.code} is already free.`);
    if (!isStaffUser(req.user)) {
      const [[v]] = session.vehicle_id
        ? await conn.execute('SELECT owner_user_id FROM vehicles WHERE id = ?', [session.vehicle_id])
        : [[null]];
      if (![v?.owner_user_id, session.created_by, session.customer_id].includes(req.user.id)) {
        throw new HttpError(403, 'You can only check out or cancel your own car.');
      }
    }
    const parked = session.kind === 'parked';
    await endSession(conn, session.id, req.user.id, parked ? 'checked_out' : 'cancelled');
    if (!parked) await cancelFee(conn, session.id); // a cancelled reservation isn't charged
    await logActivity(conn, {
      spotId: spot.id,
      vehicleId: session.vehicle_id,
      userId: req.user.id,
      event: parked ? 'Check out' : 'Reservation cancelled',
    });
  });
  res.json({ ok: true });
});

// Recent activity: admins see everything; other users see their own cars only.
// Add paid time to my parked car. The extra cost is processed now.
router.post('/spots/:code/extend', requireAuth, async (req, res) => {
  const hours = checkHours(req.body?.hours, { label: 'how much time to add' });
  const mine = (s) => isStaffUser(req.user) || [s.owner_user_id, s.created_by, s.customer_id].includes(req.user.id);
  const result = await withTransaction((conn) => addParkedTime(conn, { code: req.params.code, hours, userId: req.user.id, canUse: mine }));
  res.json(result);
});

router.get('/activity', requireAuth, async (req, res) => {
  const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 8));
  const admin = isStaffUser(req.user);
  const [rows] = await pool.query(
    `SELECT a.id, a.event, a.created_at AS time, a.amount_cents, s.code AS spot, v.plate, u.name AS by_user
     FROM activity_log a
     LEFT JOIN spots s    ON s.id = a.spot_id
     LEFT JOIN vehicles v ON v.id = a.vehicle_id
     LEFT JOIN users u    ON u.id = a.user_id
     ${admin ? '' : 'WHERE a.user_id = ? OR v.owner_user_id = ?'}
     ORDER BY a.created_at DESC, a.id DESC
     LIMIT ?`,
    admin ? [limit] : [req.user.id, req.user.id, limit]
  );
  res.json({ entries: rows });
});

export default router;
