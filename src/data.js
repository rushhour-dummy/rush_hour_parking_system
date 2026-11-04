// Display text shared by the components. The spots, floors, cars and accounts
// themselves now come from the database through the API.

export const STATUS_LABEL = {
  free: 'Open',
  occupied: 'Occupied',
  reserved: 'Reserved',
};

export const STATUS_DETAIL = {
  free: 'Open now. Standard car spot near the elevator.',
  occupied: 'Vehicle parked.',
  reserved: 'Held for a reservation.',
};

export function spotId(level, n) {
  return `${level}-${String(n).padStart(2, '0')}`;
}
