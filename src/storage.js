// Small localStorage helpers that never throw (private mode, blocked storage, etc.).

// Loads a value from local storage, merging it with a fallback object if necessary. Never throws.
export function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

// Saves a value to local storage, removing it if the value is null. Never throws.
export function save(key, value) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}
