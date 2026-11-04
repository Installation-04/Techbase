// Runs before the first paint (loaded from <head>) so a dark-mode user never sees a
// flash of the light theme. The preference lives in localStorage under "theme":
// "dark", "light", or absent = follow the system. Keep in sync with src/lib/theme.mjs.
(function () {
  try {
    var stored = localStorage.getItem('theme');
    var systemDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    var dark = stored === 'dark' || (stored !== 'light' && systemDark);
    if (dark) document.documentElement.classList.add('dark');
  } catch (e) {
    /* storage blocked: stay light */
  }
})();
