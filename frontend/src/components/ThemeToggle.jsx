import React, { useEffect, useState } from 'react';
import { THEME_KEY, PREFERENCE_LABELS, normalizePreference, resolveTheme, nextPreference } from '../lib/theme.mjs';

const ICONS = { system: '🖥️', light: '☀️', dark: '🌙' };
const CHANGE_EVENT = 'techibase-theme-change';
const DARK_QUERY = '(prefers-color-scheme: dark)';

function readPreference() {
  try {
    return normalizePreference(localStorage.getItem(THEME_KEY));
  } catch {
    return 'system';
  }
}

function applyTheme(preference) {
  const dark = resolveTheme(preference, window.matchMedia(DARK_QUERY).matches) === 'dark';
  document.documentElement.classList.toggle('dark', dark);
}

// Cycles Automatique -> Clair -> Sombre. Several toggles can be mounted at once (the
// desktop and the phone header), so they stay in sync through a window event.
export default function ThemeToggle({ onDark = false }) {
  const [preference, setPreference] = useState(readPreference);

  useEffect(() => {
    applyTheme(preference);
    if (preference !== 'system') return undefined;
    const media = window.matchMedia(DARK_QUERY);
    const follow = () => applyTheme('system');
    media.addEventListener('change', follow);
    return () => media.removeEventListener('change', follow);
  }, [preference]);

  useEffect(() => {
    const sync = () => setPreference(readPreference());
    window.addEventListener(CHANGE_EVENT, sync);
    return () => window.removeEventListener(CHANGE_EVENT, sync);
  }, []);

  const change = () => {
    const next = nextPreference(preference);
    try {
      if (next === 'system') localStorage.removeItem(THEME_KEY);
      else localStorage.setItem(THEME_KEY, next);
    } catch {
      /* storage blocked: the choice lasts until the page is reloaded */
    }
    setPreference(next);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  };

  const label = `Thème : ${PREFERENCE_LABELS[preference]}. Cliquer pour changer.`;
  const colors = onDark
    ? 'text-gray-300 hover:text-white hover:bg-gray-800'
    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-800';

  return (
    <button
      type="button"
      onClick={change}
      title={label}
      aria-label={label}
      className={`p-2 rounded-lg transition-colors text-lg leading-none ${colors}`}
    >
      <span aria-hidden="true">{ICONS[preference]}</span>
    </button>
  );
}
