"use client";

import { useEffect, useMemo, useState } from "react";
import { downloadCsv, toCsv } from "../../_lib/csv";

export type StandingStat = {
  label: string;
  display: string | null;
  value: number | string | null;
};

export type StandingTeam = {
  season: number;
  group_id: string;
  group_name: string | null;
  group_short_name: string | null;
  team_id: string;
  team_name: string;
  team_short_name: string | null;
  team_abbreviation: string | null;
  stats: Record<string, StandingStat>;
};

type SortKey = "wins" | "winPercent" | "leagueWinPercent" | "pointDifferential" | "avgPointsFor" | "avgPointsAgainst";
const sortLabels: Record<SortKey, string> = {
  wins: "Overall wins",
  winPercent: "Overall win percentage",
  leagueWinPercent: "Conference win percentage",
  pointDifferential: "Point differential",
  avgPointsFor: "Points per game",
  avgPointsAgainst: "Opponent points per game",
};
const numberValue = (row: StandingTeam, key: string) => {
  const value = row.stats[key]?.value;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
};

export default function StandingsBrowser({
  teams,
  seasons,
  sourceBySeason,
}: {
  teams: StandingTeam[];
  seasons: number[];
  sourceBySeason: Record<number, string | null>;
}) {
  const latest = seasons[0] ?? 2026;
  const params = typeof window === "undefined" ? null : new URLSearchParams(window.location.search);
  const initialSeason = Number(params?.get("season"));
  const [season, setSeason] = useState(seasons.includes(initialSeason) ? initialSeason : latest);
  const [conference, setConference] = useState(params?.get("conference") || "all");
  const [query, setQuery] = useState(params?.get("q") || "");
  const initialSort = params?.get("sort") as SortKey | null;
  const [sort, setSort] = useState<SortKey>(initialSort && initialSort in sortLabels ? initialSort : "wins");
  const [page, setPage] = useState(0);

  const seasonRows = useMemo(() => teams.filter((row) => row.season === season), [teams, season]);
  const conferences = useMemo(
    () => [...new Set(seasonRows.map((row) => row.group_name).filter((name): name is string => Boolean(name)))].sort((a, b) => a.localeCompare(b)),
    [seasonRows],
  );
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return seasonRows
      .filter((row) => (conference === "all" || row.group_name === conference) && (!needle || `${row.team_name} ${row.team_short_name || ""} ${row.group_name || ""}`.toLowerCase().includes(needle)))
      .sort((a, b) => {
        const av = numberValue(a, sort);
        const bv = numberValue(b, sort);
        if (av == null && bv != null) return 1;
        if (av != null && bv == null) return -1;
        if (av != null && bv != null && bv !== av) return bv - av;
        return a.team_name.localeCompare(b.team_name) || a.team_id.localeCompare(b.team_id);
      });
  }, [conference, query, seasonRows, sort]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / 40));
  const visible = filtered.slice(page * 40, (page + 1) * 40);
  useEffect(() => {
    if (page >= pageCount) setPage(Math.max(0, pageCount - 1));
  }, [page, pageCount]);
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("season", String(season));
    if (conference === "all") url.searchParams.delete("conference"); else url.searchParams.set("conference", conference);
    if (query.trim()) url.searchParams.set("q", query.trim()); else url.searchParams.delete("q");
    if (sort === "wins") url.searchParams.delete("sort"); else url.searchParams.set("sort", sort);
    window.history.replaceState(window.history.state, "", url);
  }, [conference, query, season, sort]);
  const stat = (row: StandingTeam, key: string) => row.stats[key]?.display || "—";
  const source = sourceBySeason[season];
  return (
    <>
      <div className="toolbar">
        <label className="control"><span>SEASON</span><select value={season} onChange={(event) => { setSeason(Number(event.target.value)); setConference("all"); setPage(0); }}>{seasons.map((value) => <option key={value} value={value}>{value - 1}–{String(value).slice(-2)}</option>)}</select></label>
        <label className="control"><span>CONFERENCE</span><select value={conference} onChange={(event) => { setConference(event.target.value); setPage(0); }}><option value="all">All conferences</option>{conferences.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <label className="control"><span>SEARCH</span><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} placeholder="Team or conference" /></label>
        <label className="control"><span>ORDER BY</span><select value={sort} onChange={(event) => { setSort(event.target.value as SortKey); setPage(0); }}>{Object.entries(sortLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <button className="button secondary" type="button" onClick={() => downloadCsv(`basketball-standings-${season}.csv`, toCsv(["Season", "Conference", "Team", "Overall record", "Conference record", "Win %", "Conference win %", "PPG", "Opp PPG", "Point differential"], filtered.map((row) => [season, row.group_name, row.team_name, stat(row, "overall"), stat(row, "vs. Conf."), stat(row, "winPercent"), stat(row, "leagueWinPercent"), stat(row, "avgPointsFor"), stat(row, "avgPointsAgainst"), stat(row, "pointDifferential")])))}>Download CSV ↓</button>
      </div>
      <p className="note">{filtered.length.toLocaleString()} source team records · page {page + 1} of {pageCount}. These are publisher standings snapshots, not Silvermine forecast inputs. {source && <a href={source} target="_blank" rel="noreferrer">Open the exact source release ↗</a>}</p>
      <div className="table-scroll">
        <table className="data-table">
          <thead><tr><th>Rank</th><th>Team</th><th>Conference</th><th>Overall</th><th>Conf.</th><th className="numeric">Win %</th><th className="numeric">Conf. Win %</th><th className="numeric">PPG</th><th className="numeric">Opp PPG</th><th className="numeric">Diff.</th></tr></thead>
          <tbody>{visible.map((row, index) => <tr key={`${row.season}-${row.group_id}-${row.team_id}`}><td className="rank-number">{page * 40 + index + 1}</td><td><a href={`/basketball/programs/${row.team_id}/`}>{row.team_name}</a><small>{row.team_short_name || row.team_abbreviation || row.team_id}</small></td><td>{row.group_name || "—"}</td><td>{stat(row, "overall")}</td><td>{stat(row, "vs. Conf.")}</td><td className="numeric">{stat(row, "winPercent")}</td><td className="numeric">{stat(row, "leagueWinPercent")}</td><td className="numeric">{stat(row, "avgPointsFor")}</td><td className="numeric">{stat(row, "avgPointsAgainst")}</td><td className="numeric">{stat(row, "pointDifferential")}</td></tr>)}</tbody>
        </table>
      </div>
      {!visible.length && <p className="empty">No source standings match these filters.</p>}
      <div className="pagination"><span>{filtered.length.toLocaleString()} matching team records</span><div><button className="button secondary" disabled={!page} onClick={() => setPage(page - 1)}>← Previous</button><button className="button secondary" disabled={page + 1 >= pageCount} onClick={() => setPage(page + 1)}>Next →</button></div></div>
    </>
  );
}
