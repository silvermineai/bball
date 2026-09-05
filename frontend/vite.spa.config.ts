import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  base: "/basketball/",
  server: {
    port: 3000,
  },
  build: {
    outDir: "dist/basketball",
  },
  plugins: [tsConfigPaths(), viteReact()],
});
