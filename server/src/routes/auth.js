import bcrypt from 'bcryptjs';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { endSession, publicUser, requireAuth, startSession } from '../auth.js';
import { pool } from '../db.js';
import { HttpError, normalizePhone, text } from '../util.js';

const router = express.Router();
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BCRYPT_ROUNDS = 12;
// Compared against when an email isn't found, so both cases take the same time.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_ROUNDS);

const attemptLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many attempts. Try again in a few minutes.' },
});

function checkPassword(password) {
  if (password.length < 8) throw new HttpError(400, 'Password must be at least 8 characters.');
  if (password.length > 200) throw new HttpError(400, 'Password is too long.');
}

async function findUser(id) {
  const [rows] = await pool.execute('SELECT id, name, email, phone, role FROM users WHERE id = ?', [id]);
  return rows[0];
}

router.get('/me', (req, res) => {
  res.json({ user: publicUser(req.user) });
});

router.post('/signup', attemptLimiter, async (req, res) => {
  const name = text(req.body?.name, 100);
  const email = text(req.body?.email, 255).toLowerCase();
  const password = String(req.body?.password ?? '');
  if (!name) throw new HttpError(400, 'Enter your name.');
  if (!EMAIL.test(email)) throw new HttpError(400, 'Enter a valid email address.');
  checkPassword(password);

  const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  let id;
  try {
    // Sign-up always creates a regular account. Admins come from `npm run create-admin`.
    const [r] = await pool.execute(
      'INSERT INTO users (name, email, password_hash, role, last_login_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP())',
      [name, email, hash, 'customer']
    );
    id = r.insertId;
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'An account with that email already exists.');
    throw err;
  }
  startSession(res, id, true);
  res.status(201).json({ user: publicUser(await findUser(id)) });
});

router.post('/login', attemptLimiter, async (req, res) => {
  const email = text(req.body?.email, 255).toLowerCase();
  const password = String(req.body?.password ?? '');
  const remember = req.body?.remember !== false;
  if (!email || !password) throw new HttpError(400, 'Enter your email and password.');

  const [rows] = await pool.execute('SELECT id, password_hash, session_version FROM users WHERE email = ?', [email]);
  const row = rows[0];
  const ok = await bcrypt.compare(password, row ? row.password_hash : DUMMY_HASH);
  if (!row || !ok) throw new HttpError(401, 'Email or password is incorrect.');

  await pool.execute('UPDATE users SET last_login_at = UTC_TIMESTAMP() WHERE id = ?', [row.id]);
  startSession(res, row.id, remember, row.session_version);
  res.json({ user: publicUser(await findUser(row.id)) });
});

router.post('/logout', (_req, res) => {
  endSession(res);
  res.status(204).end();
});

router.patch('/me', requireAuth, async (req, res) => {
  const name = text(req.body?.name, 100);
  const email = text(req.body?.email, 255).toLowerCase();
  const phone = normalizePhone(req.body?.phone);
  if (!name) throw new HttpError(400, 'Name is required.');
  if (!EMAIL.test(email)) throw new HttpError(400, 'Enter a valid email address.');
  try {
    await pool.execute('UPDATE users SET name = ?, email = ?, phone = ? WHERE id = ?', [
      name,
      email,
      phone,
      req.user.id,
    ]);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'Another account already uses that email.');
    throw err;
  }
  res.json({ user: publicUser(await findUser(req.user.id)) });
});

router.post('/password', requireAuth, attemptLimiter, async (req, res) => {
  const current = String(req.body?.current ?? '');
  const next = String(req.body?.next ?? '');
  if (!current) throw new HttpError(400, 'Enter your current password.');
  checkPassword(next);
  const [[row]] = await pool.execute('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
  if (!(await bcrypt.compare(current, row.password_hash))) throw new HttpError(400, 'Current password is incorrect.');
  // A new password signs you out everywhere else; this browser gets a fresh sign-in.
  await pool.execute('UPDATE users SET password_hash = ?, session_version = session_version + 1 WHERE id = ?', [
    await bcrypt.hash(next, BCRYPT_ROUNDS),
    req.user.id,
  ]);
  const remember = req.session ? req.session.exp - req.session.iat > 24 * 60 * 60 : true;
  startSession(res, req.user.id, remember, req.user.session_version + 1);
  res.status(204).end();
});

export default router;
