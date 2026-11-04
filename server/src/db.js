import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';

// Connection settings come from server/.env. Either paste a full connection URL
// (e.g. Aiven's "Service URI") into DATABASE_URL, or set DB_HOST, DB_PORT, DB_USER,
// DB_PASSWORD and DB_NAME. When DATABASE_URL is set it decides the server and
// login (DB_HOST, DB_PORT, DB_USER and DB_PASSWORD are ignored); DB_NAME, if set,
// still picks which database to use on that server.

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseUrl(uri) {
  if (!uri) return {};
  let u;
  try {
    u = new URL(uri);
  } catch {
    throw new Error('DATABASE_URL is not a valid URL. It should look like mysql://user:password@host:port/database');
  }
  if (!u.protocol.startsWith('mysql')) throw new Error('DATABASE_URL must start with mysql://');
  const sslMode = (u.searchParams.get('ssl-mode') || u.searchParams.get('sslmode') || '').toUpperCase();
  return {
    host: u.hostname,
    port: u.port ? Number(u.port) : undefined,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: decodeURIComponent(u.pathname.replace(/^\//, '')) || undefined,
    ssl: sslMode ? sslMode !== 'DISABLED' : undefined,
  };
}

// SSL: when enabled, the server's certificate is always verified. Managed
// services such as Aiven sign it with their own CA, so give that CA certificate
// as a file (DB_SSL_CA=./ca.pem) or, where you can't upload files, as base64
// text (DB_SSL_CA_BASE64). Without one, Node's built-in trusted CAs are used.
function sslOptions(enabled) {
  if (!enabled) return undefined;
  let ca;
  if (process.env.DB_SSL_CA_BASE64) {
    ca = Buffer.from(process.env.DB_SSL_CA_BASE64, 'base64').toString('utf8');
  } else if (process.env.DB_SSL_CA) {
    const file = path.resolve(serverDir, process.env.DB_SSL_CA);
    if (!fs.existsSync(file)) throw new Error(`DB_SSL_CA points to ${file}, but that file doesn't exist.`);
    ca = fs.readFileSync(file, 'utf8');
  }
  return { ...(ca ? { ca } : {}), rejectUnauthorized: true };
}

const env = process.env;
const set = (v) => (v === undefined || v === '' ? undefined : v); // empty in .env = not set
const useUrl = Boolean(set(env.DATABASE_URL));
const url = useUrl ? parseUrl(env.DATABASE_URL) : {};
const sslEnabled = set(env.DB_SSL) ? env.DB_SSL === 'true' : Boolean(url.ssl);

export const dbConfig = {
  host: (useUrl ? url.host : set(env.DB_HOST)) || '127.0.0.1',
  port: Number((useUrl ? url.port : set(env.DB_PORT)) || 3306),
  user: (useUrl ? url.user : set(env.DB_USER)) || 'parkspot',
  password: (useUrl ? url.password : env.DB_PASSWORD) ?? '',
  database: set(env.DB_NAME) || url.database || 'parkspot',
  ssl: sslOptions(sslEnabled),
  timezone: 'Z', // read and write DATETIME values as UTC
  connectTimeout: 15000,
};

// For logs: where we connect, never the password.
export function describeDb() {
  const ssl = !dbConfig.ssl ? 'no SSL' : dbConfig.ssl.ca ? 'SSL, verified with your CA file' : 'SSL, verified with built-in CAs';
  return `${dbConfig.user}@${dbConfig.host}:${dbConfig.port}/${dbConfig.database} (${ssl})`;
}

export const pool = mysql.createPool({ ...dbConfig, connectionLimit: 10 });

// Make CURRENT_TIMESTAMP defaults UTC on every connection too.
pool.on('connection', (conn) => {
  conn.query("SET time_zone = '+00:00'");
});

export async function withTransaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// Plain-language advice for the usual connection problems.
export function connectionHint(err) {
  const msg = String(err?.message || '');
  if (err?.code === 'ENOTFOUND') return 'The host name was not found. Check the host in DATABASE_URL / DB_HOST.';
  if (['ECONNREFUSED', 'ETIMEDOUT', 'ECONNRESET'].includes(err?.code) || /timeout/i.test(msg)) {
    return 'Could not reach the server. Check the host and port, that the service is running, and (on Aiven) that your IP address is in the service\'s "Allowed IP addresses".';
  }
  if (err?.code === 'ER_ACCESS_DENIED_ERROR') {
    if (/SSL|secure/i.test(msg)) return 'The server requires SSL. Add ?ssl-mode=REQUIRED to DATABASE_URL or set DB_SSL=true.';
    return dbConfig.ssl
      ? 'Wrong user name or password.'
      : 'Wrong user name or password, or the server only accepts SSL connections (add ?ssl-mode=REQUIRED to DATABASE_URL, or set DB_SSL=true).';
  }
  if (/self[- ]signed|unable to verify|certificate|CERT_|SSL|TLS/i.test(msg) || err?.code === 'HANDSHAKE_SSL_ERROR') {
    return "The server's certificate couldn't be verified. Download the CA certificate (on Aiven: service page → Overview → CA certificate), save it as server/ca.pem, and set DB_SSL_CA=./ca.pem.";
  }
  if (err?.code === 'ER_NO_SUCH_TABLE') {
    return "RushHourParkingSystem's tables aren't set up in this database. Run `npm run db:setup` in the server folder, then restart the server.";
  }
  if (err?.code === 'ER_BAD_DB_ERROR') return 'That database does not exist yet. Run `npm run db:setup` to create it.';
  if (err?.code === 'ER_DBACCESS_DENIED_ERROR') return 'This user may not use that database. Use one it can access (on Aiven, "defaultdb" always works).';
  return null;
}
