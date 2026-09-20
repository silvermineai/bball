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
import { prospectSchools, type ProspectProgram } from "../../../_lib/prospect-schools";
import { commitmentTransitions, type RecruitingHistoryEntry } from "./commitment-history";
import { prospectClassContext, type ProspectClassContextPayload } from "./class-context";
import { prospectPeerContext, type ProspectPeerContextPayload } from "./peer-context";
import { prospectLearningChecks } from "./learning-questions";
import { recordedProspectFields } from "./recorded-fields";

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
  school_ids?: string[];
};
type PublisherMention = {
  id: string;
  publisher: string;
  headline: string;
  description?: string;
  published: string;
  link: string;
  division?: string;
};
type Response = { season: number; rows: Prospect[]; edition?: string | null; captured_at: string | null; history?: RecruitingHistoryEntry[]; class_context?: ProspectClassContextPayload; peer_context?: ProspectPeerContextPayload; source?: { provider: string; methodology: string }; unavailable_reason?: string };

const number = (value: number | null, digits = 0) => value == null ? "—" : value.toFixed(digits);
const rank = (value: number | null) => value == null ? "—" : `#${number(value)}`;
const movement = (current: number | null, previous: number | null, previousCapturedAt?: string | null) => {
  if (current == null || previous == null) return previousCapturedAt ? { change: null, label: "Rank unavailable" } : null;
  const change = previous - current;
  return { change, label: change > 0 ? `▲ ${change}` : change < 0 ? `▼ ${Math.abs(change)}` : "= 0" };
};

export default function ProspectPage({ programs }: { programs: ProspectProgram[] }) {
  const params = useSearchParams();
  const season = /^\d{4}$/.test(params.get("season") || "") ? params.get("season")! : "2027";
  const athleteId = /^\d{1,15}$/.test(params.get("id") || "") ? params.get("id")! : "";
  const [prospect, setProspect] = useState<Prospect | null>(null);
  const [history, setHistory] = useState<RecruitingHistoryEntry[]>([]);
  const [source, setSource] = useState<Response["source"]>();
  const [edition, setEdition] = useState<string | null>(null);
  const [classContextPayload, setClassContextPayload] = useState<ProspectClassContextPayload | null>(null);
  const [peerContextPayload, setPeerContextPayload] = useState<ProspectPeerContextPayload | null>(null);
  const [shortlist, setShortlist] = useState<RecruitingShortlistEntry[]>([]);
  const [mentions, setMentions] = useState<PublisherMention[]>([]);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionStatus, setMentionStatus] = useState<"idle" | "loading" | "live" | "none" | "unavailable">("idle");
  const [error, setError] = useState(athleteId ? "" : "This prospect link is missing an athlete ID.");

  useEffect(() => {
    setShortlist(readRecruitingShortlist(window.localStorage.getItem(RECRUITING_SHORTLIST_STORAGE_KEY)));
  }, []);

  useEffect(() => {
    if (!athleteId) return;
    const controller = new AbortController();
    setError("");
    setProspect(null);
    setHistory([]);
    setEdition(null);
    setClassContextPayload(null);
    setPeerContextPayload(null);
    fetch(`/api/basketball/research/recruiting-rankings?season=${season}&athlete_id=${athleteId}&history=1&page=0`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("The prospect record is unavailable.");
        return response.json() as Promise<Response>;
      })
      .then((value) => {
        if (controller.signal.aborted) return;
        setSource(value.source);
        setEdition(value.edition || null);
        setClassContextPayload(value.class_context || null);
        setPeerContextPayload(value.peer_context || null);
        setHistory(value.history || []);
        if (value.unavailable_reason) setError(value.unavailable_reason);
        else if (!value.rows.length) setError("That prospect is not in the selected class edition.");
        else setProspect(value.rows[0]);
      })
      .catch((reason: unknown) => {
        if ((reason as { name?: string })?.name !== "AbortError" && !controller.signal.aborted) setError(reason instanceof Error ? reason.message : "The prospect record is unavailable.");
      });
    return () => controller.abort();
  }, [athleteId, season]);

  useEffect(() => {
    if (!prospect) return;
    const controller = new AbortController();
    const queries = [prospect.name, prospect.committed_team_name || ""]
      .map((value) => value.trim())
      .filter((value, index, values) => value && values.indexOf(value) === index);
    setMentions([]);
    setMentionQuery(queries[0] || "");
    setMentionStatus(queries.length ? "loading" : "none");
    const load = async () => {
      for (const query of queries) {
        const response = await fetch(`/api/basketball/research/news?sport=mens-college-basketball&q=${encodeURIComponent(query)}&limit=4&prospect_dossier=1`, { signal: controller.signal });
        if (!response.ok) continue;
        const value = await response.json() as { rows?: PublisherMention[] };
        if (Array.isArray(value.rows) && value.rows.length) {
          if (!controller.signal.aborted) {
            setMentions(value.rows.slice(0, 4));
            setMentionQuery(query);
            setMentionStatus("live");
          }
          return;
        }
      }
      if (!controller.signal.aborted) setMentionStatus("none");
    };
    load().catch(() => {
      if (!controller.signal.aborted) setMentionStatus("unavailable");
    });
    return () => controller.abort();
  }, [prospect]);

  const shortlistKey = prospect ? recruitingShortlistKey(season, prospect.athlete_id) : "";
  const recordedSchools = prospect
    ? prospectSchools(prospect.school_ids, programs, prospect.committed_team_id)
    : [];
  const isShortlisted = Boolean(shortlistKey && shortlist.some((entry) => entry.key === shortlistKey));
  const destinationChanges = commitmentTransitions(history);
  const firstRecordedDestination = history.find((entry) => entry.committed_team_id?.trim());
  const latestHistory = history.at(-1);
  const classContext = prospectClassContext(classContextPayload, prospect?.rank ?? null);
  const peerContext = prospect ? prospectPeerContext(peerContextPayload, {
    season,
    athleteId: prospect.athlete_id,
    edition,
    position: prospect.position,
  }) : null;
  const learningChecks = prospect ? prospectLearningChecks({
    rank: prospect.rank,
    previousRank: prospect.previous_rank ?? null,
    previousCapturedAt: prospect.previous_captured_at,
    committedTeamId: prospect.committed_team_id,
    committedTeamName: prospect.committed_team_name,
    recordedSchoolCount: recordedSchools.length,
    resolvedSchoolCount: recordedSchools.filter((school) => school.resolved).length,
    hasPeerContext: peerContext != null,
  }) : [];
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
      edition,
      captured_at: prospect.captured_at,
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
        <div className="eyebrow">Prospect dossier / {season} class</div>
        <h1>{prospect?.name || "Prospect dossier"}.</h1>
        <p>Exact athlete record for research handoff. Recorded rank, grade, commitment and biographical fields are descriptive evidence; they do not establish eligibility, roster status or future role.</p>
        <div className="hero-actions"><Link className="button secondary" href={`/basketball/recruiting/?season=${season}`}>Back to recruiting board</Link>{prospect?.committed_team_id && <Link className="button secondary" href={`/basketball/recruiting/fit/?team=${encodeURIComponent(prospect.committed_team_id)}`}>Open destination roster fit ↗</Link>}{prospect && <button className="button" type="button" onClick={toggleProspectShortlist} aria-pressed={isShortlisted}>{isShortlisted ? "Saved to shortlist" : "Save to shortlist"}</button>}</div>
      </div>
      {error ? <p className="status-error" role="alert">{error}</p> : !prospect ? <p className="empty" role="status">Loading exact prospect record…</p> : (
        <>
          {(() => {
            const rankMovement = movement(prospect.rank, prospect.previous_rank ?? null, prospect.previous_captured_at);
            return <section className="paper-panel" aria-label="Prospect rank movement" style={{ marginBottom: 24 }}>
              <div className="eyebrow">Edition-to-edition movement</div>
              <h2 style={{ marginTop: 12 }}>{rankMovement ? <span className={rankMovement.change == null ? "" : rankMovement.change > 0 ? "movement-up" : rankMovement.change < 0 ? "movement-down" : ""}>{rankMovement.label}{rankMovement.change == null ? "" : " national rank"}</span> : "First retained edition"}</h2>
              <p className="note">{rankMovement ? `Previous national rank ${rank(prospect.previous_rank ?? null)} · captured ${prospect.previous_captured_at ? new Date(prospect.previous_captured_at).toLocaleDateString() : "date unavailable"}.` : "No earlier edition for this exact athlete ID is retained yet. Future captures will establish the comparison baseline."}</p>
            </section>;
          })()}
          <section className="paper-panel prospect-learning-queue" aria-label="Prospect learning queue" style={{ marginBottom: 24 }}>
            <div className="section-heading" style={{ marginBottom: 12 }}>
              <div><div className="eyebrow">Staff learning queue / exact athlete ID</div><h2>What to verify next.</h2></div>
              <span className="note">Retained evidence only</span>
            </div>
            <p className="note">These checks organize the selected prospect&apos;s retained rank, destination, school-list and peer fields. They are review prompts, not a recruiting grade, offer or eligibility conclusion.</p>
            <div className="prospect-learning-grid">
              {learningChecks.map((check) => <article className={`prospect-learning-card is-${check.status}`} key={check.key}>
                <span className="eyebrow">{check.status === "recorded" ? "Recorded" : "Unavailable"}</span>
                <strong>{check.label}</strong>
                <small>{check.detail}</small>
                {check.key === "fit" && prospect.committed_team_id ? <Link href={`/basketball/recruiting/fit/?team=${encodeURIComponent(prospect.committed_team_id)}`}>Open exact roster fit →</Link> : null}
                {check.key === "school-list" && recordedSchools.length ? <Link href="#recorded-schools">Inspect retained school IDs →</Link> : null}
              </article>)}
            </div>
          </section>
          <section className="paper-panel" aria-label="Prospect class context" style={{ marginBottom: 24 }}>
            <div className="section-heading" style={{ marginBottom: 12 }}>
              <div><div className="eyebrow">Class denominator / same retained edition</div><h2>{classContext?.nationalRank ? `#${classContext.nationalRank} of ${classContext.ranked.toLocaleString()} ranked` : "Rank denominator unavailable"}</h2></div>
              <span className="note">{classContext ? `${classContext.total.toLocaleString()} class rows` : "Unavailable"}</span>
            </div>
            {classContext ? <>
              <div className="raw-stat-grid">
                <div><dt>National rank</dt><dd>{classContext.nationalRank == null ? "—" : `#${classContext.nationalRank}`}</dd></div>
                <div><dt>Rank coverage</dt><dd>{classContext.ranked.toLocaleString()} / {classContext.total.toLocaleString()}<small>{(classContext.rankCoverage! * 100).toFixed(1)}%</small></dd></div>
                <div><dt>Grade coverage</dt><dd>{classContext.graded.toLocaleString()} / {classContext.total.toLocaleString()}<small>{(classContext.gradeCoverage! * 100).toFixed(1)}%</small></dd></div>
                <div><dt>Recorded commitments</dt><dd>{classContext.committed.toLocaleString()} / {classContext.total.toLocaleString()}<small>{(classContext.commitmentRate! * 100).toFixed(1)}%</small></dd></div>
              </div>
              <p className="note" style={{ marginTop: 12 }}>The denominator is the complete unfiltered class in this exact edition. Ranked, graded and committed counts describe recorded coverage; they are not scouting grades or enrollment claims. Edition <span className="source-hash">{edition}</span>.</p>
            </> : <p className="empty">A valid unfiltered class denominator is not attached to this exact prospect response. The recorded rank remains visible without an inferred cohort size.</p>}
          </section>
          <section className="paper-panel" aria-label="Prospect position peer context" style={{ marginBottom: 24 }}>
            <div className="section-heading" style={{ marginBottom: 12 }}>
              <div><div className="eyebrow">Position peers / same retained edition</div><h2>{peerContext ? `${peerContext.position} measurements in context.` : "Position peer context unavailable"}</h2></div>
              <span className="note">{peerContext ? `${peerContext.peers.toLocaleString()} exact-position rows` : "Withheld"}</span>
            </div>
            {peerContext ? <>
              <div className="raw-stat-grid">
                <div><dt>Position cohort</dt><dd>{peerContext.peers.toLocaleString()}<small>{peerContext.position} rows</small></dd></div>
                <div><dt>Position-rank coverage</dt><dd>{peerContext.positionRanked.toLocaleString()} / {peerContext.peers.toLocaleString()}<small>{((peerContext.positionRanked / peerContext.peers) * 100).toFixed(1)}% recorded</small></dd></div>
                <div><dt>Listed height</dt><dd>{peerContext.height ? `${Math.floor(peerContext.height.value / 12)}′ ${peerContext.height.value % 12}″` : "—"}<small>{peerContext.height ? `${peerContext.height.percentile.toFixed(0)}th percentile · n=${peerContext.height.recorded}` : "Valid comparison unavailable"}</small></dd></div>
                <div><dt>Position average height</dt><dd>{peerContext.height ? `${Math.floor(peerContext.height.average / 12)}′ ${(peerContext.height.average % 12).toFixed(1)}″` : "—"}<small>{peerContext.height ? `${peerContext.height.below} shorter · ${peerContext.height.equal} same listed height` : "Valid comparison unavailable"}</small></dd></div>
                <div><dt>Listed weight</dt><dd>{peerContext.weight ? `${peerContext.weight.value.toFixed(0)} lb` : "—"}<small>{peerContext.weight ? `${peerContext.weight.percentile.toFixed(0)}th percentile · n=${peerContext.weight.recorded}` : "Valid comparison unavailable"}</small></dd></div>
                <div><dt>Position average weight</dt><dd>{peerContext.weight ? `${peerContext.weight.average.toFixed(1)} lb` : "—"}<small>{peerContext.weight ? `${peerContext.weight.below} lighter · ${peerContext.weight.equal} same listed weight` : "Valid comparison unavailable"}</small></dd></div>
              </div>
              <p className="note" style={{ marginTop: 12 }}>Percentiles use the midpoint of equal listed measurements among {peerContext.position} prospects in edition <span className="source-hash">{edition}</span>. They describe recorded size, not skill, physical development, role or projection. Missing measurements stay unavailable.</p>
            </> : <p className="empty">The exact athlete, position and recruiting edition do not share a valid peer cohort, so no size comparison is shown.</p>}
          </section>
          <section className="paper-panel" aria-label="Prospect commitment history" style={{ marginBottom: 24 }}>
            <div className="section-heading" style={{ marginBottom: 12 }}>
              <div><div className="eyebrow">Destination history / exact athlete ID</div><h2>{latestHistory?.committed_team_name || prospect.committed_team_name || "No destination recorded"}</h2></div>
              <span className="note">{destinationChanges.length} observed change{destinationChanges.length === 1 ? "" : "s"}</span>
            </div>
            <p className="note">Changes appear only when two adjacent retained editions differ. They describe the stored captures; they do not establish when an announcement, offer, signing or eligibility decision occurred.</p>
            <dl className="roster-stat-grid" style={{ marginTop: 16 }}>
              <div><dt>Current recorded status</dt><dd>{latestHistory?.status || prospect.status || "—"}</dd></div>
              <div><dt>First retained destination</dt><dd>{firstRecordedDestination?.committed_team_name || firstRecordedDestination?.committed_team_id || "—"}</dd></div>
              <div><dt>First seen</dt><dd>{firstRecordedDestination?.captured_at ? new Date(firstRecordedDestination.captured_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "—"}</dd></div>
              <div><dt>Retained captures</dt><dd>{history.length || "—"}</dd></div>
            </dl>
            {destinationChanges.length ? <div className="table-scroll" style={{ marginTop: 16 }}><table className="data-table"><thead><tr><th>Captured</th><th>Observed change</th><th>Recorded destination / status</th><th>Edition provenance</th></tr></thead><tbody>{destinationChanges.map((change) => {
              const label = change.kind === "destination_recorded" ? "Destination recorded" : change.kind === "destination_changed" ? "Destination changed" : change.kind === "destination_cleared" ? "Destination no longer recorded" : "Status changed";
              const value = change.committed_team_name || change.committed_team_id || change.status || "—";
              return <tr key={`${change.previous_edition}-${change.edition}`}><td>{new Date(change.captured_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}</td><td><strong>{label}</strong>{change.kind === "destination_changed" && <small>From {change.previous_team_name || change.previous_team_id || "—"}</small>}{change.kind === "status_changed" && <small>From {change.previous_status || "—"}</small>}</td><td>{value}</td><td><small>From <span className="source-hash">{change.previous_edition}</span></small><small>To <span className="source-hash">{change.edition}</span></small></td></tr>;
            })}</tbody></table></div> : <p className="empty" style={{ marginTop: 16 }}>No destination or status change is observable between the retained captures for this exact athlete ID.</p>}
          </section>
          {history.length > 1 && <section className="paper-panel" aria-label="Prospect rank history" style={{ marginBottom: 24 }}>
            <div className="section-heading" style={{ marginBottom: 12 }}>
              <div><div className="eyebrow">Retained editions</div><h2>See the rank over time.</h2></div>
              <span className="note">{history.length} captures</span>
            </div>
            <p className="note">This timeline uses every retained edition for the exact athlete ID. A blank rank means no rank was recorded in that capture; it is not a zero or a demotion.</p>
            {(() => {
              const ranked = history.map((entry) => entry.rank).filter((value): value is number => value != null && Number.isFinite(value) && value > 0);
              const ceiling = Math.max(...ranked, 25);
              return <figure className="prospect-rank-chart" aria-label="Visual timeline of national rank">
                <div className="prospect-rank-chart-bars">
                  {history.map((entry) => {
                    const height = entry.rank == null ? 8 : Math.max(10, Math.round(((ceiling - entry.rank + 1) / ceiling) * 100));
                    return <div className={`prospect-rank-bar${entry.rank == null ? " is-unranked" : ""}`} key={`chart-${entry.edition}-${entry.captured_at}`}>
                      <div className="prospect-rank-bar-value">{rank(entry.rank)}</div>
                      <div className="prospect-rank-bar-track"><span style={{ height: `${height}%` }} /></div>
                      <div className="prospect-rank-bar-date">{entry.captured_at ? new Date(entry.captured_at).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" }) : "—"}</div>
                    </div>;
                  })}
                </div>
                <figcaption>Higher bars represent a better national rank within this retained history. Unranked captures remain visible at the baseline.</figcaption>
              </figure>;
            })()}
            <div className="table-scroll"><table className="data-table"><thead><tr><th>Captured</th><th className="numeric">National rank</th><th className="numeric">Change</th><th className="numeric">Grade</th><th>Commitment / status</th><th>Capture</th></tr></thead><tbody>{history.map((entry, index) => {
              const prior = history[index - 1];
              const change = prior?.rank != null && entry.rank != null ? prior.rank - entry.rank : null;
              return <tr key={`${entry.edition}-${entry.captured_at}`}><td>{entry.captured_at ? new Date(entry.captured_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "—"}<small>{entry.edition}</small></td><td className="numeric"><strong>{rank(entry.rank)}</strong></td><td className={`numeric${change == null ? "" : change > 0 ? " movement-up" : change < 0 ? " movement-down" : ""}`}>{change == null ? "—" : change > 0 ? `▲ ${change}` : change < 0 ? `▼ ${Math.abs(change)}` : "= 0"}</td><td className="numeric">{entry.grade == null || entry.grade <= 0 ? "—" : number(entry.grade, 1)}</td><td>{entry.committed_team_name || entry.status || "—"}</td><td><small>{entry.captured_at ? new Date(entry.captured_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "Capture date unavailable"}</small><small className="source-hash">{entry.edition}</small></td></tr>;
            })}</tbody></table></div>
          </section>}
          <div className="strip">
            <div><strong>{rank(prospect.rank)}</strong><span>National rank</span></div>
            <div><strong>{prospect.grade == null || prospect.grade <= 0 ? "—" : number(prospect.grade, 1)}</strong><span>Recorded grade</span></div>
            <div><strong>{rank(prospect.position_rank)}</strong><span>{prospect.position || "Position"} rank</span></div>
            <div><strong>{prospect.committed_team_name ? prospect.committed_team_id ? <Link href={`/basketball/programs/${encodeURIComponent(prospect.committed_team_id)}/`}>{prospect.committed_team_name} →</Link> : prospect.committed_team_name : "—"}</strong><span>Committed team</span></div>
          </div>
          <section className="section">
            <div className="two-col">
              <article className="paper-panel"><div className="eyebrow">Player profile</div><h2>{prospect.position || "Position not listed"}</h2><dl className="roster-stat-grid"><div><dt>High school</dt><dd>{prospect.high_school || "—"}</dd></div><div><dt>Hometown</dt><dd>{prospect.hometown || "—"}</dd></div><div><dt>Status</dt><dd>{prospect.status || "—"}</dd></div><div><dt>State rank</dt><dd>{rank(prospect.state_rank)}</dd></div><div><dt>Region rank</dt><dd>{rank(prospect.region_rank)}</dd></div><div><dt>Height</dt><dd>{prospect.height_inches == null ? "—" : `${number(prospect.height_inches / 12, 1)} ft`}</dd></div><div><dt>Weight</dt><dd>{prospect.weight_pounds == null ? "—" : `${number(prospect.weight_pounds)} lb`}</dd></div><div><dt>Athlete ID</dt><dd>{prospect.athlete_id}</dd></div></dl></article>
              <article className="paper-panel"><div className="eyebrow">How to read this</div><h2>Evidence before inference.</h2><p>Rank, grade and commitment fields are recorded values.</p><p className="note">Captured {prospect.captured_at ? new Date(prospect.captured_at).toLocaleString() : "—"}. A commitment description is not a verified transfer, roster or eligibility determination.</p>{prospect.committed_team_id && <p className="note"><Link href={`/basketball/recruiting/fit/?team=${encodeURIComponent(prospect.committed_team_id)}`}>Compare that program&apos;s role workload and prior production →</Link></p>}<small className="note">Edition {edition || "unavailable"} · Athlete ID {prospect.athlete_id}</small></article>
            </div>
          </section>
          <section className="section paper-panel" aria-labelledby="prospect-recorded-fields">
            <div className="section-heading" style={{ marginBottom: 12 }}>
              <div><div className="eyebrow">Raw record / exact retained fields</div><h2 id="prospect-recorded-fields">Inspect the recorded prospect row.</h2></div>
              <span className="note">No inferred values</span>
            </div>
            <p className="note">This table exposes the fields returned for this exact athlete ID and edition. “Unavailable” means the retained row did not provide a usable value; it is not a zero, ranking assumption or eligibility conclusion.</p>
            <div className="table-scroll"><table className="data-table"><thead><tr><th>Field</th><th>Recorded value</th></tr></thead><tbody>{recordedProspectFields(prospect).map((field) => <tr key={field.key}><th scope="row">{field.label}</th><td><code>{field.value}</code></td></tr>)}</tbody></table></div>
          </section>
          <section className="section paper-panel" id="recorded-schools" aria-labelledby="recorded-schools-title">
            <div className="section-heading" style={{ marginBottom: 12 }}>
              <div><div className="eyebrow">School list / retained prospect row</div><h2 id="recorded-schools-title">Programs attached to this record.</h2></div>
              <span className="note">{recordedSchools.length ? `${recordedSchools.length} recorded` : "No schools recorded"}</span>
            </div>
            <p className="note">This reproduces the school IDs stored with this exact prospect capture. A listed school does not by itself establish an offer, active interest, a visit or a commitment. Only the separately recorded commitment field receives that label.</p>
            {recordedSchools.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>Program</th><th>Status in this record</th><th>Program research</th></tr></thead><tbody>{recordedSchools.map((school) => <tr key={school.id}><th scope="row">{school.resolved ? <Link href={`/basketball/programs/${encodeURIComponent(school.id)}/`}>{school.name}</Link> : school.name}<small>Program ID {school.id}</small></th><td>{school.committed ? <strong>Recorded commitment</strong> : "Listed school"}</td><td>{school.resolved ? <><Link href={`/basketball/programs/${encodeURIComponent(school.id)}/`}>Open dossier →</Link><small><Link href={`/basketball/recruiting/fit/?team=${encodeURIComponent(school.id)}`}>Inspect roster fit →</Link></small></> : <span className="note">Program directory match unavailable</span>}</td></tr>)}</tbody></table></div> : <p className="empty">This retained prospect row contains no school IDs. Missing school evidence remains unavailable.</p>}
          </section>
          <section className="section paper-panel" aria-labelledby="prospect-publisher-mentions">
            <div className="section-heading" style={{ marginBottom: 12 }}>
              <div><div className="eyebrow">Context mentions / literal search</div><h2 id="prospect-publisher-mentions">Keep the reporting context close.</h2></div>
              <span className="note">Retained headlines</span>
            </div>
            <p className="note">This is a literal headline search for the prospect name, then the recorded destination when needed. A mention is context; it is not an identity match, transaction record, availability ruling or eligibility evidence.</p>
            {mentionStatus === "loading" && <p className="empty" role="status">Checking retained headlines…</p>}
            {mentionStatus === "unavailable" && <p className="empty" role="status">Headline search is temporarily unavailable. Open the news archive to search again.</p>}
            {mentionStatus === "none" && <p className="empty" role="status">No retained headline matched this prospect or recorded destination.</p>}
            {mentions.length > 0 && <>
              <p className="note" role="status">Showing {mentions.length} retained headline{mentions.length === 1 ? "" : "s"} for “{mentionQuery}”.</p>
              <div className="article-grid">
                {mentions.map((mention) => <article className="article-card" key={mention.id}>
                  <div className="eyebrow">{mention.division ? `${mention.division} · ` : ""}{mention.published ? new Date(mention.published).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "date unavailable"}</div>
                  <h3>{mention.headline}</h3>
                  {mention.description && <p>{mention.description}</p>}
                </article>)}
              </div>
            </>}
            <p style={{ marginTop: 12 }}><Link href={`/basketball/news/?q=${encodeURIComponent(prospect.name)}`}>Search the complete news archive →</Link></p>
          </section>
          <section className="section paper-panel" aria-labelledby="prospect-research-handoffs">
            <div className="section-heading" style={{ marginBottom: 12 }}>
              <div><div className="eyebrow">Research handoff / separate namespaces</div><h2 id="prospect-research-handoffs">Trace prior production carefully.</h2></div>
              <span className="note">Searches are leads, not identity joins</span>
            </div>
            <p>Use the exact prospect name as a starting point for the retained game archive, player profile records and identity crosswalk. Confirm the school, season, record ID and biographical context before attaching prior production to this prospect.</p>
            <div className="button-row">
              <Link className="button secondary" href={`/basketball/ncaa-player-box/?season=all&q=${encodeURIComponent(prospect.name)}`}>Search game archive →</Link>
              <Link className="button secondary" href={`/basketball/player-profiles/?season=all&q=${encodeURIComponent(prospect.name)}`}>Search player profiles →</Link>
              <Link className="button secondary" href={`/basketball/crosswalk/?q=${encodeURIComponent(prospect.name)}`}>Check identity crosswalk →</Link>
            </div>
            <p className="note" style={{ marginTop: 12 }}>A matching name alone does not establish that a player row or cross-dataset identifier belongs to this prospect. The site keeps identity namespaces separate until an audited crosswalk exists.</p>
          </section>
        </>
      )}
    </>
  );
}
