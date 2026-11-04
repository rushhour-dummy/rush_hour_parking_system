
import 'dotenv/config';
import cookieParser from 'cookie-parser';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadUser } from './auth.js';
import { connectionHint, describeDb, pool } from './db.js';
import { expireNoShows } from './expiry.js';
import adminRoutes from './routes/admin.js';
import authRoutes from './routes/auth.js';
import meRoutes from './routes/me.js';
import spotRoutes from './routes/spots.js';

const app = express();

app.disable('x-powered-by');
if (process.env.TRUST_PROXY) app.set('trust proxy', process.env.TRUST_PROXY);

app.use(express.json({ limit: '20kb' }));
app.use(cookieParser());

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api', loadUser);
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/me', meRoutes);
app.use('/api', spotRoutes);
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }));

// Serve the built React app when available.
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');

if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api\/).*/, (_req, res) =>
    res.sendFile(path.join(dist, 'index.html'))
  );
}

const DB_DOWN = new Set([
  'ECONNREFUSED',
  'ENOTFOUND',
  'ETIMEDOUT',
  'ECONNRESET',
  'HANDSHAKE_SSL_ERROR',
  'ER_ACCESS_DENIED_ERROR',
  'ER_BAD_DB_ERROR',
  'ER_NO_SUCH_TABLE',
]);

app.use((err, _req, res, _next) => {
  if (DB_DOWN.has(err.code)) {
    console.error(`Database error (${err.code}): ${err.message}`);

    const notSetUp =
      err.code === 'ER_NO_SUCH_TABLE' || err.code === 'ER_BAD_DB_ERROR';

    return res.status(503).json({
      error: notSetUp
        ? "The database isn't set up yet. Run `npm run db:setup` on the server."
        : 'The database is not reachable. Check server/.env and run `npm run db:check`.',
    });
  }

  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error(err);

  res.status(status).json({
    error: status >= 500 ? 'Something went wrong on the server.' : err.message,
  });
});

// Export the app for Vercel serverless functions.
export default app;

// Local development only: start the HTTP server and background checks.
if (!process.env.VERCEL) {
  const port = Number(process.env.PORT || 3001);

  app.listen(port, () =>
    console.log(`RushHourParkingSystem API listening on http://localhost:${port}`)
  );

  pool
    .query(
      "SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('floors','spots','users','parking_sessions','lot_settings')"
    )
    .then(([rows]) => {
      if (rows[0].n >= 5) {
        return console.log(`✓ Database: ${describeDb()}`);
      }

      console.error(
        `✗ Connected to ${describeDb()}, but RushHourParkingSystem's tables aren't set up in that database.`
      );
      console.error(
        '  → Stop the server, run `npm run db:setup` in the server folder, then start the server again.'
      );
    })
    .catch((err) => {
      console.error(`✗ Database not reachable (${describeDb()}): ${err.message}`);

      const hint = connectionHint(err);
      if (hint) console.error(`  → ${hint}`);
    });

  let lastNoShowError = '';

  const checkNoShows = () =>
    expireNoShows()
      .then(() => {
        if (lastNoShowError) console.log('✓ No-show check is working again.');
        lastNoShowError = '';
      })
      .catch((err) => {
        if (err.message === lastNoShowError) return;

        lastNoShowError = err.message;
        console.error(`No-show check failed: ${err.message}`);

        const hint = connectionHint(err);
        if (hint) console.error(`  → ${hint}`);
      });

  checkNoShows();
  setInterval(checkNoShows, 30 * 1000);
}
