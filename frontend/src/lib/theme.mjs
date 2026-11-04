// Theme preference logic, kept free of DOM and storage so it can be unit-tested.
// The preference is "system" (follow the operating system), "light" or "dark".
// Keep the early script public/theme-init.js in sync with resolveTheme().
export const THEME_KEY = 'theme';
export const PREFERENCES = ['system', 'light', 'dark'];
export const PREFERENCE_LABELS = { system: 'Automatique (système)', light: 'Clair', dark: 'Sombre' };

export function normalizePreference(value) {
  return PREFERENCES.includes(value) ? value : 'system';
}

// -> 'light' | 'dark'
export function resolveTheme(preference, systemPrefersDark) {
  const pref = normalizePreference(preference);
  if (pref === 'system') return systemPrefersDark ? 'dark' : 'light';
  return pref;
}

// The toggle button cycles system -> light -> dark -> system.
export function nextPreference(preference) {
  const index = PREFERENCES.indexOf(normalizePreference(preference));
  return PREFERENCES[(index + 1) % PREFERENCES.length];
}
