import { createContext, useContext, useState } from 'react';
import { save } from './storage.js';

// MOCK auth for the prototype. Replace login/logout/updateProfile/changePassword
// with calls to your login (auth) service. Never store real passwords in the browser.

const AuthContext = createContext(null);
const KEY = 'parkspot.user';

function readUser() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function nameFromEmail(email) {
  const base = email.split('@')[0].replace(/[._-]+/g, ' ');
  return base.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(readUser);

  function persist(next) {
    setUser(next);
    save(KEY, next);
  }

  async function login(email, password, remember) {
    await new Promise((r) => setTimeout(r, 400)); // simulate a network call
    if (!email.includes('@')) throw new Error('Enter a valid email address.');
    if (password.length < 6) throw new Error('Password must be at least 6 characters.');
    const next = { name: nameFromEmail(email), email, phone: '', role: 'Attendant' };
    setUser(next);
    if (remember) save(KEY, next);
    return next;
  }

  async function signup(name, email, password) {
    await new Promise((r) => setTimeout(r, 400)); // simulate a network call
    if (!name) throw new Error('Enter your name.');
    if (!email.includes('@')) throw new Error('Enter a valid email address.');
    if (password.length < 8) throw new Error('Password must be at least 8 characters.');
    const next = { name, email, phone: '', role: 'Attendant' };
    persist(next);
    return next;
  }

  function logout() {
    persist(null);
  }

  async function updateProfile(changes) {
    await new Promise((r) => setTimeout(r, 300));
    persist({ ...user, ...changes });
  }

  async function changePassword(current, next) {
    await new Promise((r) => setTimeout(r, 300));
    if (!current) throw new Error('Enter your current password.');
    if (next.length < 8) throw new Error('New password must be at least 8 characters.');
  }

  return (
    <AuthContext.Provider value={{ user, login, signup, logout, updateProfile, changePassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

export function initials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}
