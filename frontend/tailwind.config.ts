import type { Config } from "tailwindcss";
import forms from "@tailwindcss/forms";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx}", "./app/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["Fraunces", "Georgia", "serif"],
        stat: ["'IBM Plex Mono'", "ui-monospace", "monospace"],
        sans: ["Archivo", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        ink: "#17211b",
        graphite: "#3d4641",
        court: "#567a62",
        line: "#d8ddd7",
        paper: "#f6f7f4",
        make: "#1f8a62",
        miss: "#c94d3f",
        brass: "#c0843e"
      },
      boxShadow: {
        panel: "0 18px 60px rgba(23, 33, 27, 0.08)"
      }
    },
  },
  plugins: [forms],
};

export default config;
