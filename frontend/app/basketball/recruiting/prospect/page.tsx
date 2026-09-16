import { Suspense } from "react";
import ProspectDossier from "./ProspectDossier";

export const metadata = {
  title: "Prospect dossier | Silvermine basketball recruiting",
  description: "Exact-ID basketball recruiting prospect research dossier with rank history and recorded biographical fields.",
};

export default function Page() {
  return (
    <Suspense fallback={<p className="empty" role="status">Loading prospect dossier…</p>}>
      <ProspectDossier />
    </Suspense>
  );
}
