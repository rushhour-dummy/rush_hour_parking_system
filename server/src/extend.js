import { chargeNow } from './billing.js';
import { formatHours, HttpError, lockSpot, logActivity, priceFor } from './util.js';

// Add paid time to a parked car. The extra cost is processed now (no pending
// step) and the paid-until time moves later: from the current paid-until time,
// or from now if there isn't one or it has passed.
// `canUse(session row)` decides whether this user may do it (staff: anyone).
export async function addParkedTime(conn, { code, hours, userId, canUse = () => true }) {
  const { spot, session } = await lockSpot(conn, code);
  if (!session || session.kind !== 'parked') throw new HttpError(409, `${spot.code} isn't occupied.`);
  const [[s]] = await conn.execute(
    `SELECT ps.started_at, ps.reserved_minutes, ps.customer_id, ps.created_by, ps.vehicle_id, v.owner_user_id
     FROM parking_sessions ps LEFT JOIN vehicles v ON v.id = ps.vehicle_id WHERE ps.id = ?`,
    [session.id]
  );
  if (!canUse(s)) throw new HttpError(403, 'You can only add time for your own car.');
  const start = new Date(s.started_at).getTime();
  const now = Date.now();
  const paidUntil = s.reserved_minutes ? start + s.reserved_minutes * 60000 : null;
  // Stored as whole minutes from check-in; report the same rounded time everywhere.
  const minutes = Math.round((Math.max(paidUntil ?? now, now) + hours * 3600000 - start) / 60000);
  const newUntil = start + minutes * 60000;
  if (minutes > 65000) throw new HttpError(409, 'That stay is already as long as it can be.');
  const [[lot]] = await conn.query('SELECT hourly_rate_cents FROM lot_settings WHERE id = 1');
  const cents = priceFor(lot?.hourly_rate_cents, hours);
  await conn.execute(
    'UPDATE parking_sessions SET reserved_minutes = ?, reserved_amount_cents = COALESCE(reserved_amount_cents, 0) + ? WHERE id = ?',
    [minutes, cents, session.id]
  );
  if (cents > 0) {
    await chargeNow(conn, {
      userId: s.customer_id ?? s.owner_user_id,
      vehicleId: s.vehicle_id,
      sessionId: session.id,
      amountCents: cents,
      reason: 'extension',
      description: `Extra ${formatHours(hours)} at ${spot.code}`,
    });
  }
  await logActivity(conn, {
    spotId: spot.id,
    vehicleId: s.vehicle_id,
    userId,
    event: `Time added (+${formatHours(hours)})`,
    amountCents: cents || null,
    details: { paidUntil: [paidUntil ? new Date(paidUntil) : null, new Date(newUntil)] },
  });
  return { spot: spot.code, paidUntil: new Date(newUntil), amountCents: cents };
}
