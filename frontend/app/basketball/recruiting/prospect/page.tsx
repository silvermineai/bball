import { Suspense } from "react";
import fs from "node:fs";
import path from "node:path";
import ProspectDossier from "./ProspectDossier";
import type { ProspectProgram } from "../../../_lib/prospect-schools";

export const metadata = {
  title: "Prospect dossier | Silvermine basketball recruiting",
  description: "Exact-ID basketball recruiting prospect research dossier with rank history and recorded biographical fields.",
};

export default function Page() {
  const programs = (JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "public/data/teams.json"), "utf8"),
  ) as { teams?: Array<{ id: string | number; name: string; shortName?: string | null }> }).teams
    ?.map((program) => ({
      id: String(program.id),
      name: program.name,
      shortName: program.shortName || null,
    } satisfies ProspectProgram)) || [];
  return (
    <Suspense fallback={<p className="empty" role="status">Loading prospect dossier…</p>}>
      <ProspectDossier programs={programs} />
    </Suspense>
  );
}
