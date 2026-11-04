// Tests the database connection from server/.env and says what to fix.
//
//   npm run db:check
import 'dotenv/config';
import mysql from 'mysql2/promise';

let db;
try {
  db = await import('../src/db.js');
} catch (err) {
  console.error(`✗ ${err.message}`);
  process.exit(1);
}
const { connectionHint, dbConfig, describeDb } = db;

console.log(`Connecting to ${describeDb()} …`);
let conn;
try {
  conn = await mysql.createConnection({ ...dbConfig, database: undefined });
  const [[{ version }]] = await conn.query('SELECT VERSION() AS version');
  const [[cipher]] = await conn.query("SHOW SESSION STATUS LIKE 'Ssl_cipher'");
  console.log(`✓ Connected. Server version ${version}`);
  console.log(cipher?.Value ? `✓ Connection is encrypted (${cipher.Value})` : '! Connection is NOT encrypted');

  const [dbs] = await conn.query('SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?', [dbConfig.database]);
  if (!dbs.length) {
    console.log(`• Database "${dbConfig.database}" doesn't exist yet. Run: npm run db:setup`);
  } else {
    const [tables] = await conn.query(
      "SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN ('floors','spots','users','parking_sessions')",
      [dbConfig.database]
    );
    if (tables.length < 4) {
      console.log(`• Database "${dbConfig.database}" exists but RushHourParkingSystem's tables aren't set up. Run: npm run db:setup`);
    } else {
      const [[{ spots }]] = await conn.query(`SELECT COUNT(*) AS spots FROM \`${dbConfig.database}\`.spots`);
      const [[{ users }]] = await conn.query(`SELECT COUNT(*) AS users FROM \`${dbConfig.database}\`.users`);
      console.log(`✓ RushHourParkingSystem tables found: ${spots} spots, ${users} accounts. Run npm run db:setup after updates.`);
    }
  }
} catch (err) {
  console.error(`✗ Connection failed: ${err.message}`);
  const hint = connectionHint(err);
  if (hint) console.error(`  → ${hint}`);
  process.exitCode = 1;
} finally {
  await conn?.end().catch(() => {});
}
