/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  // Dark mode is the `dark` class on <html>, set by public/theme-init.js (before first paint)
  // and by src/components/ThemeToggle.jsx.
  darkMode: 'class',
  theme: {
    extend: {},
  },
  plugins: [],
};
