import { pool } from './db.js';

await pool.query(`
  CREATE TABLE IF NOT EXISTS spots (
    id VARCHAR(8) PRIMARY KEY,
    level VARCHAR(4) NOT NULL,
    status ENUM('free','occupied','reserved') NOT NULL DEFAULT 'free',
    plate VARCHAR(16) NULL
  )`);

await pool.query(`
  CREATE TABLE IF NOT EXISTS activity_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    plate VARCHAR(16) NULL,
    spot_id VARCHAR(8) NOT NULL,
    event VARCHAR(32) NOT NULL,
    amount VARCHAR(16) NULL
  )`);

const rows = [];
['L1', 'L2', 'L3'].forEach((level, li) => {
  for (let i = 1; i <= 24; i++) {
    const n = (i * 7 + li * 5) % 10;
    rows.push([`${level}-${String(i).padStart(2, '0')}`, level, n < 4 ? 'occupied' : n < 6 ? 'reserved' : 'free']);
  }
});
await pool.query('INSERT IGNORE INTO spots (id, level, status) VALUES ?', [rows]);

console.log('Database ready:', rows.length, 'spots');
await pool.end();
