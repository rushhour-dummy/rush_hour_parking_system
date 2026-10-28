import express from 'express';
import cors from 'cors';
import { pool } from './db.js';

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',') ?? true }));
app.use(express.json());

const logEvent = (conn, plate, spot, event) =>
  conn.query('INSERT INTO activity_log (plate, spot_id, event) VALUES (?, ?, ?)', [plate, spot, event]);

app.get('/api/spots', async (_req, res) => {
  const [rows] = await pool.query('SELECT id, status FROM spots ORDER BY id');
  res.json(rows);
});

app.get('/api/log', async (_req, res) => {
  const [rows] = await pool.query(
    'SELECT created_at, plate, spot_id AS spot, event, amount FROM activity_log ORDER BY id DESC LIMIT 8'
  );
  res.json(rows);
});

// Reserve (status: reserved) or release (status: free)
app.post('/api/spots/:id/status', async (req, res) => {
  const { status } = req.body;
  if (!['free', 'reserved'].includes(status)) return res.status(400).json({ error: 'Bad status' });

  const [[spot]] = await pool.query('SELECT status, plate FROM spots WHERE id = ?', [req.params.id]);
  if (!spot) return res.status(404).json({ error: 'No such spot' });
  if (status === 'reserved' && spot.status !== 'free') return res.status(409).json({ error: 'Spot is not free' });
  if (status === 'free' && spot.status === 'free') return res.status(409).json({ error: 'Spot is already free' });

  await pool.query('UPDATE spots SET status = ?, plate = NULL WHERE id = ?', [status, req.params.id]);
  await logEvent(pool, spot.plate, req.params.id, status === 'reserved' ? 'Reserved' : 'Check out');
  res.json({ ok: true });
});

// Check a plate into the first free spot on a level
app.post('/api/checkin', async (req, res) => {
  const { level, plate } = req.body;
  if (!level || !plate) return res.status(400).json({ error: 'level and plate required' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query(
      "SELECT id FROM spots WHERE level = ? AND status = 'free' ORDER BY id LIMIT 1 FOR UPDATE",
      [level]
    );
    if (!rows.length) {
      await conn.rollback();
      return res.status(409).json({ error: 'No free spots on this level' });
    }
    const { id } = rows[0];
    await conn.query("UPDATE spots SET status = 'occupied', plate = ? WHERE id = ?", [plate, id]);
    await logEvent(conn, plate, id, 'Check in');
    await conn.commit();
    res.json({ id });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    conn.release();
  }
});

export default app;
