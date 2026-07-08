/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // 花笺风格颜色
        'huajian': {
          'paper': '#f6f3ec',
          'paper-deep': '#e8e4d9',
          'cloud': '#ffffff',
          'ink': '#1a1a18',
          'ink-light': '#4a4a48',
          'bamboo': '#2d5a3d',
          'bamboo-light': '#4a8c6a',
          'bamboo-glow': '#3d7a5a',
          'plum': '#8b4513',
          'gold': '#c9a96e',
          'shadow': 'rgba(0,0,0,0.06)',
          'shadow-deep': 'rgba(0,0,0,0.12)',
        }
      },
      fontFamily: {
        'serif': ['"Noto Serif SC"', 'serif'],
        'sans': ['"Noto Sans SC"', 'sans-serif'],
      },
      borderRadius: {
        'huajian': '12px',
      },
      boxShadow: {
        'huajian': '0 1px 4px rgba(0,0,0,0.06)',
        'huajian-hover': '0 4px 16px rgba(0,0,0,0.12)',
      }
    },
  },
  plugins: [],
}
