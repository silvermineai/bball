"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { BBPlayer } from "../../_lib/basketball-types";
import { useBasketballRelease } from "../../_components/useBasketballRelease";
import { fmt } from "../../_lib/format";
import { downloadCsv, toCsv } from "../../_lib/csv";
import { comparisonHref } from "../../_lib/player-comparison";
import {
  rankProduction,
  seasonLabel,
  type CareerCoverage,
  type CareerCatalog,
} from "../../_lib/careers";
import {
  parsePlayerIndexFilters,
  playerIndexFilterSearch,
  type PlayerIndexSort,
} from "../../_lib/player-index-view";
export default function Players({ catalog }: { catalog: CareerCatalog }) {
  const defaultSeason = catalog.seasons.some((s) => s.season === 2026)
    ? "2026"
    : String(catalog.seasons[0]?.season ?? 2026);
  const [season, setSeason] = useState(defaultSeason);
  const [q, setQ] = useState(""),
    [sort, setSort] = useState<PlayerIndexSort>("ppg"),
    [qualified, setQualified] = useState(true),
    [page, setPage] = useState(0),
    [copied, setCopied] = useState(""),
    [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    const filters = parsePlayerIndexFilters(
      window.location.search,
      catalog.seasons.map((s) => s.season),
    );
    setSeason(filters.season);
    setQ(filters.query);
    setSort(filters.sort);
    setQualified(filters.qualified);
    setPage(filters.page);
    setHydrated(true);
  }, [catalog]);
  useEffect(() => {
    if (!hydrated) return;
    const url = new URL(window.location.href);
    url.search = playerIndexFilterSearch({
      season,
      query: q,
      sort,
      qualified,
      page,
    });
    window.history.replaceState(window.history.state, "", url);
  }, [hydrated, page, q, qualified, season, sort]);
  const coverage = catalog.seasons.find((s) => String(s.season) === season);
  const { data, error } = useBasketballRelease<{
    season: number;
    players: BBPlayer[];
    coverage?: CareerCoverage;
  }>(`history/players-${coverage ? season : "unsupported"}`);
  const sortKey = sort as
    | "ppg"
    | "rpg"
    | "apg"
    | "ts"
    | "mpg"
    | "spg"
    | "bpg"
    | "efg"
    | "three_pct"
    | "ft_rate"
    | "three_rate"
    | "tov_rate";
  const rows = rankProduction(
    (data?.season === +season ? data.players : []).filter(
      (p) => !qualified || p.qualified,
    ),
    (p) => p[sortKey],
  ).filter((p) =>
    (p.name + " " + p.team).toLowerCase().includes(q.toLowerCase()),
  );
  return (
    <>
      <div className="strip">
        <div>
          <strong>{catalog.seasons.length}</strong>
          <span>Source seasons · coverage varies</span>
        </div>
        <div>
          <strong>{catalog.player_ids.toLocaleString()}</strong>
          <span>Distinct archived source identities</span>
        </div>
        <div>
          <strong>{coverage?.appearance_games.toLocaleString() ?? "—"}</strong>
          <span>Selected season · games with playing records</span>
        </div>
        <div>
          <strong>
            {coverage?.completed_schedule_games.toLocaleString() ?? "—"}
          </strong>
          <span>Selected season · completed schedule entries</span>
        </div>
      </div>
      <div className="toolbar">
        <label className="control">
          <span>STAT SEASON</span>
          <select
            value={season}
            onChange={(e) => {
              setSeason(e.target.value);
              setPage(0);
            }}
          >
            {!coverage && <option value={season}>Unsupported season</option>}
            {catalog.seasons.map((s) => (
              <option key={s.season} value={s.season}>
                {seasonLabel(s.season)} ·{" "}
                {s.player_team_entries.toLocaleString()} player/program records
              </option>
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
            placeholder="Search players"
          />
        </label>
        <label className="control">
          <span>SORT</span>
          <select
            value={sort}
            onChange={(e) => {
              setSort(e.target.value as PlayerIndexSort);
              setPage(0);
            }}
          >
            <option value="ppg">Points per game</option>
            <option value="rpg">Rebounds per game</option>
            <option value="apg">Assists per game</option>
            <option value="ts">True shooting</option>
            <option value="mpg">Minutes per game</option>
            <option value="spg">Steals per game</option>
            <option value="bpg">Blocks per game</option>
            <option value="efg">Effective FG%</option>
            <option value="three_pct">Three-point FG%</option>
            <option value="ft_rate">Free-throw attempt rate</option>
            <option value="three_rate">Three-point attempt share</option>
            <option value="tov_rate">Turnover rate · lower is better</option>
          </select>
        </label>
      </div>
      <label className="note">
        <input
          type="checkbox"
          checked={qualified}
          onChange={(e) => {
            setQualified(e.target.checked);
            setPage(0);
          }}
        />{" "}
        At least 15 games and 400 minutes, with complete box-score fields
      </label>
      <div className="button-row" style={{ marginTop: 12 }}>
        <button
          className="button secondary"
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(window.location.href);
              setCopied("Player index link copied.");
            } catch {
              setCopied("Copy the filtered URL from your address bar.");
            }
          }}
        >
          Copy player index link
        </button>
        {copied && <span className="note" role="status">{copied}</span>}
      </div>
      <p className="note" style={{ marginBottom: 20 }}>
        TS uses PTS / [2 × (FGA + 0.475 FTA)]. This is an estimate; the college
        free-throw coefficient differs from the commonly used NBA 0.44.
        FTR is FTA / FGA, 3PA rate is 3PA / FGA, and TO rate is TOV / (FGA +
        0.475 FTA + TOV). Incomplete totals remain unavailable. Stat ranks use
        this season and qualification setting before search filters; ties share
        rank. The source includes some opponents outside Division I.
      </p>
      {coverage &&
        coverage.appearance_games < coverage.completed_schedule_games * 0.8 && (
          <p className="career-coverage-warning">
            Sparse source coverage: only{" "}
            {coverage.appearance_games.toLocaleString()} games with recorded
            player appearances against{" "}
            {coverage.completed_schedule_games.toLocaleString()} completed
            schedule entries. Treat these as partial samples, not full-season
            rankings.
          </p>
        )}
      <details className="career-coverage-details">
        <summary>Archive coverage by season</summary>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Season</th>
                <th>Identified box rows</th>
                <th>Games with playing records</th>
                <th>Completed schedule</th>
                <th>Missing identities</th>
              </tr>
            </thead>
            <tbody>
              {catalog.seasons.map((s) => (
                <tr key={s.season}>
                  <td>{seasonLabel(s.season)}</td>
                  <td>{s.identified_rows.toLocaleString()}</td>
                  <td>{s.appearance_games.toLocaleString()}</td>
                  <td>{s.completed_schedule_games.toLocaleString()}</td>
                  <td>{s.missing_identity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data?.coverage?.field_coverage && data.season === Number(season) && <>
          <p className="note" style={{ marginTop: 18 }}>Field completeness uses every identified source row, then shows the subset of rows with a recorded playing appearance. A blank or null source field remains unavailable; a recorded zero counts as observed.</p>
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr><th>Field</th><th className="numeric">Source observed</th><th className="numeric">Source share</th><th className="numeric">Appearance observed</th><th className="numeric">Appearance share</th></tr></thead>
              <tbody>{Object.entries(data.coverage.field_coverage).map(([field, value]) => <tr key={field}><th>{field}</th><td className="numeric">{value.source_observed.toLocaleString()} / {value.source_rows.toLocaleString()}</td><td className="numeric">{value.source_share == null ? "—" : `${(value.source_share * 100).toFixed(1)}%`}</td><td className="numeric">{value.appearance_observed.toLocaleString()} / {value.appearance_rows.toLocaleString()}</td><td className="numeric">{value.appearance_share == null ? "—" : `${(value.appearance_share * 100).toFixed(1)}%`}</td></tr>)}</tbody>
            </table>
          </div>
        </>}
      </details>
      {error ? (
        <p role="alert" className="status-error">
          {error}
        </p>
      ) : !data || data.season !== +season ? (
        <p role="status" className="empty">
          Loading player statistics…
        </p>
      ) : (
        <>
          <div className="section-heading" style={{ marginTop: 20 }}>
            <p>
              {rows.length.toLocaleString()} matching player/program records ·
              export respects the selected season, search, sort and qualification
              filter
            </p>
            <div className="button-row">
              <button
                className="button secondary"
                type="button"
                onClick={() =>
                  downloadCsv(
                    `basketball-players-${season}.csv`,
                    toCsv(
                      [
                        "Stat rank",
                        "Player",
                        "NCAA ID",
                        "Program",
                        "Position",
                        "Games",
                        "Minutes per game",
                        "Points per game",
                        "Rebounds per game",
                        "Assists per game",
                        "Steals per game",
                        "Blocks per game",
                        "Effective FG%",
                        "True shooting %",
                        "Three-point FG%",
                        "Free-throw attempt rate",
                        "Three-point attempt share",
                        "Turnover rate",
                      ],
                      rows.map((p) => [
                        p.statRank,
                        p.name,
                        p.id,
                        p.team,
                        p.position,
                        p.games,
                        p.mpg,
                        p.ppg,
                        p.rpg,
                        p.apg,
                        p.spg,
                        p.bpg,
                        p.efg == null ? null : p.efg * 100,
                        p.ts == null ? null : p.ts * 100,
                        p.three_pct == null ? null : p.three_pct * 100,
                        p.ft_rate == null ? null : p.ft_rate * 100,
                        p.three_rate == null ? null : p.three_rate * 100,
                        p.tov_rate == null ? null : p.tov_rate * 100,
                      ]),
                    ),
                  )
                }
              >
                Download CSV ↓
              </button>
              {coverage && (
                <a
                  className="button secondary"
                  href={`/api/basketball/research/careers/source?season=${encodeURIComponent(season)}`}
                >
                  Download source parquet ↓
                </a>
              )}
            </div>
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Stat rank</th>
                  <th>Player / program</th>
                  <th>Pos.</th>
                  {[
                    "GP",
                    "MIN/G",
                    "PTS/G",
                    "REB/G",
                    "AST/G",
                    "STL/G",
                    "BLK/G",
                    "eFG%",
                    "TS%",
                    "3P%",
                    "FTR",
                    "3PA rate",
                    "TO rate",
                  ].map((k) => (
                    <th className="numeric" key={k}>
                      {k}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(page * 40, page * 40 + 40).map((p) => (
                  <tr key={`${p.id}-${p.team_id}`}>
                    <td className="rank-number">{p.statRank ?? "—"}</td>
                    <td>
                      <Link
                        href={`/basketball/player/?id=${p.id}&season=${season}`}
                      >
                        {p.name}
                      </Link>
                      <small>{p.team}</small>
                      <small>
                        <Link href={comparisonHref(p)}>
                          Compare this season →
                        </Link>
                      </small>
                    </td>
                    <td>{p.position || "—"}</td>
                    {[
                      p.games,
                      p.mpg,
                      p.ppg,
                      p.rpg,
                      p.apg,
                      p.spg,
                      p.bpg,
                      ...[
                        p.efg,
                        p.ts,
                        p.three_pct,
                        p.ft_rate,
                        p.three_rate,
                        p.tov_rate,
                      ].map((n) =>
                        n == null ? null : n * 100,
                      ),
                    ].map((v, i) => (
                      <td className="numeric" key={i}>
                        {fmt(v, i === 0 ? 0 : 1)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!rows.length && (
            <p className="empty">No players match these filters.</p>
          )}
          <div className="pagination">
            <span>
              {rows.length.toLocaleString()} player/program records · page{" "}
              {page + 1} of {Math.max(1, Math.ceil(rows.length / 40))}
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
