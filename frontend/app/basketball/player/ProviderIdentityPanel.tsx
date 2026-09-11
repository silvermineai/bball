"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type CrosswalkRow = {
  espn_athlete_id: string;
  fox_athlete_id: string | null;
  fox_player: string | null;
  yahoo_player_id: string | null;
  yahoo_player_name: string | null;
  match_method: string;
  match_confidence: number | null;
};

type Result = { total: number; rows: CrosswalkRow[] };

export default function ProviderIdentityPanel({ id }: { id: string }) {
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setResult(null);
    setError("");
    fetch(`/api/basketball/research/player-crosswalk?espnId=${encodeURIComponent(id)}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Provider identifiers are unavailable.");
        return response.json() as Promise<Result>;
      })
      .then((payload) => { if (!controller.signal.aborted) setResult(payload); })
      .catch((reason: unknown) => { if ((reason as { name?: string })?.name !== "AbortError") setError(reason instanceof Error ? reason.message : "Provider identifiers are unavailable."); });
    return () => controller.abort();
  }, [id]);

  if (error) return <p className="note">{error} <Link href="/basketball/crosswalk/">Open the crosswalk desk →</Link></p>;
  if (!result) return <p className="note" role="status">Checking provider identifier evidence…</p>;
  const row = result.rows[0];
  return (
    <section className="section paper-panel" aria-label="Cross-publisher player identifiers">
      <div className="section-heading">
        <div>
          <div className="eyebrow">Provider identity / 2025–26 source release</div>
          <h2>Carry the exact key across provider files.</h2>
        </div>
        <Link className="hero-link" href={`/basketball/crosswalk/?q=${encodeURIComponent(id)}`}>Open crosswalk desk →</Link>
      </div>
      {!row ? <p className="note">No provider crosswalk row is published for ESPN source ID <code>{id}</code> in this season&apos;s release. Historical absence is not an identity or availability claim.</p> : <>
        <div className="strip">
          <div><strong>{row.espn_athlete_id}</strong><span>ESPN athlete ID</span></div>
          <div><strong>{row.fox_athlete_id || "—"}</strong><span>Fox Sports athlete ID</span></div>
          <div><strong>{row.yahoo_player_id || "—"}</strong><span>Yahoo player ID</span></div>
          <div><strong>{row.match_confidence == null ? "—" : `${(row.match_confidence * 100).toFixed(0)}%`}</strong><span>Publisher match confidence</span></div>
        </div>
        <p className="note">Publisher method: {row.match_method.replaceAll("_", " ")}. Provider names are retained as reported{row.fox_player || row.yahoo_player_name ? ` (${[row.fox_player, row.yahoo_player_name].filter(Boolean).join(" · ")})` : ""}; they are navigation evidence, not an NCAA ID join or eligibility determination.</p>
      </>}
    </section>
  );
}

