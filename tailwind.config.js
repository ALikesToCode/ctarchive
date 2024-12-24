/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./dist/**/*.html",
    "./src/templates/**/*.pug"
  ],
  theme: {
    extend: {
      colors: {
        primary: '#1a73e8',
        secondary: '#5f6368',
        background: '#f8f9fa',
        surface: '#ffffff',
      },
      spacing: {
        '128': '32rem',
      },
    },
  },
  plugins: [],
} 