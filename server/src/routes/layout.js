import express from 'express';
import { requireAdmin } from '../auth.js';
import { pool, withTransaction } from '../db.js';
import { HttpError, logActivity, text } from '../util.js';

// Admin only: the lot's levels and spots (Manage parking lot), and the
// Activities page. Mounted inside the staff router, so every route here adds
// requireAdmin itself (attendants get 403).
//
// Removing a level or spot hides it (is_active = 0) instead of deleting the
// row, so past reservations, charges and activity keep pointing at a real spot.
// Adding spots back reuses those rows.
const router = express.Router();

const MAX_LEVELS = 20;
const MAX_SPOTS_PER_LEVEL = 300;
const MAX_ADD_AT_ONCE = 100;
const spotCode = (floorCode, n) => `${floorCode}-${String(n).padStart(2, '0')}`;

function count(value, { min = 1, max, label }) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw new HttpError(400, `Enter ${label} from ${min} to ${max}.`);
  return n;
}

async function lockFloor(conn, code) {
  const [[floor]] = await conn.execute('SELECT id, code, name FROM floors WHERE code = ? AND is_active = 1 FOR UPDATE', [
    String(code ?? '').toUpperCase(),
  ]);
  if (!floor) throw new HttpError(404, 'That level does not exist.');
  return floor;
}

// Adds `n` spots to a level, filling gaps in the numbering first
// (so removing L1-05 and adding one spot brings L1-05 back).
async function addSpots(conn, floor, n) {
  const [rows] = await conn.execute('SELECT id, number, is_active FROM spots WHERE floor_id = ? FOR UPDATE', [floor.id]);
  const active = rows.filter((r) => r.is_active).length;
  if (active + n > MAX_SPOTS_PER_LEVEL) {
    throw new HttpError(409, `A level can have at most ${MAX_SPOTS_PER_LEVEL} spots. ${floor.name} has ${active}.`);
  }
  const byNumber = new Map(rows.map((r) => [r.number, r]));
  const added = [];
  for (let num = 1; added.length < n; num++) {
    const row = byNumber.get(num);
    if (row?.is_active) continue;
    if (row) await conn.execute('UPDATE spots SET is_active = 1 WHERE id = ?', [row.id]);
    else await conn.execute('INSERT INTO spots (floor_id, number, code) VALUES (?, ?, ?)', [floor.id, num, spotCode(floor.code, num)]);
    added.push(spotCode(floor.code, num));
  }
  return added;
}

// Locks the given spots and makes sure none has a car or reservation on it.
async function lockFreeSpots(conn, where, args) {
  const [spots] = await conn.execute(
    `SELECT s.id, s.code,
            (SELECT ps.kind FROM parking_sessions ps WHERE ps.spot_id = s.id AND ps.ended_at IS NULL LIMIT 1) AS kind
     FROM spots s WHERE ${where} AND s.is_active = 1 FOR UPDATE`,
    args
  );
  const busy = spots.filter((s) => s.kind);
  if (busy.length) {
    const list = busy.slice(0, 5).map((s) => `${s.code} (${s.kind === 'parked' ? 'occupied' : 'reserved'})`).join(', ');
    throw new HttpError(409, `Can't remove spots that are in use: ${list}${busy.length > 5 ? ` and ${busy.length - 5} more` : ''}. Check out or cancel them first.`);
  }
  return spots;
}

// ---- Levels ---------------------------------------------------------------

// Add a level: { name?, spots }. Gets the lowest free code (L1, L2, …).
router.post('/floors', requireAdmin, async (req, res) => {
  const spots = count(req.body?.spots, { max: MAX_ADD_AT_ONCE, label: 'a number of spots' });
  const result = await withTransaction(async (conn) => {
    const [all] = await conn.query('SELECT id, code, is_active FROM floors FOR UPDATE');
    if (all.filter((f) => f.is_active).length >= MAX_LEVELS) throw new HttpError(409, `The lot can have at most ${MAX_LEVELS} levels.`);
    const byCode = new Map(all.map((f) => [f.code, f]));
    let n = 1;
    while (byCode.get(`L${n}`)?.is_active) n++;
    const code = `L${n}`;
    const name = text(req.body?.name, 60) || `Level ${n}`;
    let id = byCode.get(code)?.id;
    if (id) await conn.execute('UPDATE floors SET is_active = 1, name = ?, sort_order = ? WHERE id = ?', [name, n, id]);
    else [{ insertId: id }] = await conn.execute('INSERT INTO floors (code, name, sort_order) VALUES (?, ?, ?)', [code, name, n]);
    const added = await addSpots(conn, { id, code, name }, spots);
    await logActivity(conn, { userId: req.user.id, event: 'Level added', details: { level: name, code, spots: added.length } });
    return { code, name, spots: added.length };
  });
  res.status(201).json(result);
});

// Rename a level: { name }.
router.patch('/floors/:code', requireAdmin, async (req, res) => {
  const name = text(req.body?.name, 60);
  if (!name) throw new HttpError(400, 'Enter a name for the level.');
  const result = await withTransaction(async (conn) => {
    const floor = await lockFloor(conn, req.params.code);
    await conn.execute('UPDATE floors SET name = ? WHERE id = ?', [name, floor.id]);
    if (name !== floor.name) {
      await logActivity(conn, { userId: req.user.id, event: 'Level renamed', details: { level: [floor.name, name], code: floor.code } });
    }
    return { code: floor.code, name };
  });
  res.json(result);
});

// Remove a level and all its spots. Every spot on it must be free.
router.delete('/floors/:code', requireAdmin, async (req, res) => {
  const result = await withTransaction(async (conn) => {
    const floor = await lockFloor(conn, req.params.code);
    const [[{ n }]] = await conn.query('SELECT COUNT(*) AS n FROM floors WHERE is_active = 1');
    if (n <= 1) throw new HttpError(409, "The lot needs at least one level, so this one can't be removed.");
    const spots = await lockFreeSpots(conn, 's.floor_id = ?', [floor.id]);
    await conn.execute('UPDATE spots SET is_active = 0 WHERE floor_id = ?', [floor.id]);
    await conn.execute('UPDATE floors SET is_active = 0 WHERE id = ?', [floor.id]);
    await logActivity(conn, { userId: req.user.id, event: 'Level removed', details: { level: floor.name, code: floor.code, spots: spots.length } });
    return { code: floor.code, removedSpots: spots.length };
  });
  res.json(result);
});

// ---- Spots ----------------------------------------------------------------

// Add spots to a level: { count }.
router.post('/floors/:code/spots', requireAdmin, async (req, res) => {
  const n = count(req.body?.count, { max: MAX_ADD_AT_ONCE, label: 'a number of spots' });
  const result = await withTransaction(async (conn) => {
    const floor = await lockFloor(conn, req.params.code);
    const added = await addSpots(conn, floor, n);
    await logActivity(conn, { userId: req.user.id, event: 'Spots added', details: { level: floor.name, codes: added.length <= 12 ? added : undefined, spots: added.length } });
    return { code: floor.code, added };
  });
  res.status(201).json(result);
});

// Remove spots: { codes: ['L1-23', 'L1-24'] }. Each must be free, and every
// level keeps at least one spot (remove the level instead).
router.post('/spots/remove', requireAdmin, async (req, res) => {
  const codes = [...new Set((Array.isArray(req.body?.codes) ? req.body.codes : []).map((c) => String(c).toUpperCase().trim()))].filter(Boolean);
  if (!codes.length) throw new HttpError(400, 'Choose at least one spot to remove.');
  if (codes.length > MAX_SPOTS_PER_LEVEL) throw new HttpError(400, 'Too many spots in one request.');
  const result = await withTransaction(async (conn) => {
    const spots = await lockFreeSpots(conn, `s.code IN (${codes.map(() => '?').join(', ')})`, codes);
    if (spots.length !== codes.length) {
      const found = new Set(spots.map((s) => s.code));
      throw new HttpError(404, `Spot not found: ${codes.filter((c) => !found.has(c)).join(', ')}.`);
    }
    const [left] = await conn.execute(
      `SELECT f.name, COUNT(s.id) - SUM(s.code IN (${codes.map(() => '?').join(', ')})) AS remaining
       FROM spots s JOIN floors f ON f.id = s.floor_id
       WHERE s.is_active = 1 AND f.is_active = 1 AND f.id IN (SELECT floor_id FROM spots WHERE code IN (${codes.map(() => '?').join(', ')}))
       GROUP BY f.id, f.name`,
      [...codes, ...codes]
    );
    const emptied = left.find((l) => Number(l.remaining) < 1);
    if (emptied) throw new HttpError(409, `${emptied.name} needs at least one spot. To take it out of service, remove the level instead.`);
    await conn.execute(`UPDATE spots SET is_active = 0 WHERE id IN (${spots.map(() => '?').join(', ')})`, spots.map((s) => s.id));
    await logActivity(conn, { userId: req.user.id, event: 'Spots removed', details: { codes: codes.length <= 12 ? codes : undefined, spots: codes.length } });
    return { removed: codes };
  });
  res.json(result);
});

// ---- Activities -------------------------------------------------------------

// Event names → the categories the Activities page filters by.
const CATEGORY_SQL = `CASE
  WHEN a.event LIKE 'Reserved%' THEN 'reserved'
  WHEN a.event LIKE 'Reservation edited%' THEN 'edited'
  WHEN a.event LIKE 'Reservation cancelled%' THEN 'cancelled'
  WHEN a.event LIKE 'Time added%' OR a.event LIKE 'Reservation extended%' THEN 'time'
  WHEN a.event LIKE 'Check in%' THEN 'checkin'
  WHEN a.event LIKE 'Check out%' THEN 'checkout'
  WHEN a.event LIKE 'No-show%' THEN 'noshow'
  WHEN a.event LIKE 'Level %' OR a.event LIKE 'Spots %' OR a.event LIKE 'Lot %' THEN 'lot'
  ELSE 'other' END`;
const CATEGORIES = ['reserved', 'edited', 'cancelled', 'time', 'checkin', 'checkout', 'noshow', 'lot', 'other'];

const parseDetails = (s) => {
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    return { note: s };
  }
};

// GET /admin/activity?type=reserved&q=jane&from=ISO&to=ISO&page=1
router.get('/activity', requireAdmin, async (req, res) => {
  const pageSize = 50;
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const where = [];
  const args = [];
  const type = String(req.query.type ?? '');
  if (CATEGORIES.includes(type)) {
    where.push(`${CATEGORY_SQL} = ?`);
    args.push(type);
  }
  const q = text(req.query.q, 60);
  if (q) {
    where.push('(s.code LIKE ? OR v.plate LIKE ? OR u.name LIKE ? OR u.email LIKE ? OR o.name LIKE ? OR o.email LIKE ? OR a.details LIKE ?)');
    args.push(...Array(7).fill(`%${q}%`));
  }
  for (const [key, op] of [['from', '>='], ['to', '<']]) {
    if (!req.query[key]) continue;
    const d = new Date(String(req.query[key]));
    if (Number.isNaN(d.getTime())) throw new HttpError(400, 'Choose a valid date.');
    where.push(`a.created_at ${op} ?`);
    args.push(d);
  }
  const from = `FROM activity_log a
     LEFT JOIN spots s    ON s.id = a.spot_id
     LEFT JOIN vehicles v ON v.id = a.vehicle_id
     LEFT JOIN users u    ON u.id = a.user_id
     LEFT JOIN users o    ON o.id = v.owner_user_id
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}`;
  const [rows] = await pool.query(
    `SELECT a.id, a.event, a.created_at AS time, a.amount_cents, a.details, ${CATEGORY_SQL} AS category,
            s.code AS spot, v.plate, u.name AS by_name, u.role AS by_role, o.name AS owner_name, o.email AS owner_email
     ${from}
     ORDER BY a.created_at DESC, a.id DESC
     LIMIT ? OFFSET ?`,
    [...args, pageSize + 1, (page - 1) * pageSize]
  );
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total ${from}`, args);
  res.json({
    page,
    total,
    hasMore: rows.length > pageSize,
    entries: rows.slice(0, pageSize).map((r) => {
      const details = parseDetails(r.details);
      return {
        id: r.id,
        time: r.time,
        category: r.category,
        event: r.event,
        amountCents: r.amount_cents,
        spot: r.spot,
        plate: r.plate,
        by: r.by_name ? { name: r.by_name, role: r.by_role } : null,
        // The customer: the car's owner, or who staff reserved for.
        customer: r.owner_name ? { name: r.owner_name, email: r.owner_email } : details?.customer ? { name: details.customer } : null,
        details,
      };
    }),
  });
});

export default router;
