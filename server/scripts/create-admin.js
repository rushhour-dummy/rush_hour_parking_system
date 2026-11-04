// Creates an administrator, or promotes an existing user and resets their password.
//
//   npm run create-admin -- admin@example.com "a-strong-password" "Full Name"
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { pool } from '../src/db.js';

const [emailArg, password, name = 'Admin'] = process.argv.slice(2);
if (!emailArg || !password) {
  console.error('Usage: npm run create-admin -- <email> <password> [name]');
  process.exit(1);
}
if (password.length < 8) {
  console.error('Password must be at least 8 characters.');
  process.exit(1);
}

const email = emailArg.trim().toLowerCase();
const hash = await bcrypt.hash(password, 12);
await pool.execute(
  `INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'admin')
   ON DUPLICATE KEY UPDATE role = 'admin', password_hash = VALUES(password_hash)`,
  [name, email, hash]
);
console.log(`✓ ${email} is an admin`);
await pool.end();
