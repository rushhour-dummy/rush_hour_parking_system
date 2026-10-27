# ParkSpot dashboard (React + Vite)

A responsive parking dashboard for attendants. On wide screens it shows a sidebar layout; below 820px it switches to the mobile layout with a menu button.

## Run it

```bash
npm install
npm run dev      # start the dev server at http://localhost:5173
npm run build    # production build into dist/
npm run preview  # serve the production build
```

## What works

- Switch between levels 1–3 and select any spot.
- Reserve a free spot, or check out / release a taken one.
- Check in a vehicle by plate: it takes the first free spot on the current level.
- Summary counts and recent activity update as you go.

## Accounts (prototype)

- The app opens on the dashboard. Anyone can view it; checking in, reserving and releasing spots, plus Profile and Settings, ask you to sign in.
- Sign in and Sign up open in a pop-up (`src/components/AuthModal.jsx`). Sign in accepts any email and a password of 6+ characters; Sign up needs a name, email and an 8+ character password. This is a mock; replace `src/auth.jsx` with calls to your login service.
- When signed in, the profile menu in the upper right (the avatar on mobile) opens Profile, Settings and Sign out.
- **Profile:** edit name, email and phone, and change password.
- **Settings:** lot name, address, hourly rate, default level, time format and notifications. Saved in the browser for now.

## Project layout

```
src/
  App.jsx               page layout
  useParking.js         state: spots, selection, activity log, actions
  data.js               sample data (replace with your API)
  styles.css            all styles, incl. the mobile breakpoint
  components/
    Sidebar.jsx         desktop navigation + signed-in user
    MobileHeader.jsx    mobile top bar + collapsible menu
    CheckInForm.jsx     plate entry
    SummaryCards.jsx    free / occupied / reserved / rate
    SpotGrid.jsx        level switcher + spot buttons
    SpotDetail.jsx      selected spot + reserve / release
    MapCard.jsx         Google Maps placeholder
    ActivityLog.jsx     table on desktop, list on mobile
```

## Next steps (matching the architecture sketch)

- **Database (MySQL):** replace `data.js` and the actions in `useParking.js` with calls to your web app's API, which talks to MySQL. The browser should never connect to MySQL directly.
- **Login (auth):** wire the sign-out button and the attendant name to your login service; protect API routes on the server.
- **Google Maps:** load the Maps JavaScript API in `MapCard.jsx` with an API key restricted to your domain.
- Fill in the placeholders: `[YOUR LOT NAME]`, `[ADDRESS]`, `[$/HR]`, `[ATTENDANT NAME]`, `[$]`.
