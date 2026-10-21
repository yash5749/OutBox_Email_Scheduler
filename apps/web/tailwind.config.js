/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './features/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f0fbf4',
          100: '#e3f7eb',
          200: '#bceacc',
          300: '#83dba4',
          400: '#3bc76e',
          500: '#00a63e',
          600: '#008e35',
          700: '#08732e',
          800: '#0d5b29',
          900: '#104b25',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
