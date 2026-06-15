/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        zahraa: {
          navy: "#0B2E6B",
          coral: "#F26539",
          white: "#FFFFFF",
          mist: "#F8F9FC"
        }
      },
      fontFamily: {
        sans: [
          "IBM Plex Sans Arabic",
          "Tajawal",
          "Noto Kufi Arabic",
          "Noto Sans Arabic",
          "sans-serif"
        ]
      },
      boxShadow: {
        soft: "0 18px 45px rgba(11, 46, 107, 0.08)"
      }
    }
  },
  plugins: []
};
