// Creates the database and tables, adds floors and spots, and (optionally)
// an admin account and sample data. Safe to run more than once.
//
//   npm run db:setup            tables, floors, spots, admin from .env
//   npm run db:setup:sample     the same, plus sample cars and activity
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { holdFee, postToAccount } from '../src/billing.js';
import { connectionHint, dbConfig, describeDb } from '../src/db.js';
import { formatHours } from '../src/util.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const schema = fs.readFileSync(path.resolve(here, '../../db/schema.sql'), 'utf8');
const withSample = process.argv.includes('--sample');
const FLOORS = Number(process.env.FLOORS || 3);
const SPOTS_PER_FLOOR = Number(process.env.SPOTS_PER_FLOOR || 24);

if (!/^\w+$/.test(dbConfig.database)) throw new Error('DB_NAME may only contain letters, numbers and _.');

console.log(`Connecting to ${describeDb()} …`);
let conn;
try {
  conn = await mysql.createConnection({ ...dbConfig, database: undefined, multipleStatements: true });
} catch (err) {
  console.error(`✗ Connection failed: ${err.message}`);
  const hint = connectionHint(err);
  if (hint) console.error(`  → ${hint}`);
  process.exit(1);
}
try {
  await conn.query(
    `CREATE DATABASE IF NOT EXISTS \`${dbConfig.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  await conn.query(`USE \`${dbConfig.database}\``);
  await conn.query("SET time_zone = '+00:00'");
  await migrate(conn); // bring older databases up to date before the schema's view is rebuilt
  await conn.query(schema);
  console.log(`✓ Tables ready in "${dbConfig.database}"`);
  await postUnrecordedCharges(conn);
  await applyFeeRules(conn);

  // Floors and spots (only adds what's missing).
  for (let f = 1; f <= FLOORS; f++) {
    const code = `L${f}`;
    await conn.execute('INSERT IGNORE INTO floors (code, name, sort_order) VALUES (?, ?, ?)', [code, `Level ${f}`, f]);
    for (let n = 1; n <= SPOTS_PER_FLOOR; n++) {
      await conn.execute(
        'INSERT IGNORE INTO spots (floor_id, number, code) SELECT id, ?, ? FROM floors WHERE code = ?',
        [n, `${code}-${String(n).padStart(2, '0')}`, code]
      );
    }
  }
  const [[{ spots }]] = await conn.query('SELECT COUNT(*) AS spots FROM spots WHERE is_active = 1');
  console.log(`✓ Floors and spots ready (${spots} spots in use)`);

  // Admin account from .env.
  const { ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME } = process.env;
  if (ADMIN_EMAIL && ADMIN_PASSWORD) {
    const email = ADMIN_EMAIL.trim().toLowerCase();
    const [[existing]] = await conn.execute('SELECT id FROM users WHERE email = ?', [email]);
    if (existing) {
      await conn.execute("UPDATE users SET role = 'admin' WHERE id = ?", [existing.id]);
      console.log(`✓ ${email} already exists; made sure it is an admin (password unchanged)`);
    } else {
      if (ADMIN_PASSWORD.length < 8) throw new Error('ADMIN_PASSWORD must be at least 8 characters.');
      await conn.execute("INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'admin')", [
        ADMIN_NAME || 'Admin',
        email,
        await bcrypt.hash(ADMIN_PASSWORD, 12),
      ]);
      console.log(`✓ Created admin ${email}`);
    }
  }

  if (withSample) await addSampleData(conn);
} finally {
  await conn.end();
}

// Columns and indexes added after the first release. MySQL has no
// "ADD COLUMN IF NOT EXISTS", so check information_schema first.
async function migrate(c) {
  const exists = async (sql, args) => (await c.execute(sql, args))[0].length > 0;
  const hasTable = (t) =>
    exists('SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?', [t]);
  const hasColumn = (t, col) =>
    exists('SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?', [t, col]);
  const hasIndex = (t, idx) =>
    exists('SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?', [t, idx]);

  if (!(await hasTable('parking_sessions'))) return; // new database: schema.sql creates everything
  const [[roleCol]] = await c.execute(
    "SELECT COLUMN_TYPE AS t FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'role'"
  );
  // Very old databases used 'attendant' for what is now 'customer'.
  if (roleCol && roleCol.t.includes("'attendant'") && !roleCol.t.includes("'customer'")) {
    await c.query("ALTER TABLE users MODIFY role ENUM('attendant','customer','admin') NOT NULL DEFAULT 'customer'");
    const [r] = await c.query("UPDATE users SET role = 'customer' WHERE role = 'attendant'");
    await c.query("ALTER TABLE users MODIFY role ENUM('customer','admin') NOT NULL DEFAULT 'customer'");
    console.log(`✓ Renamed the 'attendant' role to 'customer' (${r.affectedRows} account(s))`);
  }
  const [[roleNow]] = await c.execute(
    "SELECT COLUMN_TYPE AS t FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'role'"
  );
  if (roleNow && !roleNow.t.includes("'attendant'")) {
    await c.query("ALTER TABLE users MODIFY role ENUM('customer','attendant','admin') NOT NULL DEFAULT 'customer'");
    console.log("✓ Added the 'attendant' role");
  }
  if (!(await hasColumn('users', 'account_balance_cents'))) {
    await c.query('ALTER TABLE users ADD COLUMN account_balance_cents INT NOT NULL DEFAULT 0 AFTER role');
    console.log('✓ Added users.account_balance_cents');
  }
  const columns = [
    ['reserved_for', 'DATETIME NULL AFTER ended_at'],
    ['reserved_minutes', 'SMALLINT UNSIGNED NULL AFTER reserved_for'],
    ['reserved_amount_cents', 'INT UNSIGNED NULL AFTER reserved_minutes'],
    ['end_reason', "ENUM('checked_in','checked_out','cancelled','no_show','admin') NULL AFTER reserved_amount_cents"],
  ];
  for (const [col, def] of columns) {
    if (!(await hasColumn('parking_sessions', col))) {
      await c.query(`ALTER TABLE parking_sessions ADD COLUMN ${col} ${def}`);
      console.log(`✓ Added parking_sessions.${col}`);
    }
  }
  if (!(await hasIndex('parking_sessions', 'idx_sessions_expiry'))) {
    await c.query('ALTER TABLE parking_sessions ADD KEY idx_sessions_expiry (ended_at, reserved_for)');
  }
  if (!(await hasColumn('users', 'session_version'))) {
    await c.query('ALTER TABLE users ADD COLUMN session_version INT UNSIGNED NOT NULL DEFAULT 0 AFTER account_balance_cents');
    console.log('✓ Added users.session_version');
  }
  if (!(await hasColumn('parking_sessions', 'customer_id'))) {
    await c.query('ALTER TABLE parking_sessions ADD COLUMN customer_id INT UNSIGNED NULL AFTER created_by');
    await c.query('ALTER TABLE parking_sessions ADD CONSTRAINT fk_sessions_customer FOREIGN KEY (customer_id) REFERENCES users (id) ON DELETE SET NULL');
    // Reservations and stays a customer made themselves are theirs.
    await c.query(
      "UPDATE parking_sessions ps JOIN users u ON u.id = ps.created_by SET ps.customer_id = ps.created_by WHERE u.role <> 'admin' AND ps.customer_id IS NULL"
    );
    console.log('✓ Added parking_sessions.customer_id');
  }
  if (await hasTable('account_transactions')) {
    const [[st]] = await c.execute(
      "SELECT COLUMN_TYPE AS t FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'account_transactions' AND COLUMN_NAME = 'status'"
    );
    if (st && !st.t.includes("'cancelled'")) {
      await c.query("ALTER TABLE account_transactions MODIFY status ENUM('pending','processed','failed','cancelled') NOT NULL DEFAULT 'pending'");
      console.log("✓ Added the 'cancelled' transaction status");
    }
    if (!(await hasColumn('account_transactions', 'processed_at'))) {
      await c.query('ALTER TABLE account_transactions ADD COLUMN processed_at DATETIME NULL AFTER status');
      console.log('✓ Added account_transactions.processed_at');
    }
    const [[fk]] = await c.execute(
      "SELECT DELETE_RULE AS rule FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = 'fk_transactions_user'"
    );
    if (fk && fk.rule !== 'SET NULL') {
      // Keep financial records when a user is deleted.
      await c.query('ALTER TABLE account_transactions DROP FOREIGN KEY fk_transactions_user');
      await c.query('ALTER TABLE account_transactions MODIFY user_id INT UNSIGNED NULL');
      await c.query('ALTER TABLE account_transactions ADD CONSTRAINT fk_transactions_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL');
      console.log('✓ Transactions are now kept when a user is deleted');
    }
  }
  if (await hasTable('charges')) {
    const [[rc]] = await c.execute(
      "SELECT COLUMN_TYPE AS t FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'charges' AND COLUMN_NAME = 'reason'"
    );
    if (rc && !rc.t.includes("'extension'")) {
      await c.query("ALTER TABLE charges MODIFY reason ENUM('no_show','parking','extension') NOT NULL");
      console.log("✓ Added the 'extension' charge reason");
    }
    // A session can now have more than one charge (e.g. extra time), so the
    // one-charge-per-reason key becomes a plain index.
    if (await hasIndex('charges', 'uq_charges_session_reason')) {
      if (!(await hasIndex('charges', 'idx_charges_session'))) await c.query('ALTER TABLE charges ADD KEY idx_charges_session (session_id)');
      await c.query('ALTER TABLE charges DROP INDEX uq_charges_session_reason');
      console.log('✓ Charges can now include extra time');
    }
  }
  if (await hasTable('lot_settings')) {
    for (const [col, def] of [
      ['lot_name', 'VARCHAR(100) NULL AFTER hourly_rate_cents'],
      ['address', 'VARCHAR(200) NULL AFTER lot_name'],
    ]) {
      if (!(await hasColumn('lot_settings', col))) {
        await c.query(`ALTER TABLE lot_settings ADD COLUMN ${col} ${def}`);
        console.log(`✓ Added lot_settings.${col}`);
      }
    }
  }
  // Admins can remove levels; removed ones are kept (hidden) so history stays intact.
  if (!(await hasColumn('floors', 'is_active'))) {
    await c.query('ALTER TABLE floors ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1 AFTER sort_order');
    console.log('✓ Added floors.is_active');
  }
  // Extra detail for the Activities page.
  if (!(await hasColumn('activity_log', 'details'))) {
    await c.query('ALTER TABLE activity_log ADD COLUMN details VARCHAR(255) NULL AFTER amount_cents');
    console.log('✓ Added activity_log.details');
  }
}

// Charges made before account balances existed: put them on the user's account
// and in the ledger, oldest first, so balances match the charge history.
async function postUnrecordedCharges(c) {
  const [rows] = await c.query(
    `SELECT ch.id, ch.user_id, ch.amount_cents, ch.description FROM charges ch
     LEFT JOIN account_transactions t ON t.charge_id = ch.id
     WHERE ch.user_id IS NOT NULL AND t.id IS NULL
     ORDER BY ch.created_at, ch.id`
  );
  if (!rows.length) return;
  await c.beginTransaction();
  try {
    for (const r of rows) {
      await postToAccount(c, { userId: r.user_id, chargeId: r.id, amountCents: r.amount_cents, description: r.description });
    }
    await c.commit();
  } catch (err) {
    await c.rollback();
    throw err;
  }
  console.log(`✓ Posted ${rows.length} earlier charge(s) to user accounts`);
}

// Brings fee records in line with the current rules (safe to run again):
// - fees for reservations that have ended were processed (checked in or missed),
// - open reservations hold their full fee as pending,
// - each user's balance is the total of their pending fees.
async function applyFeeRules(c) {
  await c.beginTransaction();
  try {
    const [[{ stale }]] = await c.query(
      `SELECT COUNT(*) AS stale FROM account_transactions t
       JOIN charges ch ON ch.id = t.charge_id
       LEFT JOIN parking_sessions ps ON ps.id = ch.session_id
       WHERE t.status = 'pending' AND (ps.id IS NULL OR ps.ended_at IS NOT NULL)`
    );
    await c.query(
      `UPDATE account_transactions t
       JOIN charges ch ON ch.id = t.charge_id
       LEFT JOIN parking_sessions ps ON ps.id = ch.session_id
       SET t.status = 'processed', t.processed_at = COALESCE(t.processed_at, UTC_TIMESTAMP()), ch.status = 'paid'
       WHERE t.status = 'pending' AND (ps.id IS NULL OR ps.ended_at IS NOT NULL)`
    );
    const [open] = await c.query(
      `SELECT ps.id, ps.vehicle_id, ps.reserved_minutes, ps.reserved_amount_cents, s.code,
              COALESCE(ps.customer_id, ps.created_by) AS user_id
       FROM parking_sessions ps
       JOIN spots s ON s.id = ps.spot_id
       JOIN users u ON u.id = COALESCE(ps.customer_id, ps.created_by) AND u.role = 'customer'
       LEFT JOIN charges ch ON ch.session_id = ps.id
       WHERE ps.kind = 'reservation' AND ps.ended_at IS NULL AND ps.reserved_amount_cents > 0 AND ch.id IS NULL`
    );
    for (const r of open) {
      await holdFee(c, {
        userId: r.user_id,
        vehicleId: r.vehicle_id,
        sessionId: r.id,
        amountCents: r.reserved_amount_cents,
        description: `Reservation at ${r.code} (${formatHours(r.reserved_minutes / 60)})`,
      });
    }
    await c.query(
      `UPDATE users u SET account_balance_cents = (
         SELECT COALESCE(SUM(t.amount_cents), 0) FROM account_transactions t WHERE t.user_id = u.id AND t.status = 'pending')`
    );
    await c.commit();
    if (stale) console.log(`✓ Marked ${stale} earlier fee(s) as processed`);
    if (open.length) console.log(`✓ Open reservations now hold their fee as pending (${open.length})`);
  } catch (err) {
    await c.rollback();
    throw err;
  }
}

async function addSampleData(c) {
  const [[{ n }]] = await c.query('SELECT COUNT(*) AS n FROM parking_sessions');
  if (n > 0) {
    console.log('• Sample data skipped: there are already parking sessions');
    return;
  }
  const letters = 'ABCDEFGHJKLMNPRSTUVWXYZ';
  const [spots] = await c.query(
    'SELECT s.id, s.number, f.sort_order AS floor FROM spots s JOIN floors f ON f.id = s.floor_id ORDER BY f.sort_order, s.number'
  );
  let cars = 0;
  for (const [i, s] of spots.entries()) {
    const pattern = (s.number * 7 + (s.floor - 1) * 5) % 10;
    if (pattern >= 6) continue; // leave this spot free
    const kind = pattern < 4 ? 'parked' : 'reservation';
    const letter = (k) => letters[(i * k + 3) % letters.length];
    const plate = `${letter(7)}${letter(11)}${letter(13)}-${String(1000 + ((i * 379) % 9000)).slice(-4)}`;
    const [v] = await c.execute(
      'INSERT INTO vehicles (plate) VALUES (?) ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)',
      [plate]
    );
    const minutesAgo = 20 + ((i * 37) % 300);
    await c.execute(
      'INSERT INTO parking_sessions (spot_id, vehicle_id, kind, started_at) VALUES (?, ?, ?, UTC_TIMESTAMP() - INTERVAL ? MINUTE)',
      [s.id, v.insertId, kind, minutesAgo]
    );
    await c.execute(
      'INSERT INTO activity_log (spot_id, vehicle_id, event, created_at) VALUES (?, ?, ?, UTC_TIMESTAMP() - INTERVAL ? MINUTE)',
      [s.id, v.insertId, kind === 'parked' ? 'Check in' : 'Reserved', minutesAgo]
    );
    cars++;
  }
  console.log(`✓ Sample data: ${cars} cars parked or reserved`);
}
