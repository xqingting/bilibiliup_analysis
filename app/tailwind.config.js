/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bilibili: "#FB7299",
        accent: {
          DEFAULT: "#FB7299",
          hover: "#fc8bab",
        },
        ink: {
          950: "#0b0f1a",
          900: "#111827",
          850: "#151c2c",
          800: "#1a2333",
          700: "#243044",
          600: "#33415c",
          400: "#7c8db0",
          300: "#a5b3cf",
          200: "#cdd7ea",
        },
        cyanic: "#22d3ee",
      },
      fontFamily: {
        sans: [
          "Inter",
          "PingFang SC",
          "Hiragino Sans GB",
          "Microsoft YaHei",
          "system-ui",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};
