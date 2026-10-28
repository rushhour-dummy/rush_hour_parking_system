import 'dotenv/config';
import fs from 'node:fs';
import mysql from 'mysql2/promise';

export const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: { ca: process.env.DB_CA ?? fs.readFileSync(new URL('./ca.pem', import.meta.url)) },
  timezone: 'Z',
  connectionLimit: 3,
});
