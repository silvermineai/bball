"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

type Prospect = {
  athlete_id: string;
  name: string;
  position: string | null;
  grade: number | null;
  rank: number | null;
  position_rank: number | null;
  state_rank: number | null;
  region_rank: number | null;
  status: string | null;
  committed_team_id: string | null;
  committed_team_name: string | null;
  high_school: string | null;
  hometown: string | null;
  height_inches: number | null;
  weight_pounds: number | null;
  captured_at: string;
  source_url: string;
  previous_rank?: number | null;
  previous_captured_at?: string | null;
};
type Response = { season: number; rows: Prospect[]; captured_at: string | null; source?: { provider: string; methodology: string }; unavailable_reason?: string };

const number = (value: number | null, digits = 0) => value == null ? "—" : value.toFixed(digits);
const rank = (value: number | null) => value == null ? "—" : `#${number(value)}`;
const movement = (current: number | null, previous: number | null) => {
  if (current == null || previous == null) return null;
  const change = previous - current;
  return { change, label: change > 0 ? `▲ ${change}` : change < 0 ? `▼ ${Math.abs(change)}` : "= 0" };
};

export default function ProspectPage() {
  const params = useSearchParams();
  const season = /^\d{4}$/.test(params.get("season") || "") ? params.get("season")! : "2027";
  const athleteId = /^\d{1,15}$/.test(params.get("id") || "") ? params.get("id")! : "";
  const [prospect, setProspect] = useState<Prospect | null>(null);
  const [source, setSource] = useState<Response["source"]>();
  const [error, setError] = useState(athleteId ? "" : "This prospect link is missing an ESPN athlete ID.");

  useEffect(() => {
    if (!athleteId) return;
    const controller = new AbortController();
    setError("");
    fetch(`/api/basketball/research/recruiting-rankings?season=${season}&athlete_id=${athleteId}&page=0`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("The ESPN prospect release is unavailable.");
        return response.json() as Promise<Response>;
      })
      .then((value) => {
        if (controller.signal.aborted) return;
        setSource(value.source);
        if (value.unavailable_reason) setError(value.unavailable_reason);
        else if (!value.rows.length) setError("That ESPN prospect is not in the selected class release.");
        else setProspect(value.rows[0]);
      })
      .catch((reason: unknown) => {
        if ((reason as { name?: string })?.name !== "AbortError" && !controller.signal.aborted) setError(reason instanceof Error ? reason.message : "The ESPN prospect release is unavailable.");
      });
    return () => controller.abort();
  }, [athleteId, season]);

  return (
    <>
      <div className="page-title">
        <div className="eyebrow">ESPN recruiting source dossier / {season} class</div>
        <h1>{prospect?.name || "Prospect dossier"}.</h1>
        <p>Exact ESPN athlete record for research handoff. Source rank, grade, commitment and biographical fields remain attributed evidence; they do not establish eligibility, roster status or future role.</p>
        <div className="hero-actions"><Link className="button secondary" href={`/basketball/recruiting/?season=${season}`}>Back to recruiting board</Link>{prospect?.source_url && <a className="hero-link" href={prospect.source_url} target="_blank" rel="noreferrer">Open ESPN prospect card ↗</a>}</div>
      </div>
      {error ? <p className="status-error" role="alert">{error}</p> : !prospect ? <p className="empty" role="status">Loading exact ESPN prospect record…</p> : (
        <>
          {(() => {
            const rankMovement = movement(prospect.rank, prospect.previous_rank ?? null);
            return <section className="paper-panel" aria-label="Prospect rank movement" style={{ marginBottom: 24 }}>
              <div className="eyebrow">Release-to-release movement</div>
              <h2 style={{ marginTop: 12 }}>{rankMovement ? <span className={rankMovement.change > 0 ? "movement-up" : rankMovement.change < 0 ? "movement-down" : ""}>{rankMovement.label} national rank</span> : "First retained ESPN release"}</h2>
              <p className="note">{rankMovement ? `Previous source rank ${rank(prospect.previous_rank ?? null)} · captured ${prospect.previous_captured_at ? new Date(prospect.previous_captured_at).toLocaleDateString() : "date unavailable"}.` : "No earlier ESPN edition for this exact athlete ID is retained yet. Future source releases will establish the comparison baseline."}</p>
            </section>;
          })()}
          <div className="strip">
            <div><strong>{rank(prospect.rank)}</strong><span>National source rank</span></div>
            <div><strong>{prospect.grade == null || prospect.grade <= 0 ? "—" : number(prospect.grade, 1)}</strong><span>ESPN source grade</span></div>
            <div><strong>{rank(prospect.position_rank)}</strong><span>{prospect.position || "Position"} rank</span></div>
            <div><strong>{prospect.committed_team_name ? prospect.committed_team_id ? <Link href={`/basketball/programs/${encodeURIComponent(prospect.committed_team_id)}/`}>{prospect.committed_team_name} →</Link> : prospect.committed_team_name : "—"}</strong><span>Committed team</span></div>
          </div>
          <section className="section">
            <div className="two-col">
              <article className="paper-panel"><div className="eyebrow">Source profile</div><h2>{prospect.position || "Position not listed"}</h2><dl className="roster-stat-grid"><div><dt>High school</dt><dd>{prospect.high_school || "—"}</dd></div><div><dt>Hometown</dt><dd>{prospect.hometown || "—"}</dd></div><div><dt>Status</dt><dd>{prospect.status || "—"}</dd></div><div><dt>State rank</dt><dd>{rank(prospect.state_rank)}</dd></div><div><dt>Region rank</dt><dd>{rank(prospect.region_rank)}</dd></div><div><dt>Height</dt><dd>{prospect.height_inches == null ? "—" : `${number(prospect.height_inches / 12, 1)} ft`}</dd></div><div><dt>Weight</dt><dd>{prospect.weight_pounds == null ? "—" : `${number(prospect.weight_pounds)} lb`}</dd></div><div><dt>ESPN athlete ID</dt><dd>{prospect.athlete_id}</dd></div></dl></article>
              <article className="paper-panel"><div className="eyebrow">How to read this</div><h2>Evidence before inference.</h2><p>{source?.methodology || "ESPN rank, grade and commitment fields are source-reported."}</p><p className="note">Captured {prospect.captured_at ? new Date(prospect.captured_at).toLocaleString() : "—"}. A commitment description is not a verified transfer, roster or NCAA eligibility determination. Use the original ESPN card for the source context.</p><a className="text-link" href={prospect.source_url} target="_blank" rel="noreferrer">Open source record ↗</a></article>
            </div>
          </section>
        </>
      )}
    </>
  );
}
