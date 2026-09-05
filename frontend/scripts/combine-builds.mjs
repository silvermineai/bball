import { cp, mkdir, rm } from "node:fs/promises";
await rm("dist/client", { recursive: true, force: true });
await mkdir("dist/client", { recursive: true });
await cp("out", "dist/client", { recursive: true });
await cp("dist/basketball", "dist/client/basketball", { recursive: true });
