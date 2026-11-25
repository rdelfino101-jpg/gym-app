/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{html,ts}"],
  theme: {
    extend: {
      colors: {
        bg: "#0C0C0C",
        surface: "#161616",
        "surface-2": "#1F1F1F",
        border: "#2A2A2A",
        text: "#F8F9FA",
        "text-muted": "#A1A1AA",
        "text-faint": "#63636A",
        accent: "#F7FF14",
        "accent-dim": "rgba(247, 255, 20, 0.16)",
        "accent-orange": "#FF5500",
        danger: "#FF3B30",
      },
      fontFamily: {
        display: ['"Barlow Condensed"', "sans-serif"],
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};