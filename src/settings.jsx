import { createContext, useContext, useState } from 'react';
import { load, save } from './storage.js';

const SettingsContext = createContext(null);
const KEY = 'parkspot.settings';

export const DEFAULT_SETTINGS = {
  lotName: '[YOUR LOT NAME]',
  address: '[ADDRESS]',
  hourlyRate: '',
  defaultLevel: 'L1',
  timeFormat: '24h',
  notifyReservations: true,
  notifyLotFull: true,
  notifyEmailSummary: false,
};

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(() => load(KEY, DEFAULT_SETTINGS));

  function updateSettings(changes) {
    const next = { ...settings, ...changes };
    setSettings(next);
    save(KEY, next);
  }

  function resetSettings() {
    setSettings(DEFAULT_SETTINGS);
    save(KEY, null);
  }

  return (
    <SettingsContext.Provider value={{ settings, updateSettings, resetSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}
