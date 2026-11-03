import type { Config } from "tailwindcss";

// Propmatrix family palette (same as Flipy and ChatADU): navy brand scale, #0052FF wordmark blue.
const navy = {
  50: "#eef3fa",
  100: "#dde7f5",
  200: "#bccfe9",
  300: "#8eaed8",
  400: "#4f7fbf",
  500: "#12408f",
  600: "#002664",
  700: "#001d4d",
  800: "#00143a",
  900: "#000c1f",
};

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: { brand: navy, ink: "#000c1f" },
      fontFamily: {
        sans: ['"Inter Tight"', "Arial", "Helvetica", "sans-serif"],
        serif: ['"Instrument Serif"', '"Times New Roman"', "Times", "serif"],
        // Same face as the Propmatrix wordmark (Avenir Next Medium); Nunito covers non-Apple devices
        logo: ['"Avenir Next"', "Avenir", "Nunito", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
