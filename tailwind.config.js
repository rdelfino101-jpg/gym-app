/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{html,ts}"],
  theme: {
    extend: {
      colors: {
        accent: '#ff5f1f',
        'accent-dim': '#ff5f1f33',
        bg: '#121110',
        surface: '#1a1917',
        'surface-2': '#211f1d',
        border: '#302d29',
        text: '#f5f3ee',
        'text-muted': '#a8a39a',
        'text-faint': '#6b665e',
        danger: '#ef4444',
      },
      fontFamily: {
        display: ['"Big Shoulders Display"', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
      },
      borderRadius: {
        DEFAULT: '10px',
      }
    },
  },
  plugins: [],
}