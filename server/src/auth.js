import jwt from 'jsonwebtoken';
import { pool } from './db.js';
import { HttpError } from './util.js';

export const COOKIE = 'parkspot_token';
const SECRET = process.env.JWT_SECRET || 'dev-only-change-me';

if (process.env.NODE_ENV === 'production' && SECRET.length < 32) {
  throw new Error('Set JWT_SECRET to a random string of 32+ characters before running in production.');
}

const cookieOptions = () => ({
  httpOnly: true, // not readable from JavaScript
  sameSite: 'lax', // not sent on cross-site POSTs
  secure: process.env.COOKIE_SECURE === 'true',
  path: '/',
});

const ROLE_LABEL = { customer: 'Customer', attendant: 'Attendant', admin: 'Admin' };

// What the browser is allowed to see about a user (never the password hash).
export function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone || '',
    role: ROLE_LABEL[row.role] ?? 'Customer',
  };
}

// `version` is the user's session_version: raising it ends every existing sign-in.
export function startSession(res, userId, remember, version = 0) {
  const token = jwt.sign({ sub: String(userId), v: version }, SECRET, { expiresIn: remember ? '30d' : '12h' });
  res.cookie(COOKIE, token, { ...cookieOptions(), ...(remember ? { maxAge: 30 * 24 * 60 * 60 * 1000 } : {}) });
}

export function endSession(res) {
  res.clearCookie(COOKIE, cookieOptions());
}

// Reads the login cookie and loads the user fresh from the database, so a
// changed role or a deleted account takes effect immediately.
export async function loadUser(req, _res, next) {
  req.user = null;
  const token = req.cookies?.[COOKIE];
  if (!token) return next();
  let payload;
  try {
    payload = jwt.verify(token, SECRET);
  } catch {
    return next(); // expired or tampered cookie: treat as signed out
  }
  const [rows] = await pool.execute('SELECT id, name, email, phone, role, session_version FROM users WHERE id = ?', [
    Number(payload.sub),
  ]);
  const row = rows[0];
  // A deleted account, or a sign-in from before the last password reset, is signed out.
  if (row && (payload.v ?? 0) === row.session_version) {
    req.user = row;
    req.session = payload;
  }
  next();
}

export function requireAuth(req, _res, next) {
  if (!req.user) throw new HttpError(401, 'Sign in to do that.');
  next();
}

// Staff (admins and attendants) run the lot: spots, reservations, check-outs.
export function requireStaff(req, _res, next) {
  if (!req.user) throw new HttpError(401, 'Sign in to do that.');
  if (req.user.role !== 'admin' && req.user.role !== 'attendant') throw new HttpError(403, 'Only staff can do that.');
  next();
}

export function requireAdmin(req, _res, next) {
  if (!req.user) throw new HttpError(401, 'Sign in to do that.');
  if (req.user.role !== 'admin') throw new HttpError(403, 'Only administrators can do that.');
  next();
}
