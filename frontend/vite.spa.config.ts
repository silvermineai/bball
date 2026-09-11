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
  // The compatibility shell reads the canonical `/data` assets served by
  // the Next.js export. Copying `public/` here duplicates the full research
  // warehouse into the temporary Vite output, even though combine-builds
  // only publishes this shell's HTML and JavaScript assets.
  publicDir: false,
  plugins: [tsConfigPaths(), viteReact()],
});
