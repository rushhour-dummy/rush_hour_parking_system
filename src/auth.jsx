import { createContext, useContext, useEffect, useState } from 'react';
import { api } from './api.js';

// Accounts live in the database. The server sets login cookie and
// decides each user's role; the browser only shows or hides pages based on it.

const AuthContext = createContext(null);

export function isAdmin(user) {
  return user?.role === 'Admin';
}

// Staff run the lot: admins and attendants. Only admins manage users and lot settings.
export function isStaff(user) {
  return user?.role === 'Admin' || user?.role === 'Attendant';
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    api('/auth/me')
      .then((d) => setUser(d.user))
      .catch(() => setUser(null))
      .finally(() => setReady(true));
  }, []);

  async function login(email, password, remember) {
    const d = await api('/auth/login', { method: 'POST', body: { email, password, remember } });
    setUser(d.user);
    return d.user;
  }

  async function signup(name, email, password) {
    const d = await api('/auth/signup', { method: 'POST', body: { name, email, password } });
    setUser(d.user);
    return d.user;
  }

  async function logout() {
    setUser(null);
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
  }

  async function updateProfile(changes) {
    const d = await api('/auth/me', { method: 'PATCH', body: changes });
    setUser(d.user);
  }

  async function changePassword(current, next) {
    await api('/auth/password', { method: 'POST', body: { current, next } });
  }

  return (
    <AuthContext.Provider value={{ user, ready, login, signup, logout, updateProfile, changePassword }}>
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
