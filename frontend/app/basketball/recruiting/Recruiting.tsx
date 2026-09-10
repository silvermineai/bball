"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { BBRoster, BBRosters } from "../../_lib/basketball-types";
import { useBasketballRelease } from "../../_components/useBasketballRelease";
import { downloadCsv, toCsv } from "../../_lib/csv";
import {
  parseRosterFilters,
  filterRosterObservations,
  rosterFilterOptions,
  rosterFilterSearch,
  sortRosterObservations,
  priorProductionIndex,
  type RosterSortKey,
  type RosterStatus,
} from "../../_lib/roster-observations";

type PriorProduction = NonNullable<BBRoster["prior_production"]>;

const statValue = (value: number | null | undefined, digits = 1) =>
  value == null || !Number.isFinite(value) ? "—" : value.toFixed(digits);

const statPercent = (value: number | null | undefined) =>
  value == null || !Number.isFinite(value) ? "—" : `${(value * 100).toFixed(1)}%`;

function PriorProductionDetails({ production }: { production: PriorProduction }) {
  return (
    <details className="roster-production-details">
      <summary>Full prior stat profile</summary>
      <dl className="roster-stat-grid">
        <div><dt>Games</dt><dd>{production.games.toLocaleString()}</dd></div>
        <div><dt>Minutes</dt><dd>{production.minutes.toLocaleString()}</dd></div>
        <div><dt>Starts</dt><dd>{production.starts == null ? "—" : production.starts.toLocaleString()}</dd></div>
        <div><dt>Starter reported</dt><dd>{production.starter_reported_records == null ? "—" : production.starter_reported_records.toLocaleString()}</dd></div>
        <div><dt>Reported starter rate</dt><dd>{statPercent(production.starter_rate)}</dd></div>
        <div><dt>Minutes / game</dt><dd>{statValue(production.mpg)}</dd></div>
        <div><dt>Points / game</dt><dd>{statValue(production.ppg)}</dd></div>
        <div><dt>Rebounds / game</dt><dd>{statValue(production.rpg)}</dd></div>
        <div><dt>Assists / game</dt><dd>{statValue(production.apg)}</dd></div>
        <div><dt>Steals / game</dt><dd>{statValue(production.spg)}</dd></div>
        <div><dt>Blocks / game</dt><dd>{statValue(production.bpg)}</dd></div>
        <div><dt>Turnovers / game</dt><dd>{statValue(production.topg)}</dd></div>
        <div><dt>True shooting</dt><dd>{statPercent(production.ts)}</dd></div>
        <div><dt>Effective FG</dt><dd>{statPercent(production.efg)}</dd></div>
        <div><dt>3-point rate</dt><dd>{statPercent(production.three_rate)}</dd></div>
        <div><dt>3-point accuracy</dt><dd>{statPercent(production.three_pct)}</dd></div>
        <div><dt>Free-throw rate</dt><dd>{statPercent(production.ft_rate)}</dd></div>
        <div><dt>Turnover rate</dt><dd>{statPercent(production.tov_rate)}</dd></div>
        <div><dt>Box BPM</dt><dd>{statValue(production.box_bpm)}</dd></div>
        <div><dt>Box OBPM</dt><dd>{statValue(production.box_obpm)}</dd></div>
        <div><dt>Box DBPM</dt><dd>{statValue(production.box_dbpm)}</dd></div>
        <div><dt>Qualified profile</dt><dd>{production.qualified == null ? "—" : production.qualified ? "Yes" : "No"}</dd></div>
      </dl>
      <p className="note">
        Source-recorded prior production for {production.teams.join(", ") || "the observed program"}. A dash means the source denominator or exact player/team row was unavailable; no value is imputed.
      </p>
    </details>
  );
}

const labels: Record<string, string> = {
  same_program: "Prior program also observed",
  different_program: "Different program observed",
  new_to_dataset: "No prior appearance in dataset",
  ambiguous: "Multiple current programs",
};
export default function Recruiting() {
  const [season, setSeason] = useState("2027"),
    [q, setQ] = useState(""),
    [position, setPosition] = useState(""),
    [classYear, setClassYear] = useState(""),
    [status, setStatus] = useState("all"),
    [sort, setSort] = useState<RosterSortKey>("status"),
    [teamQuery, setTeamQuery] = useState(""),
    [teamSort, setTeamSort] = useState<"returning" | "prior" | "unrepresented" | "name">("returning"),
    [minGames, setMinGames] = useState(0),
    [minMinutes, setMinMinutes] = useState(0),
    [page, setPage] = useState(0),
    [copied, setCopied] = useState(""),
    [picks, setPicks] = useState<string[]>([]),
    [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    const filters = parseRosterFilters(window.location.search);
    setSeason(filters.season);
    setQ(filters.q);
    setPosition(filters.position);
    setClassYear(filters.classYear);
    setStatus(filters.status);
    setSort(filters.sort);
    setMinGames(filters.minGames);
    setMinMinutes(filters.minMinutes);
    setPage(filters.page);
    setPicks(filters.picks);
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    const url = new URL(window.location.href);
    const params = new URLSearchParams(
      rosterFilterSearch({
        season: season === "2026" || season === "2025" ? season : "2027",
        q,
        position,
        classYear,
        status: status as RosterStatus,
        sort,
        minGames,
        minMinutes,
        page,
        picks,
      }),
    );
    params.set("view", "observations");
    url.search = params.toString();
    window.history.replaceState(window.history.state, "", url);
  }, [classYear, hydrated, minGames, minMinutes, page, picks, position, q, season, sort, status]);
  const { data, error } = useBasketballRelease<BBRosters>(
    season === "2027" ? "rosters" : season === "2026" ? "rosters-2026" : "rosters-2025",
  );
  const [liveRoster, setLiveRoster] = useState<BBRosters | null>(null);
  const [liveRosterError, setLiveRosterError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setLiveRoster(null);
    setLiveRosterError("");
    fetch(`/api/basketball/research/rosters?season=${season}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("The live roster observation edition is unavailable.");
        return response.json() as Promise<BBRosters>;
      })
      .then((value) => {
        if (!controller.signal.aborted) setLiveRoster(value);
      })
      .catch((reason: unknown) => {
        if ((reason as { name?: string })?.name !== "AbortError" && !controller.signal.aborted) {
          setLiveRosterError(reason instanceof Error ? reason.message : "The live roster observation edition is unavailable.");
        }
      });
    return () => controller.abort();
  }, [season]);
  const rosterData = liveRoster
    ? {
        ...liveRoster,
        // Prior production is a derived historical view; preserve the richer
        // bundled profile while replacing only the current source listing.
        players: liveRoster.players.map((player) => ({
          ...player,
          prior_production: data?.players.find((candidate) => candidate.id === player.id && candidate.team_id === player.team_id)?.prior_production ?? null,
        })),
      }
    : data;
  const sourceReceipt = rosterData?.source;
  const options = rosterFilterOptions(rosterData?.players || []);
  const rows = sortRosterObservations(
    filterRosterObservations(rosterData?.players || [], {
      q,
      position,
      classYear,
      minGames,
      minMinutes,
      status: status as RosterStatus,
    }),
    sort,
  );
  const productionIndex = priorProductionIndex(rows);
  const teamRows = [...(rosterData?.team_summaries || [])]
    .filter((team) => team.team.toLowerCase().includes(teamQuery.toLowerCase()))
    .sort((a, b) => {
      if (teamSort === "name") return a.team.localeCompare(b.team);
      if (teamSort === "prior") return (b.prior_minutes ?? 0) - (a.prior_minutes ?? 0) || a.team.localeCompare(b.team);
      if (teamSort === "unrepresented") return (b.unrepresented_prior_minutes ?? 0) - (a.unrepresented_prior_minutes ?? 0) || a.team.localeCompare(b.team);
      return (b.returning_minutes_share ?? -1) - (a.returning_minutes_share ?? -1) || a.team.localeCompare(b.team);
    });
  const pickedRows = (rosterData?.players || []).filter((player) => picks.includes(player.id));
  const togglePick = (id: string) => {
    setPicks((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : current.length >= 12
          ? current
          : [...current, id],
    );
  };
  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied("Roster observation link copied.");
    } catch {
      setCopied("Copy the filtered URL from your address bar.");
    }
  };
  return (
    <>
      <div className="toolbar">
        <label className="control">
          <span>VIEW</span>
          <select
            value={season}
            onChange={(e) => {
              setSeason(e.target.value);
              setStatus("all");
              setPosition("");
              setClassYear("");
              setPicks([]);
              setPage(0);
            }}
          >
            <option value="2027">2026–27 · Unconfirmed source listings</option>
            <option value="2026">2025–26 · Source roster snapshot</option>
            <option value="2025">2024–25 · Source roster snapshot</option>
          </select>
        </label>
        <label className="control">
          <span>SOURCE POSITION</span>
          <select
            value={position}
            onChange={(e) => {
              setPosition(e.target.value);
              setPage(0);
            }}
          >
            <option value="">All positions</option>
            {position && !options.positions.includes(position) && (
              <option value={position}>{position} · not in this sample</option>
            )}
            {options.positions.map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </label>
        <label className="control">
          <span>SOURCE CLASS</span>
          <select
            value={classYear}
            onChange={(e) => {
              setClassYear(e.target.value);
              setPage(0);
            }}
          >
            <option value="">All classes</option>
            {classYear && !options.classes.includes(classYear) && (
              <option value={classYear}>{classYear} · not in this sample</option>
            )}
            {options.classes.map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </label>
        <label className="control">
          <span>PLAYER OR PROGRAM</span>
          <input
            type="search"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(0);
            }}
            placeholder="Search current or prior program"
          />
        </label>
        <label className="control">
          <span>OBSERVATION</span>
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(0);
            }}
          >
            <option value="all">All observations</option>
            {Object.entries(labels).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="control">
          <span>ORDER</span>
          <select
            value={sort}
            onChange={(e) => {
              setSort(e.target.value as RosterSortKey);
              setPage(0);
            }}
          >
            <option value="status">Movement signal</option>
            <option value="prior">Most prior programs</option>
            <option value="workload">Most prior minutes</option>
            <option value="prior_ppg">Prior points per game</option>
            <option value="prior_rpg">Prior rebounds per game</option>
            <option value="prior_apg">Prior assists per game</option>
            <option value="prior_spg">Prior steals per game</option>
            <option value="prior_bpg">Prior blocks per game</option>
            <option value="prior_ts">Prior true shooting</option>
            <option value="prior_efg">Prior effective FG%</option>
            <option value="prior_three_pct">Prior three-point accuracy</option>
            <option value="prior_ft_rate">Prior free-throw rate</option>
            <option value="prior_three_rate">Prior three-point attempt rate</option>
            <option value="prior_tov_rate">Prior turnover rate</option>
            <option value="prior_bpm">Prior publisher Box BPM</option>
            <option value="prior_index">Multi-stat prior production index</option>
            <option value="program">Current program</option>
            <option value="name">Player name</option>
          </select>
        </label>
        <label className="control">
          <span>MINIMUM PRIOR GAMES</span>
          <select value={minGames} onChange={(e) => { setMinGames(Number(e.target.value)); setPage(0); }}>
            <option value={0}>Any prior sample</option>
            {[5, 10, 20, 30].map((value) => <option key={value} value={value}>{value}+ games</option>)}
          </select>
        </label>
        <label className="control">
          <span>MINIMUM PRIOR MINUTES</span>
          <select value={minMinutes} onChange={(e) => { setMinMinutes(Number(e.target.value)); setPage(0); }}>
            <option value={0}>Any prior workload</option>
            {[200, 400, 600, 800].map((value) => <option key={value} value={value}>{value.toLocaleString()}+ minutes</option>)}
          </select>
        </label>
      </div>
      <p className="note" role="status" style={{ marginBottom: 8 }}>
        {liveRoster
          ? "Live Cloudflare D1 roster edition connected; current source listings and workload continuity are refreshed from the research warehouse."
          : liveRosterError
            ? `${liveRosterError} Showing the bundled roster release.`
            : "Checking the live roster observation edition…"}
      </p>
      {sourceReceipt && (sourceReceipt.url || sourceReceipt.sha256 || sourceReceipt.fetched_at) && (
        <details className="note" style={{ marginBottom: 20 }}>
          <summary>Source receipt for {season === "2027" ? "2026–27" : `${Number(season) - 1}–${season.slice(-2)}`} roster observations</summary>
          <div className="table-scroll" style={{ marginTop: 12 }}>
            <table className="data-table">
              <thead><tr><th>Dataset</th><th>Retrieved (UTC)</th><th>SHA-256</th><th>Release</th></tr></thead>
              <tbody><tr>
                <td>{sourceReceipt.dataset.replaceAll("_", " ")}</td>
                <td>{sourceReceipt.fetched_at ? new Date(sourceReceipt.fetched_at).toLocaleString("en-US", { timeZone: "UTC", dateStyle: "medium", timeStyle: "short" }) : "—"}</td>
                <td><code>{sourceReceipt.sha256 || "—"}</code></td>
                <td>{sourceReceipt.url ? <a href={sourceReceipt.url} target="_blank" rel="noreferrer">Open release ↗</a> : "—"}</td>
              </tr></tbody>
            </table>
          </div>
          <p style={{ marginTop: 12 }}>This receipt identifies the source listing behind the observation view. It does not establish a commitment, transfer, eligibility or current availability decision.</p>
        </details>
      )}
      <p className="note" style={{ marginBottom: 20 }}>
        Production sorts use the exact prior source ID and recorded game
        averages. True shooting and effective field goal percentage stay
        unavailable when their source denominator is missing; they are not
        imputed. Box BPM is a separate source-attributed publisher value and
        remains blank when that exact athlete/team release row is unavailable.
        Workload thresholds apply to the preceding source season and exclude
        rows without enough recorded games or minutes.
      </p>
      {error ? (
        <p role="alert" className="status-error">
          {error}
        </p>
      ) : !rosterData ? (
        <p className="empty" role="status">
          Loading roster observations…
        </p>
      ) : (
        <>
          <div
            className="strip"
            style={{ borderTop: "1px solid var(--ink)", marginBottom: 25 }}
          >
            <div>
              <strong>{rosterData.teams_observed}</strong>
              <span>Programs in this source view</span>
            </div>
            <div>
              <strong>{rosterData.players_observed.toLocaleString()}</strong>
              <span>Distinct observed player IDs</span>
            </div>
            <div>
              <strong>
                {rosterData.status_counts.different_program?.toLocaleString() || 0}
              </strong>
              <span>Different program records</span>
            </div>
            <div>
              <strong>
                {rosterData.status_counts.new_to_dataset?.toLocaleString() || 0}
              </strong>
              <span>No prior appearance found</span>
            </div>
          </div>
          <p className="note" style={{ marginBottom: 22 }}>
            {season === "2027"
              ? "Listings can carry over from earlier seasons; no school-confirmed current transfer status is supplied. Missing players may reflect incomplete rosters, not departures."
              : "This source roster snapshot is compared with the preceding season's recorded participation. A different program record describes historical participation, not why or when a transfer happened."}{" "}
            New to the dataset does not mean freshman. Prior production is
            recorded workload from the preceding source season, not a
            projected role at the listed program.
          </p>
          {sort === "prior_index" && (
            <p className="note" style={{ marginBottom: 22 }}>
              The multi-stat prior production index standardizes available PPG,
              RPG, APG, steals, blocks, true shooting and effective FG% within
              this filtered view, then averages at least four available
              components. It is a cohort-relative research aid; it is not a
              recruiting grade, eligibility claim or forecast input.
            </p>
          )}
          <section className="paper-panel recruiting-watchlist" style={{ marginBottom: 24 }}>
            <div className="section-heading" style={{ marginBottom: 8 }}>
              <div>
                <div className="eyebrow">Recruiting watch list</div>
                <h2>Keep the names worth checking.</h2>
              </div>
              <span className="note">{picks.length} / 12 saved</span>
            </div>
            <p className="note">
              Save source IDs while reviewing this edition. The list is stored in the shareable URL; it is a research shortlist, not a commitment or transfer ledger.
            </p>
            {pickedRows.length ? (
              <div className="recruiting-watchlist-items">
                {pickedRows.map((player) => (
                  <div key={`${player.id}-${player.team_id}`} className="recruiting-watchlist-item">
                    <span><strong>{player.name}</strong><small>{player.team} · {labels[player.status]}</small></span>
                    <button className="button secondary" type="button" onClick={() => togglePick(player.id)}>Remove</button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="note">No names saved yet. Use “Add to watch list” beside a row below.</p>
            )}
            {pickedRows.length > 1 && (
              <div className="table-scroll" style={{ marginTop: 18 }}>
                <div className="section-heading" style={{ marginBottom: 10 }}>
                  <p className="note">Side-by-side prior production · source IDs remain separate</p>
                  <button
                    className="button secondary"
                    type="button"
                    onClick={() =>
                      downloadCsv(
                        `basketball-recruiting-watchlist-${season}.csv`,
                        toCsv(
                          ["Player", "Source ID", "Current program", "Observation", "Prior minutes", "Prior starts", "Starter reported", "Reported starter rate", "Prior MPG", "Prior PPG", "Prior RPG", "Prior APG", "Prior TS%", "Prior eFG%", "Prior Box BPM", "Source URL", "Roster source dataset", "Roster release URL", "Roster retrieved (UTC)", "Roster SHA-256"],
                          pickedRows.map((player) => [
                            player.name,
                            player.id,
                            player.team,
                            labels[player.status],
                            player.prior_production?.minutes,
                            player.prior_production?.starts,
                            player.prior_production?.starter_reported_records,
                            player.prior_production?.starter_rate == null ? null : player.prior_production.starter_rate * 100,
                            player.prior_production?.mpg,
                            player.prior_production?.ppg,
                            player.prior_production?.rpg,
                            player.prior_production?.apg,
                            player.prior_production?.ts == null ? null : player.prior_production.ts * 100,
                            player.prior_production?.efg == null ? null : player.prior_production.efg * 100,
                            player.prior_production?.box_bpm,
                            player.source_url,
                            sourceReceipt?.dataset,
                            sourceReceipt?.url,
                            sourceReceipt?.fetched_at,
                            sourceReceipt?.sha256,
                          ]),
                        ),
                      )
                    }
                  >
                    Download comparison CSV ↓
                  </button>
                </div>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Player</th>
                      <th>Program / observation</th>
                      <th className="numeric">Prior MIN</th>
                      <th className="numeric">MPG</th>
                      <th className="numeric">PPG</th>
                      <th className="numeric">RPG</th>
                      <th className="numeric">APG</th>
                      <th className="numeric">TS%</th>
                      <th className="numeric">eFG%</th>
                      <th className="numeric">Box BPM</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pickedRows.map((player) => (
                      <tr key={`compare-${player.id}-${player.team_id}`}>
                        <td><Link href={`/basketball/player/?id=${player.id}`}>{player.name}</Link><small>{player.id}</small></td>
                        <td>{player.team}<small>{labels[player.status]}</small></td>
                        <td className="numeric">{player.prior_production?.minutes?.toLocaleString() || "—"}</td>
                        <td className="numeric">{player.prior_production?.mpg == null ? "—" : player.prior_production.mpg.toFixed(1)}</td>
                        <td className="numeric">{player.prior_production?.ppg == null ? "—" : player.prior_production.ppg.toFixed(1)}</td>
                        <td className="numeric">{player.prior_production?.rpg == null ? "—" : player.prior_production.rpg.toFixed(1)}</td>
                        <td className="numeric">{player.prior_production?.apg == null ? "—" : player.prior_production.apg.toFixed(1)}</td>
                        <td className="numeric">{player.prior_production?.ts == null ? "—" : `${(player.prior_production.ts * 100).toFixed(1)}%`}</td>
                        <td className="numeric">{player.prior_production?.efg == null ? "—" : `${(player.prior_production.efg * 100).toFixed(1)}%`}</td>
                        <td className="numeric">{player.prior_production?.box_bpm == null ? "—" : player.prior_production.box_bpm.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          {rosterData.unusable_rows != null && rosterData.unusable_rows > 0 && (
            <p className="career-coverage-warning">
              {rosterData.unusable_rows.toLocaleString()} source roster rows were
              excluded as team-attributed placeholders; raw records remain in
              the research warehouse.
            </p>
          )}
          {!!rosterData.team_summaries?.length && (
            <details className="career-coverage-details" style={{ marginBottom: 24 }}>
              <summary>{season === "2027" ? "Team workload continuity" : "Recorded workload movement"} ({rosterData.team_summaries.length} programs)</summary>
              <p className="note">
                Prior minutes are summed from the preceding source season. The
                {season === "2027"
                  ? " listed view is an unconfirmed observation; this table is a workload context signal, not a depth chart or eligibility claim."
                  : " recorded appearance view uses playing time on both sides; this table is a workload context signal, not a transfer ledger or explanation of movement."}
              </p>
              <p className="note">
                Unrepresented prior minutes are the prior-season team total minus
                minutes represented by the listed source IDs. Use that column to
                prioritize film and source review; it is not a departure count,
                an eligibility signal or a forecast adjustment.
              </p>
              <div className="toolbar">
                <label className="control">
                  <span>PROGRAM SEARCH</span>
                  <input
                    type="search"
                    value={teamQuery}
                    maxLength={100}
                    placeholder="Search all observed programs"
                    onChange={(e) => setTeamQuery(e.target.value)}
                  />
                </label>
                <label className="control">
                  <span>ORDER</span>
                  <select value={teamSort} onChange={(e) => setTeamSort(e.target.value as typeof teamSort)}>
                    <option value="returning">Returning minutes share</option>
                    <option value="prior">Prior minutes represented</option>
                    <option value="unrepresented">Unrepresented prior minutes</option>
                    <option value="name">Program name</option>
                  </select>
                </label>
                <button
                  className="button secondary"
                  type="button"
                  onClick={() =>
                    downloadCsv(
                      `basketball-roster-team-continuity-${season}.csv`,
                      toCsv(
                        ["Program", "Program ID", "Listed players", "Returning players", "Different-program players", "New-to-dataset players", "Prior minutes", "Returning minutes", "Incoming prior minutes", "Represented prior minutes", "Unrepresented prior minutes", "Returning minutes share", "Represented prior minutes share"],
                        teamRows.map((team) => [team.team, team.team_id, team.listed_players, team.returning_players, team.transfer_players, team.new_players, team.prior_minutes, team.returning_minutes, team.incoming_prior_minutes, team.represented_prior_minutes, team.unrepresented_prior_minutes, team.returning_minutes_share == null ? null : team.returning_minutes_share * 100, team.represented_prior_minutes_share == null ? null : team.represented_prior_minutes_share * 100]),
                      ),
                    )
                  }
                  disabled={!teamRows.length}
                >
                  Download team CSV ↓
                </button>
              </div>
              <p className="note" role="status">
                {teamRows.length.toLocaleString()} of {rosterData.team_summaries.length.toLocaleString()} observed programs shown. {season === "2027" ? "The denominator is the source roster listing, not confirmed Division I membership." : "The denominator is the recorded appearance sample, which includes programs outside the primary forecast field."}
              </p>
              <div className="table-scroll">
                <table className="data-table">
                  <thead><tr><th>Program</th><th className="numeric">Listed</th><th className="numeric">Returning</th><th className="numeric">Incoming</th><th className="numeric">Prior minutes</th><th className="numeric">Unrepresented</th><th className="numeric">Returning share</th></tr></thead>
                  <tbody>
                    {teamRows.map((team) => (
                        <tr key={team.team_id}>
                          <td><Link href={`/basketball/programs/${team.team_id}/`}>{team.team}</Link><small>{team.transfer_players} different-program · {team.new_players} new to dataset</small></td>
                          <td className="numeric">{team.listed_players}</td>
                          <td className="numeric">{team.returning_players}</td>
                          <td className="numeric">{team.incoming_prior_minutes ? `${Math.round(team.incoming_prior_minutes).toLocaleString()} min` : "—"}</td>
                          <td className="numeric">{team.prior_minutes ? Math.round(team.prior_minutes).toLocaleString() : "—"}</td>
                          <td className="numeric">{team.unrepresented_prior_minutes ? `${Math.round(team.unrepresented_prior_minutes).toLocaleString()} min` : "—"}</td>
                          <td className="numeric">{team.returning_minutes_share == null ? "—" : `${(team.returning_minutes_share * 100).toFixed(1)}%`}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
          <div className="section-heading" style={{ marginBottom: 20 }}>
            <p>
              {rows.length.toLocaleString()} matching observations · export
              respects the season, search, observation, workload and sort filters
            </p>
            <div className="button-row">
              <button className="button secondary" type="button" onClick={share}>
                Copy observation link
              </button>
              <button
                className="button secondary"
                type="button"
                onClick={() =>
                  downloadCsv(
                    `basketball-roster-observations-${season}.csv`,
                    toCsv(
                    [
                      "Player",
                      "Source ID",
                      "Current program",
                      "Current program ID",
                      "Prior observed programs",
                      "Observation",
                      "Position",
                      "Source-listed class",
                      "Prior recorded games",
                      "Prior recorded minutes",
                      "Prior starts",
                      "Starter reported",
                      "Reported starter rate",
                      "Prior minutes per game",
                      "Prior points per game",
                      "Prior rebounds per game",
                      "Prior assists per game",
                      "Prior steals per game",
                      "Prior blocks per game",
                      "Prior turnovers per game",
                      "Prior effective FG%",
                      "Prior true shooting %",
                      "Prior Box BPM",
                      "Prior 3P%",
                      "Prior free-throw rate",
                      "Prior 3PA rate",
                      "Prior turnover rate",
                      "Prior profile qualified",
                      "Prior recorded programs",
                      "Height",
                      "Weight",
                      "Source URL",
                      "Roster source dataset",
                      "Roster release URL",
                      "Roster retrieved (UTC)",
                      "Roster SHA-256",
                    ],
                    rows.map((p) => [
                      p.name,
                      p.id,
                      p.team,
                      p.team_id,
                      p.previous_teams.join("; "),
                      labels[p.status],
                      p.position,
                      p.class_year,
                      p.prior_production?.games,
                      p.prior_production?.minutes,
                      p.prior_production?.starts,
                      p.prior_production?.starter_reported_records,
                      p.prior_production?.starter_rate == null ? null : p.prior_production.starter_rate * 100,
                      p.prior_production?.mpg,
                      p.prior_production?.ppg,
                      p.prior_production?.rpg,
                      p.prior_production?.apg,
                      p.prior_production?.spg,
                      p.prior_production?.bpg,
                      p.prior_production?.topg,
                      p.prior_production?.efg == null ? null : p.prior_production.efg * 100,
                      p.prior_production?.ts == null ? null : p.prior_production.ts * 100,
                      p.prior_production?.box_bpm,
                      p.prior_production?.three_pct == null ? null : p.prior_production.three_pct * 100,
                      p.prior_production?.ft_rate == null ? null : p.prior_production.ft_rate * 100,
                      p.prior_production?.three_rate == null ? null : p.prior_production.three_rate * 100,
                      p.prior_production?.tov_rate == null ? null : p.prior_production.tov_rate * 100,
                      p.prior_production?.qualified == null
                        ? null
                        : p.prior_production.qualified
                          ? "yes"
                          : "no",
                      p.prior_production?.teams?.join("; "),
                      p.height,
                      p.weight,
                      p.source_url,
                      sourceReceipt?.dataset,
                      sourceReceipt?.url,
                      sourceReceipt?.fetched_at,
                      sourceReceipt?.sha256,
                    ]),
                  ),
                )}
              >
                Download CSV ↓
              </button>
            </div>
            {copied && <p role="status">{copied}</p>}
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Player</th>
                  <th>
                    {season === "2027"
                      ? "Source-listed program"
                      : "Observed program"}
                  </th>
                  <th>Prior appearances</th>
                      <th>Observation</th>
                      <th>Source-listed class</th>
                      {sort === "prior_index" && <th className="numeric">Prior index</th>}
                      <th>Prior recorded production</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(page * 40, page * 40 + 40).map((p) => (
                  <tr key={`${p.id}-${p.team_id}`}>
                    <td>
                      <Link href={`/basketball/player/?id=${p.id}`}>
                        {p.name}
                      </Link>
                      <small>
                        {[p.position, p.height].filter(Boolean).join(" · ")}
                      </small>
                      {p.source_url && (
                        <small>
                          <a href={p.source_url} target="_blank" rel="noreferrer">
                            Publisher profile ↗
                          </a>
                        </small>
                      )}
                      <small>
                        <Link href={`/basketball/ncaa-rankings/?season=2026&q=${encodeURIComponent(p.name)}`}>
                          Search NCAA source board →
                        </Link>
                      </small>
                      <button
                        className="button secondary recruiting-pick"
                        type="button"
                        aria-pressed={picks.includes(p.id)}
                        onClick={() => togglePick(p.id)}
                        title={picks.length >= 12 && !picks.includes(p.id) ? "Watch list limit reached" : undefined}
                        disabled={picks.length >= 12 && !picks.includes(p.id)}
                      >
                        {picks.includes(p.id) ? "Remove from watch list" : "Add to watch list"}
                      </button>
                    </td>
                    <td>
                      <Link href={`/basketball/programs/${p.team_id}/`}>
                        {p.team}
                      </Link>
                    </td>
                    <td>{p.previous_teams.join(", ") || "Not observed"}</td>
                    <td>{labels[p.status]}</td>
                    <td>{p.class_year || "—"}</td>
                    {sort === "prior_index" && (
                      <td className="numeric">
                        {productionIndex.get(`${p.id}-${p.team_id}`)?.score == null
                          ? "—"
                          : productionIndex.get(`${p.id}-${p.team_id}`)!.score!.toFixed(2)}
                        <small>{productionIndex.get(`${p.id}-${p.team_id}`)?.components ?? 0} components</small>
                      </td>
                    )}
                    <td>
                      {p.prior_production ? (
                        <>
                          {p.prior_production.minutes.toLocaleString()} min · {p.prior_production.games} GP
                          <small>
                            {p.prior_production.ppg == null ? "—" : p.prior_production.ppg.toFixed(1)} PPG · {p.prior_production.mpg == null ? "—" : p.prior_production.mpg.toFixed(1)} MPG
                          </small>
                          <small>
                            {p.prior_production.ts == null ? "—" : `${(p.prior_production.ts * 100).toFixed(1)}%`} TS · {p.prior_production.efg == null ? "—" : `${(p.prior_production.efg * 100).toFixed(1)}%`} eFG · {p.prior_production.apg == null ? "—" : p.prior_production.apg.toFixed(1)} AST/G
                          </small>
                          <small>
                            {p.prior_production.box_bpm == null ? "—" : p.prior_production.box_bpm.toFixed(1)} Box BPM · publisher-attributed
                          </small>
                          <PriorProductionDetails production={p.prior_production} />
                        </>
                      ) : "No prior recorded stats"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!rows.length && (
            <p className="empty">
              No records match this view. Zero observed changes does not
              establish that no transfers occurred.
            </p>
          )}
          <div className="pagination">
            <span>
              {rows.length.toLocaleString()} records · page {page + 1} of{" "}
              {Math.max(1, Math.ceil(rows.length / 40))}
            </span>
            <div>
              <button
                className="button secondary"
                disabled={!page}
                onClick={() => setPage(page - 1)}
              >
                ← Previous
              </button>
              <button
                className="button secondary"
                disabled={(page + 1) * 40 >= rows.length}
                onClick={() => setPage(page + 1)}
              >
                Next →
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
