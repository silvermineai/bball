import { cp, mkdir, rm } from "node:fs/promises";
await rm("dist/client", { recursive: true, force: true });
await mkdir("dist/client", { recursive: true });
await cp("out", "dist/client", { recursive: true });
await mkdir("dist/client/basketball-shell", { recursive: true });
await cp(
  "dist/basketball/index.html",
  "dist/client/basketball-shell/index.html",
);
await cp("dist/basketball/assets", "dist/client/basketball/assets", {
  recursive: true,
});
