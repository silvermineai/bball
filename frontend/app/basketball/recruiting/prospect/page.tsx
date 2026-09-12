import { Suspense } from "react";
import ProspectDossier from "./ProspectDossier";

export const metadata = {
  title: "ESPN prospect dossier | Silvermine basketball recruiting",
  description: "Exact-ID, source-attributed ESPN recruiting prospect research dossier.",
};

export default function Page() {
  return (
    <Suspense fallback={<p className="empty" role="status">Loading prospect dossier…</p>}>
      <ProspectDossier />
    </Suspense>
  );
}
