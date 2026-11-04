-- RushHourParkingSystem database schema (MySQL 8+, also runs on MariaDB 10.5+)
--
-- Run with:  npm --prefix server run db:setup
-- or by hand: mysql -u parkspot -p parkspot < db/schema.sql
--
-- Times are stored in UTC. Spot status is never stored directly: it comes from
-- the spot's open parking session (see the spot_status view at the bottom), so
-- it can't drift out of sync with the sessions.

-- Floors / levels of the garage -----------------------------------------------
CREATE TABLE IF NOT EXISTS floors (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  code        VARCHAR(8)   NOT NULL,              -- short code shown in the app, e.g. 'L1'
  name        VARCHAR(60)  NOT NULL,              -- e.g. 'Level 1'
  sort_order  INT          NOT NULL DEFAULT 0,
  is_active   TINYINT(1)   NOT NULL DEFAULT 1,    -- 0 = removed by an admin (kept for history)
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_floors_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Parking spots ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS spots (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  floor_id    INT UNSIGNED NOT NULL,
  number      SMALLINT UNSIGNED NOT NULL,         -- 1, 2, 3 … within the floor
  code        VARCHAR(16)  NOT NULL,              -- e.g. 'L1-03'
  spot_type   ENUM('standard','compact','accessible','ev') NOT NULL DEFAULT 'standard',
  is_active   TINYINT(1)   NOT NULL DEFAULT 1,    -- 0 = removed by an admin (kept so past sessions keep their spot)
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_spots_code (code),
  UNIQUE KEY uq_spots_floor_number (floor_id, number),
  CONSTRAINT fk_spots_floor FOREIGN KEY (floor_id) REFERENCES floors (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- App users (sign-up) -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name           VARCHAR(100) NOT NULL,
  email          VARCHAR(255) NOT NULL,
  password_hash  VARCHAR(255) NOT NULL,           -- bcrypt hash, never the password
  phone          VARCHAR(30)  NULL,
  role           ENUM('customer','attendant','admin') NOT NULL DEFAULT 'customer',   -- sign-ups are parking customers; attendants run the lot; admins also manage users and settings
  account_balance_cents INT NOT NULL DEFAULT 0,   -- total of the user's pending charges (account_transactions)
  session_version INT UNSIGNED NOT NULL DEFAULT 0,  -- bumped on password reset to sign the user out everywhere
  last_login_at  DATETIME     NULL,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Vehicles (car plates) -------------------------------------------------------
CREATE TABLE IF NOT EXISTS vehicles (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  plate          VARCHAR(16)  NOT NULL,           -- stored upper-case, e.g. 'ABC-1234'
  owner_user_id  INT UNSIGNED NULL,               -- optional link to a user account
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_vehicles_plate (plate),
  CONSTRAINT fk_vehicles_owner FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Parking sessions: one row per reservation or stay ---------------------------
-- A session is "open" while ended_at IS NULL. The two generated columns plus
-- their unique keys guarantee at most one open session per spot and per vehicle.
CREATE TABLE IF NOT EXISTS parking_sessions (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  spot_id            INT UNSIGNED NOT NULL,
  vehicle_id         INT UNSIGNED NULL,           -- NULL for a reservation with no plate yet
  kind               ENUM('reservation','parked') NOT NULL,
  started_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,  -- hold start, or when the parking clock started
  ended_at           DATETIME NULL,
  reserved_for       DATETIME NULL,               -- reservations: expected arrival time
  reserved_minutes   SMALLINT UNSIGNED NULL,      -- reservations: how long they booked
  reserved_amount_cents INT UNSIGNED NULL,        -- reservations: price locked in when booked
  end_reason         ENUM('checked_in','checked_out','cancelled','no_show','admin') NULL,
  created_by         INT UNSIGNED NULL,           -- user who opened it (a customer, or an admin on their behalf)
  customer_id        INT UNSIGNED NULL,           -- the customer it's for; charged for a no-show
  ended_by           INT UNSIGNED NULL,           -- user who closed it
  active_spot_id     INT UNSIGNED AS (IF(ended_at IS NULL, spot_id, NULL)) STORED,
  active_vehicle_id  INT UNSIGNED AS (IF(ended_at IS NULL, vehicle_id, NULL)) STORED,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sessions_one_open_per_spot (active_spot_id),
  UNIQUE KEY uq_sessions_one_open_per_vehicle (active_vehicle_id),
  KEY idx_sessions_spot (spot_id, started_at),
  KEY idx_sessions_vehicle (vehicle_id, started_at),
  KEY idx_sessions_expiry (ended_at, reserved_for),
  CONSTRAINT fk_sessions_spot    FOREIGN KEY (spot_id)    REFERENCES spots (id),
  CONSTRAINT fk_sessions_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles (id),
  CONSTRAINT fk_sessions_created FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_sessions_customer FOREIGN KEY (customer_id) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_sessions_ended   FOREIGN KEY (ended_by)   REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Charges owed by users (e.g. a no-show on a reservation) ---------------------
CREATE TABLE IF NOT EXISTS charges (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id       INT UNSIGNED NULL,                -- who is charged
  vehicle_id    INT UNSIGNED NULL,
  session_id    BIGINT UNSIGNED NULL,             -- the reservation or stay it's for
  reason        ENUM('no_show','parking','extension') NOT NULL,
  amount_cents  INT UNSIGNED NOT NULL,
  status        ENUM('due','paid','waived') NOT NULL DEFAULT 'due',
  description   VARCHAR(160) NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_charges_session (session_id),
  KEY idx_charges_user (user_id, created_at),
  CONSTRAINT fk_charges_user    FOREIGN KEY (user_id)    REFERENCES users (id)            ON DELETE SET NULL,
  CONSTRAINT fk_charges_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles (id)         ON DELETE SET NULL,
  CONSTRAINT fk_charges_session FOREIGN KEY (session_id) REFERENCES parking_sessions (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Account ledger: every amount added to or taken off a user's account ---------
-- No payment provider is connected yet, so charges are recorded as 'pending'
-- (on the account, not yet collected).
CREATE TABLE IF NOT EXISTS account_transactions (
  id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id              INT UNSIGNED NULL,          -- NULL if the user was later deleted; the record is kept
  charge_id            BIGINT UNSIGNED NULL,      -- the charge this posts, if any
  type                 ENUM('charge','payment','refund','adjustment') NOT NULL,
  amount_cents         INT NOT NULL,              -- + adds to what the user owes, − reduces it
  balance_after_cents  INT NOT NULL,              -- the user's balance right after this row
  status               ENUM('pending','processed','failed','cancelled') NOT NULL DEFAULT 'pending',
  processed_at         DATETIME NULL,              -- when the payment was processed
  processor_ref        VARCHAR(100) NULL,         -- payment provider's id, once there is one
  description          VARCHAR(160) NULL,
  created_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_transactions_charge (charge_id),  -- a charge is posted once
  KEY idx_transactions_user (user_id, created_at),
  KEY idx_transactions_status (status),
  CONSTRAINT fk_transactions_user   FOREIGN KEY (user_id)   REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_transactions_charge FOREIGN KEY (charge_id) REFERENCES charges (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Activity log shown under "Recent activity" ----------------------------------
CREATE TABLE IF NOT EXISTS activity_log (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  spot_id       INT UNSIGNED NULL,
  vehicle_id    INT UNSIGNED NULL,
  user_id       INT UNSIGNED NULL,                -- who did it
  event         VARCHAR(40)  NOT NULL,            -- 'Check in', 'Reserved', …
  amount_cents  INT          NULL,                -- for payments later
  details       VARCHAR(255) NULL,                -- e.g. '2 h → 4 h, arrival 21:25 → 21:45'
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_activity_created (created_at),
  CONSTRAINT fk_activity_spot    FOREIGN KEY (spot_id)    REFERENCES spots (id)    ON DELETE SET NULL,
  CONSTRAINT fk_activity_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles (id) ON DELETE SET NULL,
  CONSTRAINT fk_activity_user    FOREIGN KEY (user_id)    REFERENCES users (id)    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Lot-wide settings (one row). Only admins can change these. ------------------
CREATE TABLE IF NOT EXISTS lot_settings (
  id                 TINYINT UNSIGNED NOT NULL DEFAULT 1,
  hourly_rate_cents  INT UNSIGNED NULL,           -- NULL = not set yet
  lot_name           VARCHAR(100) NULL,           -- shown to everyone on the dashboard
  address            VARCHAR(200) NULL,
  updated_by         INT UNSIGNED NULL,
  updated_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT chk_lot_settings_single_row CHECK (id = 1),
  CONSTRAINT fk_lot_settings_user FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO lot_settings (id) VALUES (1);

-- Current status of every spot ------------------------------------------------
CREATE OR REPLACE VIEW spot_status AS
SELECT
  s.id            AS spot_id,
  s.code          AS code,
  s.number        AS number,
  f.code          AS floor_code,
  f.sort_order    AS floor_sort,
  CASE ps.kind
    WHEN 'parked'      THEN 'occupied'
    WHEN 'reservation' THEN 'reserved'
    ELSE 'free'
  END             AS status,
  v.plate         AS plate,
  v.owner_user_id AS owner_user_id,
  ps.started_at   AS since,
  ps.reserved_for AS reserved_for,
  ps.reserved_minutes AS reserved_minutes,
  ps.reserved_amount_cents AS reserved_amount_cents,
  ps.created_by   AS created_by,
  ps.customer_id  AS customer_id,
  ps.id           AS session_id
FROM spots s
JOIN floors f                ON f.id = s.floor_id
LEFT JOIN parking_sessions ps ON ps.spot_id = s.id AND ps.ended_at IS NULL
LEFT JOIN vehicles v         ON v.id = ps.vehicle_id
WHERE s.is_active = 1 AND f.is_active = 1;
