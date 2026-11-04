/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState } from 'react';
import { load, save } from './storage.js';

const SettingsContext = createContext(null); // Context for managing application settings.
const KEY = 'parkspot.settings'; // Key used for storing settings in local storage.

// Default settings for the application, including lot name, address, hourly rate, and notification preferences.
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

// Provides the settings context to the application, managing the state and persistence of settings.
export function SettingsProvider({ children }) {
  // Initializes the settings state from local storage or with default settings.
  const [settings, setSettings] = useState(() => load(KEY, DEFAULT_SETTINGS));

  // Updates the settings with the provided changes and persists them to local storage.
  function updateSettings(changes) {
    const next = { ...settings, ...changes };
    setSettings(next);
    save(KEY, next);
  }

  // Resets the settings to their default values and clears the stored settings.
  function resetSettings() {
    setSettings(DEFAULT_SETTINGS);
    save(KEY, null);
  }

  // Renders the settings context provider, making the settings and related functions available to the child components.
  return (
    <SettingsContext.Provider value={{ settings, updateSettings, resetSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}

// Custom hook to access the settings context, providing the current settings and functions to update or reset them.
export function useSettings() {
  return useContext(SettingsContext);
}
