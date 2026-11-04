# RushHourParkingSystem (React + Vite + Express + MySQL)

A parking app for customers, with an admin area and a MySQL database.

```
Browser (React)  ──HTTPS──▶  API server (server/, Express)  ──▶  MySQL (db/schema.sql)
                                    │
                                    └── Google Maps (later)
```

The browser never talks to MySQL directly. It calls the API, and the API checks who you are before reading or writing the database.

## What's stored in the database

| Table | Holds |
| --- | --- |
| `floors` | Each level of the garage (`L1` → "Level 1"). |
| `spots` | Every spot, its floor and number (`L1-03`), type, and whether it's in service. |
| `users` | Accounts: name, email, phone, role (`customer`, `attendant` or `admin`), bcrypt password hash. |
| `vehicles` | Every car plate the system has seen. |
| `parking_sessions` | Each reservation or stay: spot, plate, start and end time, and who opened or closed it. |
| `activity_log` | The "Recent activity" feed: check-ins, check-outs, reservations, cancellations. |
| `lot_settings` | Lot-wide settings: lot name, address and hourly rate. Only admins can change them. |
| `charges` | Each charge and why, e.g. the full reserved amount for a missed reservation. |
| `account_transactions` | The account ledger: every amount posted to a user's account, with the balance after it and a payment status. |

Each user also has `users.account_balance_cents`, the total they owe. It always equals the sum of their ledger rows.
| `spot_status` (view) | Each spot's current status, worked out from its open session. |

The database itself guarantees that a spot has at most one open session and a car is in at most one spot at a time.

## Set up and run

You need Node 20+ and MySQL 8 (or MariaDB 10.5+).

**1. Start MySQL.** With Docker:

```bash
docker compose up -d
```

Or use your own MySQL server and create a database and user for the app.

**2. Configure and set up the database:**

```bash
cd server
cp .env.example .env        # then edit it: DB settings, JWT_SECRET, admin email/password -- NOTE, This part already configured.
npm install
npm run db:check 			# Check the connection between the app and the SQL database
Run one of these command:
	npm run db:setup:sample		# tables + 3 floors × 24 spots + admin + sample cars
	npm run db:setup			# This command will set an empty lot --USE THIS ONE
```

The setup is safe to run again: it only adds what's missing. `FLOORS` and `SPOTS_PER_FLOOR` in `.env` set the garage size. If tables already exists, will skip.

**3. Run the app** in two terminals:

```bash
# terminal 1, in server/
NOTE npm install already ran in the previous step, no need to run it again.
npm run dev                 # API on http://localhost:3001

# terminal 2, in the project root
npm install
npm run dev                 # app on http://localhost:5173 (calls /api on the server)
```

Sign in with the admin email and password from `server/.env`, or sign up for a regular account.

**Production:** run `npm run build` in the project root, then `npm start` in `server/`. The server then serves the app and the API from one address. Set `NODE_ENV=production`, a long random `JWT_SECRET`, and `COOKIE_SECURE=true` behind HTTPS.

## Connecting to a hosted MySQL (Aiven)

Aiven MySQL only accepts encrypted connections, signed by Aiven's own certificate authority. The server verifies that certificate, so you need two things from the Aiven console.

1. **Copy the connection details.** Open your MySQL service → **Overview**. Copy the **Service URI**. It looks like
   `mysql://avnadmin:PASSWORD@your-service-yourproject.e.aivencloud.com:12345/defaultdb?ssl-mode=REQUIRED`
2. **Download the CA certificate** from the same page and save it as `server/ca.pem`.
3. **Edit `server/.env`:**
   ```
   DATABASE_URL=mysql://avnadmin:PASSWORD@your-service-yourproject.e.aivencloud.com:12345/defaultdb?ssl-mode=REQUIRED
   DB_SSL_CA=./ca.pem
   DB_NAME=parkspot
   ```
   - When `DATABASE_URL` is set, the `DB_HOST`, `DB_PORT`, `DB_USER` and `DB_PASSWORD` lines are ignored.
   - `DB_NAME` picks the database on that server. Set it to `parkspot` and setup creates a separate database for the app. Leave it empty to use Aiven's `defaultdb`.
   - Also set a real `JWT_SECRET` and the `ADMIN_EMAIL` / `ADMIN_PASSWORD` you want.
4. **Test, then set up:**
   ```bash
   cd server
   npm run db:check     # connects, confirms the connection is encrypted, says what's missing
   npm run db:setup     # creates the tables, floors, spots and admin on Aiven
   npm run dev
   ```
   `db:check` and the server's startup message explain the usual problems: a wrong password, a missing or wrong CA file, or your IP address not being allowed.
5. **Allowed IPs:** in Aiven, check the service's **Allowed IP addresses** includes the computer or host running the API server.

Keep `server/.env` private; it holds the database password, and it's already in `.gitignore`. On hosting platforms where you can't upload `ca.pem`, put the certificate in the `DB_SSL_CA_BASE64` setting instead. It's the file's contents, base64-encoded (`base64 -w0 ca.pem`).

## Accounts and roles

- **Sign up** creates a normal parking **customer** account (the default role). Passwords are stored only as bcrypt hashes.
- **Admins manage users** on the **Users** page, a table with each user's role, last sign-in and balance. **Add user** and **Edit** open in pop-ups: add a user (Customer by default, or Attendant or Admin) with a temporary password, edit name, email, phone and role, reset a password, or delete a user.
  - Resetting a password signs that user out everywhere. Changing your own password signs out your other devices.
  - An admin can't change their own role or delete themselves, and there's always at least one admin.
  - A user can't be deleted while they have a car parked or reserved, or while they owe money. Their past parking and payment records are kept, unlinked from the account.
- **Only admins can set the hourly rate** (Settings → Hourly rate). Customers don't see the rate in their Settings, and the server refuses the change from anyone but an admin. (Customers still see the price when reserving.)
- **Admins** are created by the server, never by sign-up: either from `ADMIN_EMAIL` / `ADMIN_PASSWORD` during `db:setup`, or with:
  ```bash
  npm run create-admin -- admin@example.com "a-strong-password" "Full Name"
  ```
- Sign-in sets an httpOnly cookie (30 days with "Keep me signed in", otherwise 12 hours). Sign-in and sign-up are rate limited.
- The server checks the role on every admin request; regular users get "403 Only administrators can do that."

## What each screen does

- **Guests** see the parking overview (counts and spot map, no plates). Actions open the sign-in pop-up.
- **Customers** have **Overview** (check-in and check-out, counts with arrows to step between levels, map, recent activity), **Spots** (the spot map: reserve, cancel, check out), **Reservations** (check a car in or out; cars parked now with their spot, check-in time and expiry; current reservations with Check in vehicle, add time and cancel; past reservations), **Payments** (balance and transaction history) and Settings. Guests see the overview and spot map together on the landing page. They save their plates under **Settings → My cars** (up to 10), then pick from them to check in or reserve. Their Settings show only My cars, Default level (Level 1 unless changed), Display and their notifications.
- **Desktop layout:** a header across the top (logo, role badge, lot name, profile menu) and a footer (lot name and address, reservation rules). On phones these are replaced by the compact mobile header.
- **Overview counts for customers and guests** show Available, Occupied and the hourly rate. Reserved spots are counted as occupied there; only staff see a separate Reserved count.
- **Phone numbers** are stored as `123-456-7890`. The field formats digits as you type, and the server rejects anything that isn't 10 digits.
- Clicking the **RushHourParkingSystem** logo goes back to the main landing page: the Overview for guests and customers, All spots for admins.
- **Lot name and address** are set by admins in Settings and shown to everyone on the Overview. They only see details, activity and charges for their own cars, and can only check out or cancel their own.

## Reservation rules

- **One spot per car.** A car can be parked in, or hold a reservation for, only one spot at a time. The database enforces this too.
- **Reserving holds the spot, not the clock.** "Reserve this spot" asks for a car, an arrival time (**up to 1 hour ahead**) and a length of stay (1–12 hours). The spot is held from that moment so nobody else can take it; the parking clock starts only at check-in.
- **Price locked in.** The fee is length × the hourly rate at the time of booking, and goes on the customer's account as pending.
- **Check-in** with a reserved car parks it in its reserved spot (even before the arrival time). **This is when the reservation's pending fee is processed** (see Billing). Without a reservation, the car takes the first free spot on the level.
- **No-shows.** If the car isn't checked in within 15 minutes after the arrival time, the server releases the spot and charges the person who reserved the full reserved amount. It checks every 30 seconds, and again before showing or changing spots. The charge is posted to that user's account (see Billing below).
- **Cancelling** a reservation before then is free (Reservations page, or the selected spot on the Spots page). It always asks for confirmation first, for customers and staff.
- **Adding time** (Reservations page) lengthens the stay, up to 12 hours in total. The extra hours are priced at the current rate. The arrival time and check-in deadline don't change.
- **Admins can reserve for a customer**: on All spots or Open spots, "Reserve for customer" picks a registered customer, one of their cars, an arrival time and a length. The same rules apply, the reservation shows on the customer's Reservations page, and the customer (not the admin) is charged for a no-show.
- The 15-minute grace period, 1-hour reservation window and 12-hour maximum stay can be changed with `NO_SHOW_GRACE_MINUTES`, `RESERVE_MAX_HOURS_AHEAD` and `RESERVE_MAX_HOURS` in `server/.env`.
- **Check-out always asks for confirmation**, for customers and staff.
- **Staff can edit a reservation** (Reservations page → **Edit**): change the arrival time (still up to 1 hour ahead) and/or the length (1–12 h). The expiry moves to the new arrival time + 15 minutes, and the pending fee is re-priced for the hours added or removed. Staff holds with no arrival time can't be edited.
- **Staff can add time to an occupied spot** (Reservations page → **Add time**). The paid-until time moves forward by the hours added (from now, if paid time has already run out), the Expires column updates, and the extra cost is **processed immediately** and charged to the customer (shown as "Extra time" on their Payments page).
- **Attendants** (staff) have **All spots**, **Reservations** and **Open spots**. They can reserve for customers, cancel and check out, but can't manage users or lot settings. Their Settings show only Display and Notifications.
- **Admins** have a left panel with **All spots**, **Reservations** (reserved and occupied spots, with the customer's email and when each hold **expires**), **Open spots** (free spots only), **Activities**, **Users** and **Manage Parking Lot**. The spot lists cover every level and show the vehicle and customer, with filters, search (spot, plate or customer), and reserve-for-customer, cancel or check-out actions with Undo.
- The screen refreshes every 15 seconds, so several people can work at once.
- **Manage Parking Lot** (admins only): the lot name, address and hourly rate (moved here from Settings), plus the layout:
  - **Add level** with an optional name (e.g. "Rooftop") and 1–100 spots. It gets the next free code (L4, L5, …).
  - **Rename** a level, **Add spots** to it (gaps in the numbering are filled first), **Remove spots** (pick them on a grid), or **Remove level**.
  - Spots with a car or reservation can't be removed; check them out or cancel them first. A level keeps at least one spot, and the lot keeps at least one level.
  - Removed levels and spots are hidden, not deleted, so past reservations, payments and activity still show the right spot. Adding them back reuses the same codes.
- **Activities** (admins only): every event in the lot, newest first — reservations made, time changes (old → new arrival time and length), added time (old → new paid-until), cancellations, check-ins and -outs, no-shows, and lot changes. Filter by type and date range, search by spot, plate or person, 50 per page.
- **Settings:** time format and notifications are saved in each browser; customers also pick a default level.

## Billing

A reservation's fee goes through these states on the customer's account:

| When | Fee status |
| --- | --- |
| Reserve a spot | **Pending** for the full fee (hours × rate) |
| Add time / staff edits the length | Still pending; the amount goes up or down |
| Staff adds time to a parked car | A new fee, **processed** at once |
| Check in | **Processed**: the payment is taken |
| Miss the reservation (no check-in within 15 minutes of arrival) | **Processed** in full; the spot is released |
| Cancel (customer or staff) | **Cancelled**; not charged. A staff Undo makes it pending again |

- Check-in asks for confirmation and shows the fee that will be processed. Checking in without a reservation has no fee.
- Once a car is checked in, its button becomes **Check out**. Check-out asks for confirmation, and warns that unused paid time isn't refunded.
- Each fee is one row in `charges` and one in `account_transactions`, updated together in one database transaction.
- `users.account_balance_cents` is the total of the user's pending fees.
- Customers see every fee and its status on the **Payments** page.

**No payment provider is connected yet.** "Processed" is recorded at the moment the rules say payment happens, but no card is charged. To connect a provider, call it from `markProcessed()` in `server/src/billing.js` and store its reference in `account_transactions.processor_ref`. Use status `failed` if the payment is declined.

## API

| Method | Path | Who | Does |
| --- | --- | --- | --- |
| GET | `/api/auth/me` | anyone | Current user, or `null` |
| POST | `/api/auth/signup` | anyone | Create an account and sign in |
| POST | `/api/auth/login` | anyone | Sign in |
| POST | `/api/auth/logout` | anyone | Sign out |
| PATCH | `/api/auth/me` | signed in | Update name, email, phone |
| POST | `/api/auth/password` | signed in | Change password |
| GET | `/api/spots` | anyone | Floors and spot status (plates only when signed in) |
| POST | `/api/check-in` | signed in | `{ plate, floor }` → parks one of your cars (starts the clock) |
| POST | `/api/spots/:code/reserve` | signed in | `{ plate, reservedFor, hours }` → holds a free spot for one of your cars |
| POST | `/api/spots/:code/release` | signed in | Check out or cancel (your own car only, unless admin) |
| GET | `/api/activity?limit=8` | signed in | Recent activity (your own cars only, unless admin) |
| GET | `/api/me/vehicles` | signed in | Your cars and where each one is |
| POST | `/api/me/vehicles` | signed in | `{ plate }` → add a car |
| DELETE | `/api/me/vehicles/:id` | signed in | Remove a car (not while parked or reserved) |
| GET | `/api/me/account` | signed in | Your balance and transaction history |
| GET | `/api/me/reservations` | signed in | Your current and past reservations |
| POST | `/api/me/reservations/:id/cancel` | signed in | Cancel your reservation |
| POST | `/api/me/reservations/:id/extend` | signed in | `{ hours }` → add time to your reservation |
| GET | `/api/me/charges` | signed in | Your charges |
| POST | `/api/admin/sessions/:id/reopen` | staff | Undo an admin check-out or cancellation |
| PATCH | `/api/admin/spots/:code/reservation` | staff | `{ reservedFor?, hours? }` → edit a reservation; re-prices the pending fee |
| POST | `/api/admin/spots/:code/extend` | staff | `{ hours }` → add paid time to an occupied spot; the cost is processed now |
| POST | `/api/admin/spots/:code/reserve` | staff | `{ userId, vehicleId, reservedFor, hours }` → reserve for a customer |
| GET | `/api/lot` | anyone | `{ hourlyRate }` in dollars, or `null` |
| POST | `/api/admin/spots/:code/status` | staff | `{ status: free \| reserved \| occupied, plate }` |
| PUT | `/api/admin/lot` | admin | Any of `{ hourlyRate, lotName, address }`. Rate e.g. `3.50`, or `null` to clear |
| POST | `/api/admin/floors` | admin | `{ name?, spots }` → add a level |
| PATCH | `/api/admin/floors/:code` | admin | `{ name }` → rename a level |
| DELETE | `/api/admin/floors/:code` | admin | Remove a level (all its spots must be free) |
| POST | `/api/admin/floors/:code/spots` | admin | `{ count }` → add spots to a level |
| POST | `/api/admin/spots/remove` | admin | `{ codes: [...] }` → remove free spots |
| GET | `/api/admin/activity` | admin | `?type=&q=&from=&to=&page=` → the Activities page |
| GET | `/api/admin/users` | admin | All accounts, with the balance each one owes |
| GET | `/api/admin/customers` | staff | Customers to reserve for |
| GET | `/api/admin/users/:id/vehicles` | staff | A user's cars and where each one is |
| POST | `/api/admin/users` | admin | `{ name, email, phone?, password, role? }` → new account (Customer unless `role` is `"Attendant"` or `"Admin"`) |
| PATCH | `/api/admin/users/:id` | admin | Any of `{ name, email, phone, role, password }` |
| DELETE | `/api/admin/users/:id` | admin | Delete a user |

**Updating an existing database:** run `npm run db:setup` again in `server/`. It adds any new tables and columns (hourly rate, reservations, charges, account balances), allows several charges per stay (for added time), lets levels be removed, stores activity details, renames older `attendant` accounts to `customer`, and keeps your data. Charges made before account balances existed are posted to their users' accounts.

## Project layout

```
db/schema.sql           tables and the spot_status view
docker-compose.yml      local MySQL for development
server/
  .env.example          settings to copy into .env
  src/index.js          Express app (also serves the built frontend)
  src/db.js             MySQL connection pool
  src/auth.js           login cookie, current user, role checks
  src/routes/           auth, spots, admin endpoints
  scripts/setup-db.js   create tables, floors, spots, admin, sample data
  scripts/check-db.js   test the database connection (npm run db:check)
  scripts/create-admin.js
src/
  api.js                fetch wrapper for /api
  auth.jsx              sign-in state from the server
  parking.jsx           spots, floors and activity from the server
  App.jsx, components/, pages/   the UI
```

## Next steps

- Check-out doesn't charge for the time parked yet; that needs a billing rule.
- Connect a payment provider (see Billing).

- Load the Google Maps JavaScript API in `src/components/MapCard.jsx` with a key restricted to your domain.
- Fill in the placeholders in Settings: lot name, address, hourly rate.
- Payments: `activity_log.amount_cents` is ready for amounts when you add billing.
