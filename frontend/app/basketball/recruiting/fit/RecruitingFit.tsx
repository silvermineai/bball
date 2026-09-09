"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useBasketballRelease } from "../../../_components/useBasketballRelease";
import { downloadCsv, toCsv } from "../../../_lib/csv";
import { fmt } from "../../../_lib/format";
import type { BBRosters } from "../../../_lib/basketball-types";
import { buildRecruitingFit, buildRoleSummaries, focusDescriptions, focusLabels, roleLabels, positionRole, type FitFocus, type FitRole, type FitTeam } from "../../../_lib/recruiting-fit";

const focusValueLabels: Record<FitFocus, string> = { creation: "APG", shooting: "TS%", rebounding: "RPG", defense: "SPG", workload: "Minutes" };
const displayRole = (role: FitRole | "unknown") => role === "unknown" ? "Unknown role" : roleLabels[role];
const roleShare = (value: number | null) => value == null ? "—" : `${(value * 100).toFixed(0)}%`;
const shortlistKey = (teamId: string) => `silvermine.recruiting.fit-shortlist:${teamId}`;
const notesKey = (teamId: string) => `silvermine.recruiting.fit-notes:${teamId}`;

function readShortlist(teamId: string): string[] {
  if (!teamId || typeof window === "undefined") return [];
  try {
    const value = JSON.parse(window.localStorage.getItem(shortlistKey(teamId)) || "[]");
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string").slice(0, 5) : [];
  } catch {
    return [];
  }
}

function readNotes(teamId: string): Record<string, string> {
  if (!teamId || typeof window === "undefined") return {};
  try {
    const value = JSON.parse(window.localStorage.getItem(notesKey(teamId)) || "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[0] === "string" && typeof entry[1] === "string").slice(0, 50));
  } catch {
    return {};
  }
}

export default function RecruitingFit({ teams }: { teams: FitTeam[] }) {
  const fallbackTeam = [...teams].sort((a, b) => (a.rank || 999) - (b.rank || 999) || a.name.localeCompare(b.name))[0]?.id || "";
  const [teamId, setTeamId] = useState(fallbackTeam), [role, setRole] = useState<FitRole>("any"), [focus, setFocus] = useState<FitFocus>("creation"), [minimumMinutes, setMinimumMinutes] = useState(400), [query, setQuery] = useState(""), [page, setPage] = useState(0), [picked, setPicked] = useState<string[]>([]), [notes, setNotes] = useState<Record<string, string>>({}), [hydrated, setHydrated] = useState(false), [copied, setCopied] = useState(""), [savedMessage, setSavedMessage] = useState("");
  const { data, error } = useBasketballRelease<BBRosters>("rosters");
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("team") && teams.some((team) => team.id === params.get("team"))) setTeamId(params.get("team")!);
    if (["any", "guard", "wing", "big"].includes(params.get("role") || "")) setRole(params.get("role") as FitRole);
    if (["creation", "shooting", "rebounding", "defense", "workload"].includes(params.get("focus") || "")) setFocus(params.get("focus") as FitFocus);
    if ([200, 400, 800].includes(Number(params.get("min")))) setMinimumMinutes(Number(params.get("min")));
    setQuery(params.get("q") || "");
    const requestedTeam = params.get("team") && teams.some((team) => team.id === params.get("team")) ? params.get("team")! : fallbackTeam;
    const urlPicks = params.getAll("pick").slice(0, 5);
    setPicked(urlPicks.length ? urlPicks : readShortlist(requestedTeam));
    setNotes(readNotes(requestedTeam));
    setHydrated(true);
  }, [fallbackTeam, teams]);
  useEffect(() => {
    if (!hydrated) return;
    const params = new URLSearchParams({ team: teamId, role, focus, min: String(minimumMinutes) });
    if (query) params.set("q", query);
    picked.slice(0, 5).forEach((id) => params.append("pick", id));
    window.history.replaceState(window.history.state, "", `${window.location.pathname}?${params}`);
    try {
      window.localStorage.setItem(shortlistKey(teamId), JSON.stringify(picked.slice(0, 5)));
      window.localStorage.setItem(notesKey(teamId), JSON.stringify(notes));
    } catch {
      // The board remains usable when private browser storage is unavailable.
    }
  }, [focus, hydrated, minimumMinutes, notes, picked, query, role, teamId]);
  const result = useMemo(() => data ? buildRecruitingFit(data.players, { teamId, role, focus, minimumMinutes, query }) : [], [data, focus, minimumMinutes, query, role, teamId]);
  const allCandidates = useMemo(() => data ? buildRecruitingFit(data.players, { teamId, role, focus, minimumMinutes }) : [], [data, focus, minimumMinutes, role, teamId]);
  const summaries = useMemo(() => data ? buildRoleSummaries(data.players, teamId) : [], [data, teamId]);
  const target = teams.find((team) => team.id === teamId);
  const selected = picked.map((id) => result.find((row) => row.player.id === id) || allCandidates.find((row) => row.player.id === id)).filter(Boolean);
  const reset = (fn: () => void) => { fn(); setPage(0); setPicked([]); };
  const changeTeam = (nextTeamId: string) => {
    setTeamId(nextTeamId);
    setPage(0);
    setPicked(readShortlist(nextTeamId));
    setNotes(readNotes(nextTeamId));
    setSavedMessage("Loaded this program's private shortlist.");
  };
  const clearShortlist = () => {
    setPicked([]);
    setSavedMessage("Private shortlist cleared for this program.");
    try { window.localStorage.removeItem(shortlistKey(teamId)); window.localStorage.removeItem(notesKey(teamId)); } catch { /* optional storage */ }
  };
  const share = async () => { try { await navigator.clipboard.writeText(window.location.href); setCopied("Fit board link copied."); } catch { setCopied("Copy the filtered URL from your address bar."); } };
  const csv = () => downloadCsv(`basketball-recruiting-fit-${teamId}.csv`, toCsv(["Rank", "Player", "Source ID", "Current source-listed program", "Current team ID", "Role", "Status", "Class", "Height", "Weight", "Prior programs", "Prior minutes", "Prior MPG", "Prior PPG", "Prior RPG", "Prior APG", "Prior TS%", "Prior eFG%", "Skill percentile", "Workload percentile", "Fit score", "Source URL", "Private note"], result.map((row, index) => [index + 1, row.player.name, row.player.id, row.player.team, row.player.team_id, displayRole(row.role), row.player.status, row.player.class_year, row.player.height, row.player.weight, row.player.previous_teams.join("; "), row.player.prior_production?.minutes, row.player.prior_production?.mpg, row.player.prior_production?.ppg, row.player.prior_production?.rpg, row.player.prior_production?.apg, row.player.prior_production?.ts == null ? null : row.player.prior_production.ts * 100, row.player.prior_production?.efg == null ? null : row.player.prior_production.efg * 100, row.skillPercentile, row.workloadPercentile, row.score, row.player.source_url, notes[row.player.id] || ""])));
  const togglePick = (id: string) => setPicked((current) => current.includes(id) ? current.filter((value) => value !== id) : current.length >= 5 ? current : [...current, id]);
  const updateNote = (id: string, value: string) => setNotes((current) => ({ ...current, [id]: value.slice(0, 500) }));
  return (
    <>
      <section className="board-priorities fit-priorities" aria-label="Recruiting fit controls">
        <div className="section-heading"><div><div className="eyebrow">01 / Set the recruiting brief</div><h2>Choose the room to fill.</h2></div><span className="board-mode">{target?.name || "Choose a program"}</span></div>
        <div className="toolbar board-filters fit-filters">
          <label className="control"><span>PROGRAM</span><select value={teamId} onChange={(event) => changeTeam(event.target.value)}>{teams.slice().sort((a, b) => (a.rank || 999) - (b.rank || 999) || a.name.localeCompare(b.name)).map((team) => <option key={team.id} value={team.id}>{team.rank ? `#${team.rank} ` : ""}{team.name}</option>)}</select></label>
          <label className="control"><span>ROLE</span><select value={role} onChange={(event) => reset(() => setRole(event.target.value as FitRole))}>{Object.entries(roleLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <label className="control"><span>PRIORITY</span><select value={focus} onChange={(event) => reset(() => setFocus(event.target.value as FitFocus))}>{Object.entries(focusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <label className="control"><span>MINIMUM PRIOR MINUTES</span><select value={minimumMinutes} onChange={(event) => reset(() => setMinimumMinutes(Number(event.target.value)))}><option value={200}>200+ minutes</option><option value={400}>400+ minutes</option><option value={800}>800+ minutes</option></select></label>
          <label className="control"><span>PLAYER OR PROGRAM</span><input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} placeholder="Search candidate or school" /></label>
        </div>
        <p className="note">{focusDescriptions[focus]} Candidates are source-listed 2026–27 players outside the selected program with an exact prior production record. Scores combine a 70% priority percentile and 30% prior-minutes percentile among the role and workload sample.</p>
        <div className="button-row" style={{ marginTop: 14 }}><button className="button secondary" type="button" onClick={share}>Copy fit board link</button>{picked.length > 0 && <button className="button secondary" type="button" onClick={clearShortlist}>Clear private shortlist</button>}{copied && <span className="note" role="status">{copied}</span>}{savedMessage && <span className="note" role="status">{savedMessage}</span>}</div>
      </section>
      {error ? <p className="status-error" role="alert">{error}</p> : !data ? <p className="empty" role="status">Loading source-listed roster observations…</p> : (
        <>
          <section className="section" aria-label="Selected program role room">
            <div className="section-heading"><div><div className="eyebrow">02 / Read the selected roster</div><h2>{target?.name || "Program"} role room.</h2></div><span className="note">Source-listed 2026–27 rows · prior season {data.previous_season}</span></div>
            <p className="note">Prior minutes describe the matched source sample. Returning and incoming columns describe source-ID observations; they do not infer departures, transfer transactions, eligibility or future roles.</p>
            <div className="fit-role-grid">{summaries.map((summary) => <article className={`paper-panel ${role === summary.role ? "fit-role-active" : ""}`} key={summary.role}><div className="eyebrow">{roleLabels[summary.role]}</div><strong className="fit-role-number">{summary.listed}</strong><span>listed players</span><dl><div><dt>Prior minutes</dt><dd>{Math.round(summary.priorMinutes).toLocaleString()}</dd></div><div><dt>Returning</dt><dd>{Math.round(summary.returningMinutes).toLocaleString()} <small>{roleShare(summary.returningShare)} of role minutes</small></dd></div><div><dt>Incoming</dt><dd>{Math.round(summary.incomingMinutes).toLocaleString()} <small>{roleShare(summary.incomingShare)} of role minutes</small></dd></div><div><dt>Unclassified</dt><dd>{Math.round(summary.unclassifiedMinutes).toLocaleString()} <small>{roleShare(summary.unclassifiedShare)} of role minutes</small></dd></div></dl><p className="note">{summary.unclassifiedShare != null && summary.unclassifiedShare > 0 ? "Some role workload has no clear movement classification; verify the source record before using the split." : summary.returningShare == null ? "No matched prior workload in this role." : summary.returningShare < 0.5 ? "Thin returning workload; review the role before treating this board as a depth chart." : "Observed role workload has a majority returning share."}</p><p className="note">{summary.topPlayers.length ? summary.topPlayers.map((player) => `${player.name} · ${Math.round(player.prior_production?.minutes || 0).toLocaleString()} min`).join(" · ") : "No matched prior minutes in this role."}</p></article>)}</div>
          </section>
          <section className="section" aria-label="Recruiting candidate results">
            <div className="section-heading"><div><div className="eyebrow">03 / Build the shortlist</div><h2>Source-listed candidates.</h2></div><div className="button-row"><button className="button secondary" type="button" disabled={!result.length} onClick={csv}>Download CSV ↓</button><span className="note">{result.length.toLocaleString()} matching candidates</span></div></div>
            <div className="board-shortlist-summary"><span><strong>{picked.length} of 5 shortlisted</strong>{selected.length > 0 && <small>{selected.map((row) => row!.player.name).join(" · ")}</small>}</span><span className="note">Private shortlist saves in this browser · ranked by transparent fit score</span></div>
            <div className="table-scroll"><table className="data-table board-results fit-results"><thead><tr><th>Fit rank</th><th>Player / current source listing</th><th>Fit score</th><th>Role / status</th><th>Prior production</th><th>Priority value</th><th>Evidence</th></tr></thead><tbody>{result.slice(page * 25, page * 25 + 25).map((row, index) => { const pickedRow = picked.includes(row.player.id); return <tr key={row.player.id}><td className="rank-number">{page * 25 + index + 1}</td><th scope="row"><Link href={`/basketball/player/?id=${encodeURIComponent(row.player.id)}&season=${data.previous_season}`}>{row.player.name}</Link><small>{row.player.team} · {row.player.previous_teams.join(", ") || "No prior program listed"}</small></th><td><strong className="board-score">{fmt(row.score, 1)}</strong><small>{fmt(row.skillPercentile, 1)} skill · {fmt(row.workloadPercentile, 1)} workload percentile</small></td><td>{displayRole(row.role)}<small>{row.player.status.replaceAll("_", " ")}</small></td><td><strong>{fmt(row.player.prior_production?.mpg)} MPG</strong><small>{Math.round(row.player.prior_production?.minutes || 0).toLocaleString()} min · {row.player.prior_production?.games || 0} GP</small></td><td>{focusValueLabels[focus] === "TS%" ? row.primaryValue == null ? "—" : `${fmt(row.primaryValue * 100)}%` : fmt(row.primaryValue)}<small>{focusValueLabels[focus]}</small></td><td><button className="board-pick" type="button" aria-pressed={pickedRow} onClick={() => togglePick(row.player.id)}>{pickedRow ? "Remove from shortlist" : "Add to shortlist"}</button>{row.player.source_url && <><br /><a className="text-link" href={row.player.source_url} target="_blank" rel="noreferrer">Roster source ↗</a></>}</td></tr>; })}</tbody></table></div>
            {!result.length && <p className="empty">No candidates match this role, workload and search.</p>}
            <div className="pagination"><span>Page {page + 1} of {Math.max(1, Math.ceil(result.length / 25))}</span><div><button className="button secondary" disabled={!page} onClick={() => setPage(page - 1)}>← Previous</button><button className="button secondary" disabled={(page + 1) * 25 >= result.length} onClick={() => setPage(page + 1)}>Next →</button></div></div>
          </section>
          <section className="board-shortlist" id="fit-shortlist"><div><div className="eyebrow">04 / Review the evidence</div><h2>Shortlist with the caveats attached.</h2><p>Open each source identity, inspect the prior game log and verify the dated recruiting record before treating a candidate as actionable. The score only organizes observed production; it does not predict a new team’s fit.</p><Link className="button" href="/basketball/recruiting/">Open recruiting evidence ↗</Link></div><div>{selected.length ? selected.map((row) => <div className="board-selection" key={row!.player.id}><span><strong>{row!.player.name}</strong><small>{row!.player.team} · {displayRole(positionRole(row!.player.position))} · {fmt(row!.score, 1)} fit</small><textarea className="board-note" aria-label={`Private note for ${row!.player.name}`} maxLength={500} value={notes[row!.player.id] || ""} onChange={(event) => updateNote(row!.player.id, event.target.value)} placeholder="Private note for the next review…" /></span><button className="hero-link" type="button" onClick={() => togglePick(row!.player.id)}>Remove</button></div>) : <p className="note">Add up to five candidates from the board to keep a working list while you open the evidence.</p>}</div></section>
          {selected.length > 0 && <section className="section" aria-label="Shortlist comparison">
            <div className="section-heading"><div><div className="eyebrow">Shortlist comparison / prior source production</div><h2>Put the candidates side by side.</h2></div><span className="note">Observed prior season · exact source IDs</span></div>
            <p className="note">These columns compare the same retained prior-season fields used by the fit board. Missing values remain unavailable; none predicts a new-school role or establishes eligibility.</p>
            <div className="table-scroll"><table className="data-table"><thead><tr><th>Candidate / evidence</th><th>Role / status</th><th className="numeric">Fit</th><th className="numeric">MPG</th><th className="numeric">PPG</th><th className="numeric">RPG</th><th className="numeric">APG</th><th className="numeric">TS%</th><th className="numeric">eFG%</th><th className="numeric">Box BPM</th></tr></thead><tbody>{selected.map((row) => { const production = row!.player.prior_production; return <tr key={`compare-${row!.player.id}`}><th scope="row"><Link href={`/basketball/player/?id=${encodeURIComponent(row!.player.id)}&season=${data.previous_season}`}>{row!.player.name}</Link><small>{row!.player.team} · source ID {row!.player.id}</small><small>{row!.player.previous_teams.length ? `Prior: ${row!.player.previous_teams.join(", ")}` : "No prior program listed"}</small>{row!.player.source_url && <small><a href={row!.player.source_url} target="_blank" rel="noreferrer">Roster source ↗</a></small>}</th><td>{displayRole(row!.role)}<small>{row!.player.status.replaceAll("_", " ")}</small></td><td className="numeric"><strong>{fmt(row!.score, 1)}</strong></td><td className="numeric">{fmt(production?.mpg)}</td><td className="numeric">{fmt(production?.ppg)}</td><td className="numeric">{fmt(production?.rpg)}</td><td className="numeric">{fmt(production?.apg)}</td><td className="numeric">{production?.ts == null ? "—" : `${fmt(production.ts * 100)}%`}</td><td className="numeric">{production?.efg == null ? "—" : `${fmt(production.efg * 100)}%`}</td><td className="numeric">{fmt(production?.box_bpm)}</td></tr>; })}</tbody></table></div>
          </section>}
          <p className="note fit-footnote">Coverage: {data.players.length.toLocaleString()} source-listed player rows across {data.teams_observed.toLocaleString()} programs. Unknown position labels are excluded when a specific role is selected. Missing prior production remains missing.</p>
        </>
      )}
    </>
  );
}
