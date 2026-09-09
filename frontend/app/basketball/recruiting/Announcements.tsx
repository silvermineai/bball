"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  categoryLabels,
  eventLabels,
  publicationDate,
  recruitingRows,
  parseRecruitingCoverageFilters,
  parseRecruitingFilters,
  recruitingFilterSearch,
  sortRecruitingRows,
  sortRecruitingReviewRows,
  summarizeRecruitingPrograms,
  rosterNameMatch,
  type RecruitingSort,
  type RecruitingRelease,
} from "../../_lib/recruiting";
import Recruiting from "./Recruiting";
import { comparisonHref } from "../../_lib/player-comparison";
import { downloadCsv, toCsv } from "../../_lib/csv";
import type { BBRoster, BBRosters } from "../../_lib/basketball-types";
const number = (n: number | null) => (n == null ? "—" : n.toFixed(1));
const percent = (n: number | null) =>
  n == null ? "—" : `${(n * 100).toFixed(1)}%`;
export default function Announcements({ data }: { data: RecruitingRelease }) {
  const [view, setView] = useState<"announcements" | "observations">("announcements"),
    [team, setTeam] = useState("all"),
    [q, setQ] = useState(""),
    [kind, setKind] = useState("all"),
    [sort, setSort] = useState<RecruitingSort>("latest"),
    [copied, setCopied] = useState(""),
    [coverageQuery, setCoverageQuery] = useState(""),
    [coverageSort, setCoverageSort] = useState<"reviewed" | "prior" | "unrepresented" | "name">("reviewed"),
    [coverageStatus, setCoverageStatus] = useState<"all" | "reviewed" | "unreviewed">("all");
  const [rosters, setRosters] = useState<BBRosters | null>(null),
    [rosterError, setRosterError] = useState("");
  const [liveData, setLiveData] = useState<RecruitingRelease | null>(null),
    [releaseError, setReleaseError] = useState(""),
    [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/basketball/research/recruiting?season=2027", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("The live recruiting edition is unavailable.");
        return response.json() as Promise<RecruitingRelease>;
      })
      .then((value) => {
        if (!controller.signal.aborted) setLiveData(value);
      })
      .catch((reason: unknown) => {
        if ((reason as { name?: string })?.name !== "AbortError" && !controller.signal.aborted) {
          setReleaseError(reason instanceof Error ? reason.message : "The live recruiting edition is unavailable.");
        }
      });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    const requestedView = new URLSearchParams(window.location.search).get("view");
    if (requestedView === "observations") setView("observations");
    const filters = parseRecruitingFilters(window.location.search);
    const coverage = parseRecruitingCoverageFilters(window.location.search);
    setTeam(filters.team);
    setQ(filters.q);
    setKind(filters.kind);
    setSort(filters.sort);
    setCoverageQuery(coverage.query);
    setCoverageSort(coverage.sort);
    setCoverageStatus(coverage.status);
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (!hydrated || view !== "announcements") return;
    const next = recruitingFilterSearch(
      { team, q, kind, sort },
      { query: coverageQuery, sort: coverageSort, status: coverageStatus },
    );
    const current = window.location.search;
    if (next !== current) {
      window.history.replaceState(
        window.history.state,
        "",
        `${window.location.pathname}${next}${window.location.hash}`,
      );
    }
  }, [hydrated, team, q, kind, sort, coverageQuery, coverageSort, coverageStatus, view]);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/data/basketball/rosters.json", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("The source roster release could not be loaded. Please reload.");
        return response.json() as Promise<BBRosters>;
      })
      .then((value) => {
        if (!controller.signal.aborted) setRosters(value);
      })
      .catch((error: Error) => {
        if (error.name !== "AbortError") setRosterError(error.message);
      });
    return () => controller.abort();
  }, []);
  const changeView = (next: "announcements" | "observations") => {
    setView(next);
    const url = new URL(window.location.href);
    if (next === "observations") url.searchParams.set("view", "observations");
    else url.searchParams.delete("view");
    window.history.replaceState(window.history.state, "", url);
  };
  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied("Recruiting view link copied.");
    } catch {
      setCopied("Copy the filtered URL from your address bar.");
    }
  };
  if (rosterError) {
    return <p className="status-error" role="alert">{rosterError}</p>;
  }
  if (!rosters) {
    return <p className="empty" role="status">Loading the source roster release…</p>;
  }
  const release = liveData || data;
  const allRows = recruitingRows(release);
  const programSummary = summarizeRecruitingPrograms(allRows);
  const coverageBaseRows = (rosters.team_summaries || [])
    .map((summary) => {
      const reviewed = release.programs.some((program) => program.id === summary.team_id);
      const additions = programSummary.find((row) => row.team_id === summary.team_id);
      return {
        ...summary,
        reviewed,
        additions: additions?.additions || 0,
        linkedProfiles: additions?.linked_profiles || 0,
      };
    });
  const coverageRows = coverageBaseRows
    .filter((row) =>
      row.team.toLowerCase().includes(coverageQuery.toLowerCase()) &&
      (coverageStatus === "all" || (coverageStatus === "reviewed" ? row.reviewed : !row.reviewed)),
    )
    .sort((a, b) => {
      if (coverageSort === "name") return a.team.localeCompare(b.team);
      if (coverageSort === "prior") return (b.prior_minutes || 0) - (a.prior_minutes || 0) || a.team.localeCompare(b.team);
      if (coverageSort === "unrepresented") return (b.unrepresented_prior_minutes || 0) - (a.unrepresented_prior_minutes || 0) || a.team.localeCompare(b.team);
      return Number(b.reviewed) - Number(a.reviewed) || (b.additions - a.additions) || a.team.localeCompare(b.team);
    });
  const reviewQueueRows = [...coverageBaseRows]
    .filter((row) => !row.reviewed)
    .sort((a, b) => (b.unrepresented_prior_minutes || 0) - (a.unrepresented_prior_minutes || 0) || (b.prior_minutes || 0) - (a.prior_minutes || 0) || a.team.localeCompare(b.team))
    .slice(0, 6);
  const rosterMatch = (name: string, teamId: string) => rosterNameMatch(name, teamId, rosters.players);
  const exactRoster = (name: string, teamId: string): BBRoster | null => {
    if (rosterMatch(name, teamId) !== "exact") return null;
    const normalized = name.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
    return rosters.players.find((player) => player.team_id === teamId && player.name.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase() === normalized) || null;
  };
  const matchingRows = allRows.filter(
    (p) =>
      (team === "all" || p.team_id === team) &&
      (kind === "all" ||
        (kind === "availability"
          ? p.timeline.some((e) => e.kind !== "addition")
          : p.category === kind)) &&
      `${p.name} ${p.program.name} ${p.previous_program || ""}`
        .normalize("NFKD")
        .replace(/\p{M}/gu, "")
        .toLowerCase()
        .includes(q.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()),
  );
  const rows = sort === "review"
    ? sortRecruitingReviewRows(matchingRows, (row) => rosterMatch(row.name, row.team_id))
    : sortRecruitingRows(matchingRows, sort);
  const exactRosterMatches = allRows.filter((row) => rosterMatch(row.name, row.team_id) === "exact").length;
  const sourceSeason = rosters.previous_season;
  return (
    <>
      <div className="recruiting-views" aria-label="Recruiting evidence view">
        <button
          aria-pressed={view === "announcements"}
          onClick={() => changeView("announcements")}
        >
          School announcements <span>{release.coverage.players}</span>
        </button>
        <button
          aria-pressed={view === "observations"}
          onClick={() => changeView("observations")}
        >
          Roster observations
        </button>
      </div>
      <p className="note" role="status">
        {liveData
          ? "Cloudflare D1 reviewed recruiting edition connected; showing the latest retained source file."
          : releaseError
            ? `${releaseError} Showing the bundled reviewed release.`
            : "Checking the live reviewed recruiting edition…"}
      </p>
      {view === "observations" ? (
        <Recruiting />
      ) : (
        <>
          <div className="strip recruiting-strip">
            <div>
              <strong>{release.coverage.players}</strong>
              <span>Players with announced additions</span>
            </div>
            <div>
              <strong>
                {release.coverage.programs}/
                {(rosters.team_summaries || []).length.toLocaleString()}
              </strong>
              <span>Reviewed / source-listed programs</span>
            </div>
            <div>
              <strong>{release.coverage.historical_links}</strong>
              <span>Prior college stat profiles linked</span>
            </div>
            <div>
              <strong>{release.coverage.events}</strong>
              <span>Dated school statements</span>
            </div>
          </div>
          <section className="paper-panel recruiting-national">
            <div className="section-heading">
              <div>
                <div className="eyebrow">National roster release / {rosters.season - 1}–{String(rosters.season).slice(-2)}</div>
                <h2>Put announcements in roster context.</h2>
              </div>
              <div className="button-row">
                <Link className="button secondary" href={`/basketball/ncaa-rosters/?season=${sourceSeason}`}>
                  Search roster archive ↗
                </Link>
                <a className="button secondary" href={`/api/basketball/research/ncaa-rosters/source?season=${sourceSeason}`}>
                  Download source parquet ↓
                </a>
              </div>
            </div>
            <p>
              The announcement file is a reviewed sample. The attributed NCAA
              roster release gives the broader source frame for the same target
              season, while keeping roster records separate from commitments,
              eligibility and transfer claims.
            </p>
            <div className="raw-stat-grid">
              <div><dt>{rosters.players_observed.toLocaleString()}</dt><dd>Source roster records</dd></div>
              <div><dt>{rosters.teams_observed.toLocaleString()}</dt><dd>Programs represented</dd></div>
              <div><dt>{rosters.prior_players_not_observed.toLocaleString()}</dt><dd>Rows without prior source profile</dd></div>
              <div><dt>{rosters.unusable_rows?.toLocaleString() ?? "0"}</dt><dd>Unusable source rows</dd></div>
            </div>
            <p className="note">
              Source edition: {rosters.previous_season}–{String(rosters.season).slice(-2)} roster release via SportsDataverse. The source download is the exact parquet release archived with a SHA-256 receipt.
            </p>
          </section>
          <div className="recruiting-scope">
            <span className="eyebrow">Coverage / Selected announcements</span>
            <p>
              {[...release.programs]
                .map((p) => p.name)
                .sort((a, b) => a.localeCompare(b))
                .join(", ")}
              . This is a growing research file; even these programs’ classes
              may be incomplete. An absent player or school means no reviewed
              record here. Additions are not a count of available players.
            </p>
            <small>
              Source review: {publicationDate(release.reviewed_at)} · These
              announcements do not adjust the forecast model. Exact normalized
              name matches in the current roster source: {exactRosterMatches} of {allRows.length}; a missing match is not evidence of absence.
            </small>
          </div>
          <section className="paper-panel recruiting-program-summary">
            <div className="section-heading">
              <div>
                <div className="eyebrow">Program view / linked production</div>
                <h2>How much prior workload is represented?</h2>
              </div>
              <button
                className="button secondary"
                type="button"
                onClick={() =>
                  downloadCsv(
                    "basketball-recruiting-program-summary.csv",
                    toCsv(
                      [
                        "Program",
                        "Program ID",
                        "Announced additions",
                        "College transfers",
                        "Linked prior profiles",
                        "Prior PPG represented",
                        "Prior MPG represented",
                        "Prior 20+ MPG contributors",
                      ],
                      programSummary.map((summary) => [
                        summary.team_name,
                        summary.team_id,
                        summary.additions,
                        summary.transfers,
                        summary.linked_profiles,
                        summary.prior_ppg,
                        summary.prior_mpg,
                        summary.high_workload,
                      ]),
                    ),
                  )
                }
              >
                Download program CSV ↓
              </button>
            </div>
            <p className="note">
              Sums below cover only announced additions in this reviewed file
              whose prior college profile was linked. They describe the source
              sample; they do not predict minutes, availability or a new-school
              role.
            </p>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Program</th>
                    <th className="numeric">Additions</th>
                    <th className="numeric">College transfers</th>
                    <th className="numeric">Linked profiles</th>
                    <th className="numeric">Prior PPG represented</th>
                    <th className="numeric">Prior MPG represented</th>
                    <th className="numeric">20+ MPG</th>
                  </tr>
                </thead>
                <tbody>
                  {programSummary.map((summary) => (
                    <tr key={summary.team_id}>
                      <td>
                        <button
                          className="text-link"
                          type="button"
                          onClick={() => {
                            setTeam(summary.team_id);
                            window.scrollTo({ top: 0, behavior: "smooth" });
                          }}
                        >
                          {summary.team_name}
                        </button>
                      </td>
                      <td className="numeric">{summary.additions}</td>
                      <td className="numeric">{summary.transfers}</td>
                      <td className="numeric">{summary.linked_profiles}</td>
                      <td className="numeric">{number(summary.prior_ppg)}</td>
                      <td className="numeric">{number(summary.prior_mpg)}</td>
                      <td className="numeric">{summary.high_workload}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="paper-panel recruiting-program-summary">
            <div className="section-heading">
              <div>
                <div className="eyebrow">Coverage map / 2026–27</div>
                <h2>Know what has been reviewed.</h2>
              </div>
              <button
                className="button secondary"
                type="button"
                onClick={() =>
                  downloadCsv(
                    "basketball-recruiting-program-coverage.csv",
                    toCsv(
                      ["Program", "Program ID", "Evidence status", "Announced additions", "Linked prior profiles", "Listed players", "Returning minutes share", "Prior minutes", "Unrepresented prior minutes"],
                      coverageRows.map((row) => [row.team, row.team_id, row.reviewed ? "Reviewed school announcements" : "Roster observation only", row.additions, row.linkedProfiles, row.listed_players, row.returning_minutes_share == null ? null : row.returning_minutes_share * 100, row.prior_minutes, row.unrepresented_prior_minutes]),
                    ),
                  )
                }
              >
                Download coverage CSV ↓
              </button>
            </div>
            <p className="note">
              Every source-listed program appears here. “Reviewed school announcements” means this edition has dated statements in the selected review file; “Roster observation only” means no reviewed transaction record is present. Absence is not evidence that a program made no move. Review clock: {publicationDate(release.reviewed_at)}.
            </p>
            <div className="toolbar recruiting-filters">
              <label className="control">
                <span>PROGRAM SEARCH</span>
                <input type="search" value={coverageQuery} onChange={(event) => setCoverageQuery(event.target.value)} placeholder="Search all observed programs" />
              </label>
              <label className="control">
                <span>ORDER</span>
                <select value={coverageSort} onChange={(event) => setCoverageSort(event.target.value as typeof coverageSort)}>
                  <option value="reviewed">Reviewed programs first</option>
                  <option value="prior">Prior minutes</option>
                  <option value="unrepresented">Unrepresented prior minutes</option>
                  <option value="name">Program name</option>
                </select>
              </label>
              <label className="control">
                <span>EVIDENCE STATUS</span>
                <select value={coverageStatus} onChange={(event) => setCoverageStatus(event.target.value as typeof coverageStatus)}>
                  <option value="all">All source-listed programs</option>
                  <option value="reviewed">Reviewed announcements</option>
                  <option value="unreviewed">Roster observation only</option>
                </select>
              </label>
            </div>
            <p className="note" role="status">
              {coverageRows.length.toLocaleString()} of {(rosters.team_summaries || []).length.toLocaleString()} source-listed programs shown · {coverageRows.filter((row) => row.reviewed).length} reviewed in this filtered view
            </p>
            {!!reviewQueueRows.length && (
              <div className="recruiting-review-queue" aria-label="Programs needing source review">
                <div>
                  <div className="eyebrow">Coach review queue</div>
                  <h3>Start where the roster evidence is largest.</h3>
                  <p>
                    These source-listed programs have no dated school announcement in this edition. The order uses prior minutes that are not represented by a reviewed addition, so it is a research queue rather than a recruiting grade.
                  </p>
                  <button
                    className="button secondary"
                    type="button"
                    onClick={() => {
                      setCoverageStatus("unreviewed");
                      setCoverageSort("unrepresented");
                      document.getElementById("recruiting-coverage-table")?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }}
                  >
                    Show full review queue ↓
                  </button>
                </div>
                <ol>
                  {reviewQueueRows.map((row) => (
                    <li key={row.team_id}>
                      <div>
                        <Link href={`/basketball/programs/${row.team_id}/`}><strong>{row.team}</strong> ↗</Link>
                        <span>{row.unrepresented_prior_minutes ? `${Math.round(row.unrepresented_prior_minutes).toLocaleString()} prior min unrepresented` : "No linked prior minutes"} · {row.listed_players} listed</span>
                      </div>
                      <Link href={`/basketball/recruiting/?view=observations&rosterQ=${encodeURIComponent(row.team)}`}>Review roster rows →</Link>
                    </li>
                  ))}
                </ol>
              </div>
            )}
            <div className="table-scroll" id="recruiting-coverage-table">
              <table className="data-table">
                <thead><tr><th>Program</th><th>Evidence status</th><th className="numeric">Additions</th><th className="numeric">Linked profiles</th><th className="numeric">Listed</th><th className="numeric">Returning share</th><th className="numeric">Prior minutes</th><th className="numeric">Unrepresented</th></tr></thead>
                <tbody>{coverageRows.map((row) => <tr key={row.team_id}>
                  <td><Link href={`/basketball/programs/${row.team_id}/`}>{row.team}</Link><small>{row.team_id}</small><small><Link href={`/basketball/recruiting/?view=observations&rosterQ=${encodeURIComponent(row.team)}`}>Review roster rows →</Link></small></td>
                  <td>{row.reviewed ? "Reviewed school announcements" : "Roster observation only"}</td>
                  <td className="numeric">{row.additions || "—"}</td>
                  <td className="numeric">{row.linkedProfiles || "—"}</td>
                  <td className="numeric">{row.listed_players}</td>
                  <td className="numeric">{row.returning_minutes_share == null ? "—" : `${(row.returning_minutes_share * 100).toFixed(1)}%`}</td>
                  <td className="numeric">{row.prior_minutes ? Math.round(row.prior_minutes).toLocaleString() : "—"}</td>
                  <td className="numeric">{row.unrepresented_prior_minutes ? Math.round(row.unrepresented_prior_minutes).toLocaleString() : "—"}</td>
                </tr>)}</tbody>
              </table>
            </div>
          </section>
          <div className="toolbar recruiting-filters">
            <label className="control">
              <span>PLAYER OR PRIOR PROGRAM</span>
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Try Khamenia, LSU or Kentucky"
              />
            </label>
            <label className="control">
              <span>ANNOUNCING PROGRAM</span>
              <select value={team} onChange={(e) => setTeam(e.target.value)}>
                <option value="all">All reviewed programs</option>
                {!release.programs.some((p) => p.id === team) &&
                  team !== "all" && (
                    <option value={team}>
                      Program {team} · no reviewed records
                    </option>
                  )}
                {[...release.programs]
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="control">
              <span>RECORD TYPE</span>
              <select value={kind} onChange={(e) => setKind(e.target.value)}>
                <option value="all">All additions</option>
                {Object.entries(categoryLabels).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
                <option value="availability">
                  With availability announcement
                </option>
              </select>
            </label>
            <label className="control">
              <span>SORT</span>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as RecruitingSort)}
              >
                <option value="latest">Latest school publication</option>
                <option value="ppg">Prior points per game</option>
                <option value="mpg">Prior minutes per game</option>
                <option value="review">Review priority</option>
                <option value="name">Player name</option>
              </select>
            </label>
          </div>
          <p className="note recruiting-share-note">
            This filtered view updates the URL, so a coaching staff can bookmark
            or share the exact recruiting evidence slice.
          </p>
          <div className="section-heading recruiting-results">
            <p role="status">
              {rows.length} player{rows.length === 1 ? "" : "s"} ·{" "}
              {sort === "latest"
                ? "Latest school publication first"
                : sort === "ppg"
                  ? "Prior points per game, highest first"
                  : sort === "mpg"
                    ? "Prior minutes per game, highest first"
                    : sort === "review"
                      ? "Attention update, roster handoff, linked production, then prior workload"
                    : "Alphabetical by player"}
            </p>
            <div className="button-row">
              <button className="button secondary" type="button" onClick={share}>
                Copy view link
              </button>
              <button
                className="button secondary"
                type="button"
                onClick={() =>
                  downloadCsv(
                    "basketball-recruiting-evidence.csv",
                    toCsv(
                      [
                        "Player",
                        "Category",
                        "Announcing program",
                        "Prior program",
                        "Latest status",
                        "Current roster source-name match",
                        "Latest publication",
                        "Prior stat team",
                        "Games",
                        "Minutes per game",
                        "Points per game",
                        "Rebounds per game",
                        "Assists per game",
                        "eFG%",
                        "TS%",
                        "3P%",
                        "Free throw rate",
                        "3PA rate",
                        "Turnover rate",
                        "Source title",
                        "Source URL",
                        "Reviewed at",
                      ],
                      rows.map((p) => [
                        p.name,
                        categoryLabels[p.category],
                        p.program.name,
                        p.previous_program,
                        eventLabels[p.latest.kind],
                        rosterMatch(p.name, p.team_id),
                        p.latest.source.published_on,
                        p.stats?.team,
                        p.stats?.games,
                        p.stats?.mpg,
                        p.stats?.ppg,
                        p.stats?.rpg,
                        p.stats?.apg,
                        p.stats?.efg == null ? null : p.stats.efg * 100,
                        p.stats?.ts == null ? null : p.stats.ts * 100,
                        p.stats?.three_pct == null
                          ? null
                          : p.stats.three_pct * 100,
                        p.stats?.ft_rate == null
                          ? null
                          : p.stats.ft_rate * 100,
                        p.stats?.three_rate == null
                          ? null
                          : p.stats.three_rate * 100,
                        p.stats?.tov_rate == null
                          ? null
                          : p.stats.tov_rate * 100,
                        p.latest.source.title,
                        p.latest.source.url,
                        p.latest.source.checked_at,
                      ]),
                    ),
                  )
                }
              >
                Download CSV ↓
              </button>
              <a href="/data/basketball/recruiting.json" download>
                Evidence JSON ↓
              </a>
            </div>
            {copied && <p role="status">{copied}</p>}
          </div>
          <div className="recruiting-grid">
            {rows.map((p) => (
              <article className="recruiting-card" key={p.key}>
                <div className="recruiting-card-top">
                  <Link href={`/basketball/programs/${p.team_id}/`}>
                    {p.program.name} ↗
                  </Link>
                  <span>{categoryLabels[p.category]}</span>
                </div>
                <h2>{p.name}</h2>
                <p className="recruiting-origin">
                  From {p.previous_program || "prior program not recorded"}
                </p>
                <div
                  className={`recruiting-state ${p.latest.kind !== "addition" ? "recruiting-unavailable" : ""}`}
                >
                  <span>{eventLabels[p.latest.kind]}</span>
                  <time dateTime={p.latest.source.published_on}>
                    {publicationDate(p.latest.source.published_on)}
                  </time>
                </div>
                <a
                  className="recruiting-source"
                  href={p.latest.source.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Read publisher source ↗
                </a>
                <p className="recruiting-eligibility">{p.latest.summary}</p>
                <p className="recruiting-eligibility">
                  Current roster source check: {rosterMatch(p.name, p.team_id) === "exact" ? "exact normalized name appears in the 2026–27 listing" : rosterMatch(p.name, p.team_id) === "multiple" ? "multiple normalized name matches; review manually" : "no exact normalized name match in the 2026–27 listing"}. This check is descriptive and does not establish identity, eligibility or availability.
                </p>
                {exactRoster(p.name, p.team_id) && (
                  <p className="recruiting-eligibility">
                    <Link href={`/basketball/player/?id=${encodeURIComponent(exactRoster(p.name, p.team_id)!.id)}`}>
                      Open the matched source player file →
                    </Link>
                    {exactRoster(p.name, p.team_id)!.source_url && <a href={exactRoster(p.name, p.team_id)!.source_url!} target="_blank" rel="noreferrer"> · publisher roster source ↗</a>}
                    <br /><small>This is an exact normalized name-and-program handoff for review, not a verified identity or eligibility determination.</small>
                  </p>
                )}
                {p.latest.kind === "addition" && (
                  <p className="recruiting-eligibility">
                    School-announced addition for 2026–27. Current eligibility
                    and availability are not verified here.
                  </p>
                )}
                {p.stats ? (
                  <div className="recruiting-history">
                    <span className="eyebrow">
                      2025–26 / {p.stats.team} / {p.stats.games} recorded{" "}
                      {p.stats.games === 1 ? "game" : "games"}
                    </span>
                    <div className="recruiting-metrics">
                      <div>
                        <strong>{number(p.stats.ppg)}</strong>
                        <span>PTS / G</span>
                      </div>
                      <div>
                        <strong>{number(p.stats.rpg)}</strong>
                        <span>REB / G</span>
                      </div>
                      <div>
                        <strong>{number(p.stats.apg)}</strong>
                        <span>AST / G</span>
                      </div>
                      <div>
                        <strong>{number(p.stats.mpg)}</strong>
                        <span>MIN / G</span>
                      </div>
                      <div>
                        <strong>
                          {percent(p.stats.efg)}
                        </strong>
                        <span>eFG%</span>
                      </div>
                      <div>
                        <strong>{percent(p.stats.ts)}</strong>
                        <span>TS%</span>
                      </div>
                      <div>
                        <strong>{percent(p.stats.three_pct)}</strong>
                        <span>3P%</span>
                      </div>
                      <div>
                        <strong>{percent(p.stats.ft_rate)}</strong>
                        <span>FTR</span>
                      </div>
                      <div>
                        <strong>{percent(p.stats.three_rate)}</strong>
                        <span>3PA RATE</span>
                      </div>
                      <div>
                        <strong>{percent(p.stats.tov_rate)}</strong>
                        <span>TO RATE</span>
                      </div>
                    </div>
                    {p.stats.games < 10 && (
                      <small>
                        Limited sample: fewer than 10 recorded games. These
                        averages do not establish a full-season role.
                      </small>
                    )}
                    <Link href={`/basketball/player/?id=${p.stats.id}`}>
                      Historical player file →
                    </Link>
                    <Link href={comparisonHref(p.stats)}>
                      Compare prior production →
                    </Link>
                    {p.stats.incomplete_box_games > 0 && (
                      <small>
                        {p.stats.incomplete_box_games} games have incomplete box
                        fields.
                      </small>
                    )}
                  </div>
                ) : (
                  <div className="recruiting-history recruiting-no-stats">
                    <span className="eyebrow">Historical college stats</span>
                    <p>
                      No reviewed link to a 2025–26 college box-score profile.
                      Prep and international statistics are not included in this
                      file.
                    </p>
                  </div>
                )}
                <details className="recruiting-evidence">
                  <summary>
                    {p.timeline.length === 1
                      ? "Read the school announcement"
                      : `${p.timeline.length} school statements · View history`}
                  </summary>
                  <ol>
                    {p.timeline.map((e) => (
                      <li key={e.id}>
                        <time dateTime={e.source.published_on}>
                          {publicationDate(e.source.published_on)}
                        </time>
                        <strong>{eventLabels[e.kind]}</strong>
                        <p>{e.summary}</p>
                        <a href={e.source.url} target="_blank" rel="noreferrer">
                          {e.source.title} ↗
                        </a>
                        <small>
                          {e.source.publisher} · Reviewed{" "}
                          {publicationDate(e.source.checked_at)}
                        </small>
                        {e.source.review_note && (
                          <p className="note">
                            Review note: {e.source.review_note}
                          </p>
                        )}
                      </li>
                    ))}
                  </ol>
                </details>
              </article>
            ))}
          </div>
          {!rows.length && (
            <div className="empty">
              <p>
                No reviewed announcements match these filters. This does not
                establish that the program has no additions.
              </p>
              <button
                className="button secondary"
                onClick={() => {
                  setTeam("all");
                  setQ("");
                  setKind("all");
                }}
              >
                Clear filters
              </button>
            </div>
          )}
          <section className="section paper-panel">
            <h2>Every record has a paper trail.</h2>
            <p>{release.methodology}</p>
            <p>
              Dates above are the publisher’s calendar dates, not when a player
              signed or entered the portal. Our review timestamps show when we
              checked the sources; older articles were collected
              retrospectively. Later school statements remain alongside the
              original addition. A planned redshirt is a school statement, not
              an eligibility ruling.
            </p>
            <p>
              Historical stats come from{" "}
              <a href={release.stats_source.url}>
                SportsDataverse’s attributed bulk releases
              </a>{" "}
              ({release.stats_source.license}). Links require a reviewed match of
              the full player name and the school-announced prior program.
              College production describes past appearances; it does not project
              a player’s role at a new school. Announcement records contain our
              brief factual summaries and links to the school’s reporting.
            </p>
            <p>
              <Link href="/basketball/model/">
                How the forecast model works →
              </Link>
            </p>
          </section>
        </>
      )}
    </>
  );
}
