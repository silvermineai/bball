import fs from "node:fs";
import path from "node:path";
import { cache } from "react";
import type { Ledger } from "./research-types";
export const getLedger = cache(
  (): Ledger =>
    JSON.parse(
      fs.readFileSync(
        path.join(process.cwd(), "public/data/research/ledger.json"),
        "utf8",
      ),
    ),
);
