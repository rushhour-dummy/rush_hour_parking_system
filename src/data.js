// Sample data. Replace with calls to your web app's API / MySQL backend.

export const LEVELS = ['L1', 'L2', 'L3'];
export const SPOTS_PER_LEVEL = 24;

export const STATUS_LABEL = {
  free: 'Free',
  occupied: 'Occupied',
  reserved: 'Reserved',
};

export const STATUS_DETAIL = {
  free: 'Open now. Standard car spot near the elevator.',
  occupied: 'Vehicle parked. Plate on file.',
  reserved: 'Held for a reservation made in the app.',
};

export function spotId(level, n) {
  return `${level}-${String(n).padStart(2, '0')}`;
}

export function buildInitialSpots() {
  const spots = {};
  LEVELS.forEach((level, li) => {
    for (let i = 1; i <= SPOTS_PER_LEVEL; i++) {
      const n = (i * 7 + li * 5) % 10;
      spots[spotId(level, i)] = n < 4 ? 'occupied' : n < 6 ? 'reserved' : 'free';
    }
  });
  return spots;
}

export const INITIAL_LOG = [
  { time: '08:12', plate: 'ABC-1234', spot: 'L1-05', event: 'Check in', amount: '—' },
  { time: '08:40', plate: 'KTR-5521', spot: 'L2-11', event: 'Reserved', amount: '[$]' },
  { time: '09:05', plate: 'MNP-0098', spot: 'L1-17', event: 'Check out', amount: '[$]' },
  { time: '09:22', plate: 'ZQX-7310', spot: 'L3-02', event: 'Check in', amount: '—' },
];
