import { useEffect, useState } from 'react';

export type AdminTheme = 'light' | 'dark';
export type AccentColor = 'rose' | 'teal' | 'amber' | 'blue' | 'violet';

export const ADMIN_THEME_STORAGE_KEY = 'meshbridge:admin-theme:v1';
export const ADMIN_ACCENT_STORAGE_KEY = 'meshbridge:admin-accent:v1';

export const ACCENT_COLORS: Record<AccentColor, { name: string; color: string; soft: string }> = {
  rose: { name: 'Розовый', color: '#d84f86', soft: '#f7e8ef' },
  teal: { name: 'Бирюзовый', color: '#0f9f8e', soft: '#e4f7f4' },
  amber: { name: 'Янтарный', color: '#d97706', soft: '#fff1d7' },
  blue: { name: 'Синий', color: '#2563eb', soft: '#e8efff' },
  violet: { name: 'Фиолетовый', color: '#7c3aed', soft: '#f0e8ff' },
};

export const readStoredValue = <T,>(key: string, fallback: T): T => {
  if (typeof window === 'undefined') return fallback;

  try {
    const stored = window.localStorage.getItem(key);
    return stored ? (JSON.parse(stored) as T) : fallback;
  } catch {
    return fallback;
  }
};

export const isAccentColor = (value: unknown): value is AccentColor => (
  typeof value === 'string' && value in ACCENT_COLORS
);

export const getStoredUiTheme = () => {
  const storedAccent = readStoredValue<unknown>(ADMIN_ACCENT_STORAGE_KEY, 'rose');
  const theme = readStoredValue<AdminTheme>(ADMIN_THEME_STORAGE_KEY, 'light');
  const accent = isAccentColor(storedAccent) ? storedAccent : 'rose';

  return {
    theme: theme === 'dark' ? 'dark' as const : 'light' as const,
    accent,
    currentAccent: ACCENT_COLORS[accent],
  };
};

export const useUiTheme = () => {
  const [uiTheme, setUiTheme] = useState(getStoredUiTheme);

  useEffect(() => {
    const syncTheme = () => setUiTheme(getStoredUiTheme());
    window.addEventListener('storage', syncTheme);
    window.addEventListener('focus', syncTheme);
    return () => {
      window.removeEventListener('storage', syncTheme);
      window.removeEventListener('focus', syncTheme);
    };
  }, []);

  return {
    ...uiTheme,
    isDarkTheme: uiTheme.theme === 'dark',
  };
};
