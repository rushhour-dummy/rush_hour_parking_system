/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState } from 'react';
import { save } from './storage.js';

// MOCK auth for the prototype. Replace login/logout/updateProfile/changePassword
// with calls to your login (auth) service. Never store real passwords in the browser.

const AuthContext = createContext(null); // Context for managing authentication state.
const KEY = 'parkspot.user'; // Key used to store the user in local storage.

// Reads the user from local storage, returning null if not found or if parsing fails.
function readUser() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// Derives a display name from an email address by taking the part before '@', replacing separators with spaces, and capitalizing the first letter of each word.
function nameFromEmail(email) {
  const base = email.split('@')[0].replace(/[._-]+/g, ' ');
  return base.replace(/\b\w/g, (c) => c.toUpperCase());
}

// Provides the authentication context and manages user state, including login, signup, logout, profile updates, and password changes.
export function AuthProvider({ children }) {
  const [user, setUser] = useState(readUser);

  // Persists the user to local storage and updates the state.
  function persist(next) {
    setUser(next);
    save(KEY, next);
  }

  // Logs in a user with the provided email and password, optionally remembering the user in local storage.
  async function login(email, password, remember) {
    await new Promise((r) => setTimeout(r, 400)); // simulate a network call
    if (!email.includes('@')) throw new Error('Enter a valid email address.');
    if (password.length < 6) throw new Error('Password must be at least 6 characters.');
    const next = { name: nameFromEmail(email), email, phone: '', role: 'Attendant' };
    setUser(next);
    if (remember) save(KEY, next);
    return next;
  }

  // Signs up a new user with the provided name, email, and password, persisting the user in local storage.
  async function signup(name, email, password) {
    await new Promise((r) => setTimeout(r, 400)); // simulate a network call
    if (!name) throw new Error('Enter your name.');
    if (!email.includes('@')) throw new Error('Enter a valid email address.');
    if (password.length < 8) throw new Error('Password must be at least 8 characters.');
    const next = { name, email, phone: '', role: 'Attendant' };
    persist(next);
    return next;
  }

  // Logs out the current user, clearing the state and local storage.
  function logout() {
    persist(null);
  }

  // Updates the current user's profile with the provided changes, persisting the changes in local storage.
  async function updateProfile(changes) {
    await new Promise((r) => setTimeout(r, 300));
    persist({ ...user, ...changes });
  }

  // Changes the current user's password after validating the current and new passwords.
  async function changePassword(current, next) {
    await new Promise((r) => setTimeout(r, 300));
    if (!current) throw new Error('Enter your current password.');
    if (next.length < 8) throw new Error('New password must be at least 8 characters.');
  }

  // Provides the authentication context to the component tree.
  return (
    <AuthContext.Provider value={{ user, login, signup, logout, updateProfile, changePassword }}>
      {children}
    </AuthContext.Provider>
  );
}

// Custom hook to access the authentication context.
export function useAuth() {
  return useContext(AuthContext);
}

// Generates the initials of a user's name for display purposes.
export function initials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  // Extracts the first letter of each part of the name to form the initials.
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}
