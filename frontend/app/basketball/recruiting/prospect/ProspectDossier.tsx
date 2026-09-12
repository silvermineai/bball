"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  RECRUITING_SHORTLIST_STORAGE_KEY,
  recruitingShortlistKey,
  readRecruitingShortlist,
  toggleRecruitingShortlist,
  type RecruitingShortlistEntry,
} from "../../../_lib/recruiting-shortlist";

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
type RankHistoryEntry = {
  edition: string;
  captured_at: string;
  rank: number | null;
  grade: number | null;
  status: string | null;
  committed_team_id: string | null;
  committed_team_name: string | null;
  source_url: string;
};
type Response = { season: number; rows: Prospect[]; captured_at: string | null; history?: RankHistoryEntry[]; source?: { provider: string; methodology: string }; unavailable_reason?: string };

const number = (value: number | null, digits = 0) => value == null ? "—" : value.toFixed(digits);
const rank = (value: number | null) => value == null ? "—" : `#${number(value)}`;
const movement = (current: number | null, previous: number | null, previousCapturedAt?: string | null) => {
  if (current == null || previous == null) return previousCapturedAt ? { change: null, label: "Rank unavailable" } : null;
  const change = previous - current;
  return { change, label: change > 0 ? `▲ ${change}` : change < 0 ? `▼ ${Math.abs(change)}` : "= 0" };
};

export default function ProspectPage() {
  const params = useSearchParams();
  const season = /^\d{4}$/.test(params.get("season") || "") ? params.get("season")! : "2027";
  const athleteId = /^\d{1,15}$/.test(params.get("id") || "") ? params.get("id")! : "";
  const [prospect, setProspect] = useState<Prospect | null>(null);
  const [history, setHistory] = useState<RankHistoryEntry[]>([]);
  const [source, setSource] = useState<Response["source"]>();
  const [shortlist, setShortlist] = useState<RecruitingShortlistEntry[]>([]);
  const [error, setError] = useState(athleteId ? "" : "This prospect link is missing an ESPN athlete ID.");

  useEffect(() => {
    setShortlist(readRecruitingShortlist(window.localStorage.getItem(RECRUITING_SHORTLIST_STORAGE_KEY)));
  }, []);

  useEffect(() => {
    if (!athleteId) return;
    const controller = new AbortController();
    setError("");
    fetch(`/api/basketball/research/recruiting-rankings?season=${season}&athlete_id=${athleteId}&history=1&page=0`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("The ESPN prospect release is unavailable.");
        return response.json() as Promise<Response>;
      })
      .then((value) => {
        if (controller.signal.aborted) return;
        setSource(value.source);
        setHistory(value.history || []);
        if (value.unavailable_reason) setError(value.unavailable_reason);
        else if (!value.rows.length) setError("That ESPN prospect is not in the selected class release.");
        else setProspect(value.rows[0]);
      })
      .catch((reason: unknown) => {
        if ((reason as { name?: string })?.name !== "AbortError" && !controller.signal.aborted) setError(reason instanceof Error ? reason.message : "The ESPN prospect release is unavailable.");
      });
    return () => controller.abort();
  }, [athleteId, season]);

  const shortlistKey = prospect ? recruitingShortlistKey(season, prospect.athlete_id) : "";
  const isShortlisted = Boolean(shortlistKey && shortlist.some((entry) => entry.key === shortlistKey));
  const toggleProspectShortlist = () => {
    if (!prospect) return;
    const entry: RecruitingShortlistEntry = {
      key: recruitingShortlistKey(season, prospect.athlete_id),
      season,
      athlete_id: prospect.athlete_id,
      name: prospect.name,
      position: prospect.position,
      rank: prospect.rank,
      grade: prospect.grade,
      committed_team_id: prospect.committed_team_id,
      committed_team_name: prospect.committed_team_name,
      high_school: prospect.high_school,
      source_url: prospect.source_url,
    };
    const next = toggleRecruitingShortlist(shortlist, entry);
    setShortlist(next);
    try {
      window.localStorage.setItem(RECRUITING_SHORTLIST_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // A private browsing context may reject local storage; keep the in-memory state visible.
    }
  };

  return (
    <>
      <div className="page-title">
        <div className="eyebrow">ESPN recruiting source dossier / {season} class</div>
        <h1>{prospect?.name || "Prospect dossier"}.</h1>
        <p>Exact ESPN athlete record for research handoff. Source rank, grade, commitment and biographical fields remain attributed evidence; they do not establish eligibility, roster status or future role.</p>
        <div className="hero-actions"><Link className="button secondary" href={`/basketball/recruiting/?season=${season}`}>Back to recruiting board</Link>{prospect && <button className="button" type="button" onClick={toggleProspectShortlist} aria-pressed={isShortlisted}>{isShortlisted ? "Saved to shortlist" : "Save to shortlist"}</button>}{prospect?.source_url && <a className="hero-link" href={prospect.source_url} target="_blank" rel="noreferrer">Open ESPN prospect card ↗</a>}</div>
      </div>
      {error ? <p className="status-error" role="alert">{error}</p> : !prospect ? <p className="empty" role="status">Loading exact ESPN prospect record…</p> : (
        <>
          {(() => {
            const rankMovement = movement(prospect.rank, prospect.previous_rank ?? null, prospect.previous_captured_at);
            return <section className="paper-panel" aria-label="Prospect rank movement" style={{ marginBottom: 24 }}>
              <div className="eyebrow">Release-to-release movement</div>
              <h2 style={{ marginTop: 12 }}>{rankMovement ? <span className={rankMovement.change == null ? "" : rankMovement.change > 0 ? "movement-up" : rankMovement.change < 0 ? "movement-down" : ""}>{rankMovement.label}{rankMovement.change == null ? "" : " national rank"}</span> : "First retained ESPN release"}</h2>
              <p className="note">{rankMovement ? `Previous source rank ${rank(prospect.previous_rank ?? null)} · captured ${prospect.previous_captured_at ? new Date(prospect.previous_captured_at).toLocaleDateString() : "date unavailable"}.` : "No earlier ESPN edition for this exact athlete ID is retained yet. Future source releases will establish the comparison baseline."}</p>
            </section>;
          })()}
          {history.length > 1 && <section className="paper-panel" aria-label="Prospect rank history" style={{ marginBottom: 24 }}>
            <div className="section-heading" style={{ marginBottom: 12 }}>
              <div><div className="eyebrow">Retained ESPN editions</div><h2>See the rank over time.</h2></div>
              <span className="note">{history.length} source captures</span>
            </div>
            <p className="note">This timeline uses every retained source edition for the exact ESPN athlete ID. A blank rank means ESPN did not supply a rank in that capture; it is not a zero or a demotion.</p>
            <div className="table-scroll"><table className="data-table"><thead><tr><th>Captured</th><th className="numeric">National rank</th><th className="numeric">Change</th><th className="numeric">Grade</th><th>Commitment / status</th><th>Source</th></tr></thead><tbody>{history.map((entry, index) => {
              const prior = history[index - 1];
              const change = prior?.rank != null && entry.rank != null ? prior.rank - entry.rank : null;
              return <tr key={`${entry.edition}-${entry.captured_at}`}><td>{entry.captured_at ? new Date(entry.captured_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "—"}<small>{entry.edition}</small></td><td className="numeric"><strong>{rank(entry.rank)}</strong></td><td className={`numeric${change == null ? "" : change > 0 ? " movement-up" : change < 0 ? " movement-down" : ""}`}>{change == null ? "—" : change > 0 ? `▲ ${change}` : change < 0 ? `▼ ${Math.abs(change)}` : "= 0"}</td><td className="numeric">{entry.grade == null || entry.grade <= 0 ? "—" : number(entry.grade, 1)}</td><td>{entry.committed_team_name || entry.status || "—"}</td><td>{entry.source_url ? <a className="text-link" href={entry.source_url} target="_blank" rel="noreferrer">ESPN ↗</a> : "—"}</td></tr>;
            })}</tbody></table></div>
          </section>}
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
