/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#FAF5F4',
          100: '#F5EDEB',
          200: '#E8D5D1',
          300: '#D4B8B4',
          400: '#B8908A',
          500: '#8B6B64',
          600: '#6B4F48',
          700: '#4A3530',
          800: '#3D2B27',
          900: '#2C1F1C',
        }
      },
      fontFamily: {
        serif: ['"Playfair Display"', 'Georgia', 'serif'],
        sans:  ['"DM Sans"', 'system-ui', 'sans-serif'],
      }
    }
  },
  plugins: []
}
