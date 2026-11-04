import { settleFee } from './billing.js';
import { pool, withTransaction } from './db.js';
import { formatHours, logActivity, NO_SHOW_GRACE_MINUTES } from './util.js';

// Releases reservations whose car wasn't checked in within the grace period
// after the arrival time, and charges the person who reserved the full
// reserved amount. Runs every 30 seconds and before spot reads and changes.

let running = null;

export function expireNoShows() {
  if (!running) running = run().finally(() => (running = null));
  return running;
}

async function run() {
  const [due] = await pool.query(
    `SELECT id FROM parking_sessions
     WHERE kind = 'reservation' AND ended_at IS NULL AND reserved_for IS NOT NULL
       AND reserved_for < UTC_TIMESTAMP() - INTERVAL ? MINUTE`,
    [NO_SHOW_GRACE_MINUTES]
  );

  for (const { id } of due) {
    await withTransaction(async (conn) => {
      const [[s]] = await conn.execute(
        `SELECT ps.id, ps.spot_id, ps.vehicle_id, COALESCE(ps.customer_id, ps.created_by) AS charge_to, ps.reserved_minutes, ps.reserved_amount_cents, sp.code
         FROM parking_sessions ps JOIN spots sp ON sp.id = ps.spot_id
         WHERE ps.id = ? AND ps.ended_at IS NULL FOR UPDATE`,
        [id]
      );
      if (!s) return; // checked in or cancelled in the meantime

      await conn.execute("UPDATE parking_sessions SET ended_at = UTC_TIMESTAMP(), end_reason = 'no_show' WHERE id = ?", [id]);
      const amount = s.reserved_amount_cents ?? 0;
      const hours = s.reserved_minutes ? formatHours(s.reserved_minutes / 60) : 'reservation';
      // The pending fee is processed in full (see billing.js).
      await settleFee(conn, {
        sessionId: s.id,
        userId: s.charge_to,
        vehicleId: s.vehicle_id,
        amountCents: amount,
        reason: 'no_show',
        description: `No-show at ${s.code} (${hours} reserved)`,
      });
      await logActivity(conn, {
        spotId: s.spot_id,
        vehicleId: s.vehicle_id,
        userId: s.charge_to,
        event: 'No-show (charged)',
        amountCents: amount,
      });
    });
  }
  return due.length;
}
