// Fees on user accounts.
//
// A reservation's fee moves through these states:
//   reserve   → PENDING    added to the account as a pending charge
//   add time  → PENDING    the pending amount goes up
//   check in  → PROCESSED  the payment is taken
//   no-show   → PROCESSED  charged in full
//   cancel    → CANCELLED  not charged
//
// users.account_balance_cents is the total of the user's PENDING charges, and
// each fee is one `charges` row plus one `account_transactions` row, changed in
// the caller's database transaction so they never disagree.
//
// No payment provider is connected yet. "Processed" is recorded at the moment
// the business rule says payment happens; when a provider is added, call it in
// markProcessed() and store its reference in processor_ref.

async function addToBalance(conn, userId, deltaCents) {
  const [[u]] = await conn.execute('SELECT account_balance_cents FROM users WHERE id = ? FOR UPDATE', [userId]);
  if (!u) return null; // account deleted; the charge rows still record what happened
  const next = u.account_balance_cents + deltaCents;
  await conn.execute('UPDATE users SET account_balance_cents = ? WHERE id = ?', [next, userId]);
  return next;
}

async function feeFor(conn, sessionId, txnStatus) {
  const [[row]] = await conn.execute(
    `SELECT c.id AS charge_id, c.user_id, c.amount_cents, t.id AS txn_id
     FROM charges c JOIN account_transactions t ON t.charge_id = c.id
     WHERE c.session_id = ? AND t.status = ? ORDER BY c.id DESC LIMIT 1 FOR UPDATE`,
    [sessionId, txnStatus]
  );
  return row || null;
}

// Reserve: put the full fee on the customer's account as pending.
export async function holdFee(conn, { userId, vehicleId = null, sessionId, amountCents, description }) {
  if (!userId || !amountCents) return null;
  const [c] = await conn.execute(
    `INSERT INTO charges (user_id, vehicle_id, session_id, reason, amount_cents, status, description, created_at)
     VALUES (?, ?, ?, 'parking', ?, 'due', ?, UTC_TIMESTAMP())`,
    [userId, vehicleId, sessionId, amountCents, description]
  );
  const balance = await addToBalance(conn, userId, amountCents);
  await conn.execute(
    `INSERT INTO account_transactions (user_id, charge_id, type, amount_cents, balance_after_cents, status, description, created_at)
     VALUES (?, ?, 'charge', ?, ?, 'pending', ?, UTC_TIMESTAMP())`,
    [userId, c.insertId, amountCents, balance ?? 0, description]
  );
  return c.insertId;
}

// Add time (or shorten a reservation): change the pending amount, starting a
// pending fee if there wasn't one yet.
export async function adjustFee(conn, { sessionId, userId, vehicleId, deltaCents, description }) {
  if (!deltaCents) return;
  const fee = await feeFor(conn, sessionId, 'pending');
  if (!fee) return deltaCents > 0 ? holdFee(conn, { userId, vehicleId, sessionId, amountCents: deltaCents, description }) : null;
  const extraCents = Math.max(deltaCents, -fee.amount_cents); // never below zero
  await conn.execute('UPDATE charges SET amount_cents = amount_cents + ?, description = ? WHERE id = ?', [extraCents, description, fee.charge_id]);
  const balance = await addToBalance(conn, fee.user_id, extraCents);
  await conn.execute(
    'UPDATE account_transactions SET amount_cents = amount_cents + ?, balance_after_cents = ?, description = ? WHERE id = ?',
    [extraCents, balance ?? 0, description, fee.txn_id]
  );
}

async function markProcessed(conn, fee, { reason, description }) {
  await conn.execute("UPDATE charges SET status = 'paid', reason = ?, description = ? WHERE id = ?", [reason, description, fee.charge_id]);
  const balance = fee.user_id ? await addToBalance(conn, fee.user_id, -fee.amount_cents) : null;
  await conn.execute(
    "UPDATE account_transactions SET status = 'processed', processed_at = UTC_TIMESTAMP(), balance_after_cents = ?, description = ? WHERE id = ?",
    [balance ?? 0, description, fee.txn_id]
  );
}

// Check-in (reason 'parking') or no-show (reason 'no_show'): process the fee.
// Returns the amount processed, in cents.
export async function settleFee(conn, { sessionId, userId, vehicleId = null, amountCents, reason, description }) {
  const fee = await feeFor(conn, sessionId, 'pending');
  if (fee) {
    await markProcessed(conn, fee, { reason, description });
    return fee.amount_cents;
  }
  // No pending fee on record (e.g. a reservation made before fees were held):
  // record it as charged and processed in one step.
  if (!userId || !amountCents) return 0;
  const [c] = await conn.execute(
    `INSERT IGNORE INTO charges (user_id, vehicle_id, session_id, reason, amount_cents, status, description, created_at)
     VALUES (?, ?, ?, ?, ?, 'paid', ?, UTC_TIMESTAMP())`,
    [userId, vehicleId, sessionId, reason, amountCents, description]
  );
  if (c.affectedRows === 0) return 0; // already charged
  const [[u]] = await conn.execute('SELECT account_balance_cents FROM users WHERE id = ?', [userId]);
  if (u) {
    await conn.execute(
      `INSERT INTO account_transactions (user_id, charge_id, type, amount_cents, balance_after_cents, status, processed_at, description, created_at)
       VALUES (?, ?, 'charge', ?, ?, 'processed', UTC_TIMESTAMP(), ?, UTC_TIMESTAMP())`,
      [userId, c.insertId, amountCents, u.account_balance_cents, description]
    );
  }
  return amountCents;
}

// Cancel: drop the pending fee. Returns the amount that won't be charged.
export async function cancelFee(conn, sessionId) {
  const fee = await feeFor(conn, sessionId, 'pending');
  if (!fee) return 0;
  await conn.execute("UPDATE charges SET status = 'waived' WHERE id = ?", [fee.charge_id]);
  const balance = fee.user_id ? await addToBalance(conn, fee.user_id, -fee.amount_cents) : null;
  await conn.execute("UPDATE account_transactions SET status = 'cancelled', balance_after_cents = ? WHERE id = ?", [balance ?? 0, fee.txn_id]);
  return fee.amount_cents;
}

// Undo of a staff cancellation: the fee becomes pending again.
export async function restoreFee(conn, sessionId) {
  const fee = await feeFor(conn, sessionId, 'cancelled');
  if (!fee) return;
  await conn.execute("UPDATE charges SET status = 'due' WHERE id = ?", [fee.charge_id]);
  const balance = fee.user_id ? await addToBalance(conn, fee.user_id, fee.amount_cents) : null;
  await conn.execute("UPDATE account_transactions SET status = 'pending', balance_after_cents = ? WHERE id = ?", [balance ?? 0, fee.txn_id]);
}

// Kept for older callers.
export const increaseFee = (conn, { extraCents, ...rest }) => adjustFee(conn, { ...rest, deltaCents: extraCents });

// Extra time on a parked car: charged and processed at once.
export async function chargeNow(conn, { userId, vehicleId = null, sessionId, amountCents, reason, description }) {
  const [c] = await conn.execute(
    `INSERT INTO charges (user_id, vehicle_id, session_id, reason, amount_cents, status, description, created_at)
     VALUES (?, ?, ?, ?, ?, 'paid', ?, UTC_TIMESTAMP())`,
    [userId ?? null, vehicleId, sessionId, reason, amountCents, description]
  );
  if (!userId) return c.insertId;
  const [[u]] = await conn.execute('SELECT account_balance_cents FROM users WHERE id = ?', [userId]);
  if (u) {
    await conn.execute(
      `INSERT INTO account_transactions (user_id, charge_id, type, amount_cents, balance_after_cents, status, processed_at, description, created_at)
       VALUES (?, ?, 'charge', ?, ?, 'processed', UTC_TIMESTAMP(), ?, UTC_TIMESTAMP())`,
      [userId, c.insertId, amountCents, u.account_balance_cents, description]
    );
  }
  return c.insertId;
}

// Used by `npm run db:setup` for charges recorded before account balances existed.
export async function postToAccount(conn, { userId, chargeId, amountCents, description }) {
  const [[user]] = await conn.execute('SELECT account_balance_cents FROM users WHERE id = ?', [userId]);
  if (!user) return;
  await conn.execute(
    `INSERT INTO account_transactions (user_id, charge_id, type, amount_cents, balance_after_cents, status, processed_at, description, created_at)
     VALUES (?, ?, 'charge', ?, ?, 'processed', UTC_TIMESTAMP(), ?, UTC_TIMESTAMP())`,
    [userId, chargeId, amountCents, user.account_balance_cents, description]
  );
}
