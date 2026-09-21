"use client";

import { useEffect, useMemo, useState } from "react";
import { parseWomensLowerDivisionEdition, type WomensLowerDivisionEdition, type WomensLowerDivisionStatistic } from "../_lib/womens-lower-division-integrity";
import { filterWomensLowerDivisionRows, lowerDivisionCellValue, LOWER_DIVISION_PAGE_SIZE, paginateWomensLowerDivisionRows, summarizeWomensLowerDivisionTeams, type LowerDivisionRow } from "../_lib/womens-lower-division-view";
import { downloadCsv, toCsv, type CsvCell } from "../_lib/csv";

type Row = LowerDivisionRow & { team_source_path?: string };
type Statistic = WomensLowerDivisionStatistic & { rows: Row[] };
type Edition = WomensLowerDivisionEdition;

const number = (value: unknown) => value == null || value === "" ? "—" : typeof value === "number" ? Number.isInteger(value) ? value.toLocaleString() : value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : String(value);

export default function WomensLowerDivisionStats({ division }: { division: "2" | "3" }) {
  const [edition, setEdition] = useState<Edition | null>(null);
  const [integrityError, setIntegrityError] = useState<string | null>(null);
  const [kind, setKind] = useState<"individual" | "team" | "team-summary">("individual");
  const [statistic, setStatistic] = useState("");
  const [query, setQuery] = useState("");
  const [minimumGames, setMinimumGames] = useState("0");
  const [page, setPage] = useState(0);
  useEffect(() => {
    fetch("/data/basketball/womens-lower-division-stats.json")
      .then((response) => response.ok ? response.json() : null)
      .then((value: unknown) => {
        if (value == null) return;
        try {
          setEdition(parseWomensLowerDivisionEdition(value));
          setIntegrityError(null);
        } catch (error) {
          setEdition(null);
          setIntegrityError(error instanceof Error ? error.message : "The lower-division release failed integrity validation.");
        }
      })
      .catch(() => setEdition(null));
  }, []);
  const current = edition?.divisions?.[division];
  const sourceKind = kind === "team-summary" ? "team" : kind;
  const options = current?.[sourceKind] || [];
  const selected = options.find((item) => item.statistic === statistic) || options[0];
  const teamSummaries = useMemo(
    () => summarizeWomensLowerDivisionTeams((current?.team || []) as Statistic[], Number(minimumGames) || 0),
    [current, minimumGames],
  );
  const matchingTeamSummaries = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return teamSummaries.filter((team) => !needle || `${team.team} ${team.team_source_path} ${team.name_variants.join(" ")}`.toLowerCase().includes(needle));
  }, [query, teamSummaries]);
  const matchingRows = useMemo(
    () => filterWomensLowerDivisionRows((selected?.rows || []) as Row[], query, Number(minimumGames) || 0),
    [selected, query, minimumGames],
  );
  const rows = useMemo(() => paginateWomensLowerDivisionRows(matchingRows, page), [matchingRows, page]);
  const exportRows = useMemo(
    () => matchingRows.map((row) => selected?.headers.map((header) => {
      const value = lowerDivisionCellValue(row, header);
      return value == null ? null : typeof value === "string" || typeof value === "number" ? value : String(value);
    }) as CsvCell[] || []),
    [matchingRows, selected],
  );
  useEffect(() => {
    if (options.length && !options.some((item) => item.statistic === statistic)) setStatistic(options[0].statistic);
  }, [options, statistic]);
  useEffect(() => setPage(0), [division, kind, statistic, query, minimumGames]);
  const teamSummaryExportRows = matchingTeamSummaries.map((team) => [
    team.team,
    team.team_source_path,
    team.appearances,
    team.statistics.length,
    team.best_source_rank,
    team.statistics.map((stat) => `${stat.label} (${stat.rows})`).join("; "),
  ]);
  return <section className="field-card" aria-labelledby="wbb-lower-stats-title" style={{ marginTop: 18 }}>
    <div className="eyebrow">SOURCE-NATIVE LOWER DIVISION · WOMEN&apos;S D{division}</div>
    <h2 id="wbb-lower-stats-title">D{division} leaderboards are now visible</h2>
    {!current ? <p className={integrityError ? "status-error" : "muted"}>{integrityError || "Loading the lower-division stat tables…"}</p> : <>
      <p className="note">These current-season tables are explicitly scoped by the published D{division} route. The retained rows include athlete names and team slugs but no stable athlete IDs, so they stay separate from identity-linked player and forecast editions. {current.identity_note}</p>
      <div className="division-player-controls">
        <label htmlFor="wbb-lower-kind">TABLE TYPE</label>
        <select id="wbb-lower-kind" value={kind} onChange={(event) => setKind(event.target.value as "individual" | "team" | "team-summary")}><option value="individual">Individual leaders</option><option value="team">Team metrics</option><option value="team-summary">Team coverage index</option></select>
        {kind === "team-summary" ? <span className="note">Groups only by the exact source team path.</span> : <><label htmlFor="wbb-lower-stat">STATISTIC</label>
        <select id="wbb-lower-stat" value={selected?.statistic || ""} onChange={(event) => setStatistic(event.target.value)}>{options.map((item) => <option key={item.statistic} value={item.statistic}>{item.label}</option>)}</select></>}
        <label htmlFor="wbb-lower-search">SEARCH ROWS</label>
        <input id="wbb-lower-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Player or team" />
        <label htmlFor="wbb-lower-min-games">MINIMUM GAMES</label>
        <select id="wbb-lower-min-games" value={minimumGames} onChange={(event) => setMinimumGames(event.target.value)}><option value="0">Any recorded games</option><option value="5">5+</option><option value="10">10+</option><option value="20">20+</option></select>
      </div>
      {kind === "team-summary" ? <><div className="scope-snapshot-counts"><strong>{matchingTeamSummaries.length.toLocaleString()}</strong><span>matching source teams</span><strong>{current.team.length.toLocaleString()}</strong><span>team leaderboards</span><strong>{teamSummaries.reduce((sum, team) => sum + team.appearances, 0).toLocaleString()}</strong><span>retained appearances</span></div>
        <div className="section-heading" style={{ marginTop: 14 }}><p className="note">This index groups rows only when NCAA.com provides the same exact team URL path. It describes leaderboard coverage; it is not a composite rating or identity join.</p><button className="button secondary" type="button" onClick={() => downloadCsv(`womens-d${division}-team-coverage-index.csv`, toCsv(["Team", "Source team path", "Leaderboard appearances", "Distinct statistics", "Best source rank", "Statistics"], teamSummaryExportRows as CsvCell[][]))} disabled={!matchingTeamSummaries.length}>Download team index CSV ↓</button></div>
        <div className="table-scroll"><table className="data-table"><thead><tr><th>Team</th><th>Source team path</th><th className="numeric">Leaderboard appearances</th><th className="numeric">Distinct statistics</th><th className="numeric">Best source rank</th><th>Retained statistics</th></tr></thead><tbody>{matchingTeamSummaries.map((team) => <tr key={team.team_source_path}><th scope="row">{team.team}<small>{team.name_variants.length > 1 ? `${team.name_variants.length} source name variants` : "Source name stable in retained rows"}</small></th><td><code>{team.team_source_path}</code></td><td className="numeric">{team.appearances.toLocaleString()}</td><td className="numeric">{team.statistics.length.toLocaleString()}</td><td className="numeric">{team.best_source_rank == null ? "—" : `#${team.best_source_rank}`}</td><td><details><summary>Open {team.statistics.length} source tables</summary><div className="note">{team.statistics.map((stat) => <div key={stat.statistic}>{stat.label} · {stat.rows} row{stat.rows === 1 ? "" : "s"} · best source rank {stat.best_source_rank == null ? "—" : `#${stat.best_source_rank}`}</div>)}</div></details></td></tr>)}</tbody></table></div>
        {!matchingTeamSummaries.length ? <p className="empty">No source teams match this search and threshold.</p> : null}
      </> : selected ? <><div className="scope-snapshot-counts"><strong>{matchingRows.length.toLocaleString()}</strong><span>matching rows</span><strong>{options.length.toLocaleString()}</strong><span>{kind} statistics</span><strong>{selected.through_games || current.through_games || "—"}</strong><span>through games</span></div>
        <div className="section-heading" style={{ marginTop: 14 }}><p className="note">Showing {rows.length.toLocaleString()} rows on this page; the export includes all {matchingRows.length.toLocaleString()} filtered rows.</p><button className="button secondary" type="button" onClick={() => downloadCsv(`womens-d${division}-${kind}-${selected.statistic}-filtered.csv`, toCsv(selected.headers, exportRows))} disabled={!matchingRows.length}>Download filtered CSV ↓</button></div>
        <div className="table-scroll"><table className="data-table"><thead><tr>{selected.headers.map((header) => <th key={header} className={header === "Rank" || ["PPG", "RPG", "APG", "SPG", "BPG", "MPG", "FG%", "3P%", "FT%"].includes(header) ? "numeric" : ""}>{header}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={`${selected.statistic}-${String(row.rank ?? index)}-${String(row.name ?? row.team ?? index)}`}>{selected.headers.map((header) => { const value = lowerDivisionCellValue(row, header); return <td key={header} className={header === "Rank" || ["PPG", "RPG", "APG", "SPG", "BPG", "MPG", "FG%", "3P%", "FT%"].includes(header) ? "numeric" : ""}>{number(value)}</td>; })}</tr>)}</tbody></table></div>
        {matchingRows.length > LOWER_DIVISION_PAGE_SIZE ? <div className="pagination" aria-label={`Women’s D${division} source rows pages`}><span>Page {page + 1} of {Math.ceil(matchingRows.length / LOWER_DIVISION_PAGE_SIZE)} · showing {page * LOWER_DIVISION_PAGE_SIZE + 1}–{page * LOWER_DIVISION_PAGE_SIZE + rows.length}</span><div><button className="button secondary" type="button" disabled={page === 0} onClick={() => setPage((currentPage) => Math.max(0, currentPage - 1))}>← Previous</button><button className="button secondary" type="button" disabled={(page + 1) * LOWER_DIVISION_PAGE_SIZE >= matchingRows.length} onClick={() => setPage((currentPage) => currentPage + 1)}>Next →</button></div></div> : null}
      </> : <p className="empty">No lower-division rows were retained for this table.</p>}
      <p className="muted">Integrity check passed for {edition.receipts.length.toLocaleString()} source receipts and {edition.divisions[division].individual.length + edition.divisions[division].team.length} statistic tables. No player ranking, forecast, or identity join is created from a name-only row.</p>
    </>}
  </section>;
}
