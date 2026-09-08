"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { fmt } from "../../_lib/format";
import {
  verifyPlayerIndex,
  type PlayerCatalog,
} from "../../_lib/football-player-history";
import {
  hasRankedProduction,
  footballPlayerCategories,
  footballEventDataset,
  footballPlayerFilterSearch,
  parseFootballPlayerFilters,
  productionForCategory,
  type FootballPlayerCategory,
  type FootballPlayerDivision,
} from "../../_lib/football-player-view";
type Production = {
  plays: number | null;
  yards: number | null;
  epa: number | null;
  epa_per_play: number | null;
  touchdowns: number | null;
  rank: number | null;
};
type Player = {
  id: string;
  team_id: string;
  name: string;
  team: string;
  conference: string;
  division: string;
  season: number;
  categories: string[];
  box_games: number;
  production: Record<string, Production>;
};
type Board = {
  players: Player[];
  season: number;
  rankings: Record<string, { minimum_plays: number; qualified: number }>;
};
export default function PlayerBrowser({ catalog }: { catalog: PlayerCatalog }) {
  const defaultSeason = catalog.seasons.some((s) => s.season === 2025)
    ? "2025"
    : String(catalog.seasons[0]?.season ?? 2025);
  const [season, setSeason] = useState(defaultSeason),
    [category, setCategory] = useState<FootballPlayerCategory>("passing"),
    [division, setDivision] = useState<FootballPlayerDivision>("fbs"),
    [query, setQuery] = useState(""),
    [qualified, setQualified] = useState(false),
    [page, setPage] = useState(0),
    [data, setData] = useState<Board | null>(null),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0),
    [copied, setCopied] = useState(""),
    [hydrated, setHydrated] = useState(false);
  const coverage = catalog.seasons.find((s) => String(s.season) === season);
  const eventDataset = footballEventDataset(category);
  useEffect(() => {
    const parsed = parseFootballPlayerFilters(
      window.location.search,
      catalog.seasons.map((s) => s.season),
    );
    setSeason(parsed.season);
    setCategory(parsed.category);
    setDivision(parsed.division);
    setQuery(parsed.query);
    setQualified(parsed.qualified);
    setPage(parsed.page);
    setHydrated(true);
  }, [catalog]);
  useEffect(() => {
    if (!hydrated) return;
    const url = new URL(window.location.href);
    url.search = footballPlayerFilterSearch({
      season,
      category,
      division,
      query,
      qualified,
      page,
    });
    window.history.replaceState(window.history.state, "", url);
  }, [hydrated, season, category, division, query, qualified, page]);
  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError("");
    if (eventDataset) {
      setData(null);
      return;
    }
    if (!catalog.seasons.some((s) => String(s.season) === season)) {
      setError("Choose a supported stat season.");
      return;
    }
    fetch(`/data/football/players-${season}.json`, {
      signal: controller.signal,
    })
      .then((r) => {
        if (!r.ok) throw Error("Player data is unavailable. Please reload.");
        return r.arrayBuffer();
      })
      .then((bytes) => verifyPlayerIndex(bytes, +season, catalog))
      .then((value) => {
        if (!controller.signal.aborted) setData(value);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => controller.abort();
  }, [season, retry, catalog, eventDataset]);
  const rows = (data?.season === +season ? data.players : []).filter(
    (p) =>
      (p.name + " " + p.team + " " + p.conference)
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (division === "all" || p.division === division) &&
      (category === "all" || p.categories.includes(category)) &&
      (!qualified || hasRankedProduction(p, category)),
  );
  rows.sort(
    (a, b) =>
      (productionForCategory(a, category)?.stats.rank ?? 999999) -
        (productionForCategory(b, category)?.stats.rank ?? 999999) ||
      a.name.localeCompare(b.name),
  );
  const minimum = data?.rankings[category]?.minimum_plays;
  return (
    <>
      <div className="strip">
        <div>
          <strong>
            {coverage?.player_team_records.toLocaleString() ?? "—"}
          </strong>
          <span>Player/program records · selected season</span>
        </div>
        <div>
          <strong>{coverage?.box_rows.toLocaleString() ?? "—"}</strong>
          <span>Retained box-score category rows</span>
        </div>
        <div>
          <strong>{coverage?.box_games.toLocaleString() ?? "—"}</strong>
          <span>Games represented in player boxes</span>
        </div>
        <div>
          <strong>
            {coverage?.excluded_team_placeholder_entries.toLocaleString() ??
              "—"}
          </strong>
          <span>Team placeholder entries excluded from players</span>
        </div>
      </div>
      <div className="toolbar">
        <label className="control">
          <span>PLAYER, TEAM OR CONFERENCE</span>
          <input
            type="search"
            placeholder="Search the player index"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
          />
        </label>
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
                {s.season}
                {s.season === 2026 ? " · Partial season" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="control">
          <span>CATEGORY</span>
          <select
            value={category}
            onChange={(e) => {
              setCategory(e.target.value as FootballPlayerCategory);
              setQualified(false);
              setPage(0);
            }}
          >
            <option value="all">All players</option>
            {footballPlayerCategories.filter((c) => c !== "all").map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="control">
          <span>DIVISION</span>
          <select
            value={division}
            onChange={(e) => {
              setDivision(e.target.value as FootballPlayerDivision);
              setPage(0);
            }}
          >
            <option value="fbs">FBS</option>
            <option value="all">All imported divisions</option>
          </select>
        </label>
      </div>
      <div className="button-row" style={{ marginTop: 12 }}>
        <button
          className="button secondary"
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(window.location.href);
              setCopied("Player board link copied.");
            } catch {
              setCopied("Copy the filtered URL from your address bar.");
            }
          }}
        >
          Copy player board link
        </button>
        {copied && <span role="status" className="note">{copied}</span>}
      </div>
      {minimum && (
        <label
          style={{
            fontSize: 12,
            display: "flex",
            gap: 10,
            alignItems: "center",
          }}
        >
          <input
            type="checkbox"
            checked={qualified}
            onChange={(e) => {
              setQualified(e.target.checked);
              setPage(0);
            }}
          />
          Show ranked players only (FBS, at least {minimum} plays)
        </label>
      )}
      <p className="note" style={{ marginBottom: 20 }}>
        Ranked by total EPA within{" "}
        {category === "all"
          ? "the best available ranked category per player"
          : category}. Team
        affiliations reflect {season} production and do not establish current
        rosters.{" "}
        {season === "2026"
          ? "Early-season samples are incomplete."
          : "Historical coverage varies by division and category."}{" "}
        A dash means unranked or unavailable, never zero.
      </p>
      {eventDataset ? (
        <section className="section paper-panel">
          <div className="eyebrow">Source event handoff</div>
          <h2>This category belongs in the event notebook.</h2>
          <p>
            The imported {category} records contain source names, team labels
            and game context, but no stable athlete ID. They stay separate from
            this identified player index, so an empty player production cell is
            never treated as zero or joined by name.
          </p>
          <p>
            <Link href={`/football/events/?dataset=${eventDataset}`}>
              Open the {eventDataset === "defense" ? "defensive" : "specialist"} event notebook →
            </Link>
          </p>
        </section>
      ) : error ? (
        <div role="alert" className="status-error">
          {error}{" "}
          <button
            className="button secondary"
            onClick={() => setRetry(retry + 1)}
          >
            Retry player statistics
          </button>
        </div>
      ) : !data || data.season !== +season ? (
        <p role="status" className="empty">
          Loading player records…
        </p>
      ) : (
        <>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>EPA rank</th>
                  <th>Player / team</th>
                  <th>Category</th>
                  <th className="numeric">Box games</th>
                  <th className="numeric">Plays</th>
                  <th className="numeric">Yards</th>
                  <th className="numeric">TD</th>
                  <th className="numeric">Total EPA</th>
                  <th className="numeric">EPA / play</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(page * 40, page * 40 + 40).map((p) => {
                  const selected = productionForCategory(p, category),
                    s = selected?.stats;
                  return (
                    <tr key={`${p.id}-${p.team_id}`}>
                      <td className="rank-number">{s?.rank ?? "—"}</td>
                      <td>
                        <Link
                          href={`/football/player/?id=${p.id}&season=${season}`}
                        >
                          {p.name}
                        </Link>
                        <small>
                          {p.team} · {p.conference}
                        </small>
                      </td>
                      <td>
                        {selected?.category ||
                          (category === "all"
                            ? p.categories.slice(0, 3).join(", ")
                            : category)}
                      </td>
                      <td className="numeric">{p.box_games}</td>
                      <td className="numeric">{fmt(s?.plays, 0)}</td>
                      <td className="numeric">{fmt(s?.yards, 0)}</td>
                      <td className="numeric">{fmt(s?.touchdowns, 0)}</td>
                      <td className="numeric">{fmt(s?.epa)}</td>
                      <td className="numeric">{fmt(s?.epa_per_play, 2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!rows.length && (
            <p className="empty">
              No players match these filters. Try another category or season.
            </p>
          )}
          <div className="pagination">
            <span>
              {rows.length.toLocaleString()} matching players · Page {page + 1}{" "}
              of {Math.max(1, Math.ceil(rows.length / 40))}
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
      <p className="note">
        EPA values are published by SportsDataverse. Passing, rushing and
        receiving EPA can credit overlapping plays and must not be added
        together. Defensive and special-teams box scores are available in player
        records; no composite rank is assigned to those roles.
      </p>
      <section className="section paper-panel">
        <h2>Read the source coverage.</h2>
        <p>
          Player boxes retain every imported category row, including
          team-attributed plays. Negative source IDs labeled “Team” are kept in
          storage but excluded from athlete profiles and rankings. Games and
          player counts describe these source releases, not verified national
          completeness. Schedule counts include all imported divisions, while
          player box coverage is narrower.
        </p>
        <details>
          <summary>Season coverage and source receipts</summary>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Season</th>
                  <th>Player/program records</th>
                  <th>Box rows</th>
                  <th>Box games</th>
                  <th>Completed schedule</th>
                  <th>Team-attributed box rows</th>
                </tr>
              </thead>
              <tbody>
                {catalog.seasons.map((s) => (
                  <tr key={s.season}>
                    <td>{s.season}</td>
                    {[
                      s.player_team_records,
                      s.box_rows,
                      s.box_games,
                      s.completed_schedule_games,
                      s.team_placeholder_box_rows,
                    ].map((v, i) => (
                      <td key={i}>{v.toLocaleString()}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="note source-hash">
            Catalog edition {catalog.edition}. Latest source retrieval{" "}
            {catalog.latest_source_retrieved_at}.
          </p>
          {coverage?.sources.map((s) => (
            <p key={s.dataset}>
              <a className="hero-link" href={s.url}>
                {s.dataset} · {s.season} ↗
              </a>
              <br />
              <small>Retrieved {s.fetched_at}</small>
              <br />
              <small className="source-hash">SHA-256 {s.sha256}</small>
            </p>
          ))}
          <p className="note">
            SportsDataverse bulk releases, publisher-stated CC BY 4.0.
            Silvermine retains raw fields, excludes team placeholders from
            athlete lists and ranks eligible offensive production. Source IDs
            are not independently verified person-level identities.
          </p>
          <a className="hero-link" href="/data/football/player-catalog.json">
            Download full coverage catalog ↗
          </a>
          {coverage && (
            <p>
              <a className="hero-link" href={`/data/football/${coverage.file}`}>
                Download selected player index ↗
              </a>
            </p>
          )}
        </details>
      </section>
    </>
  );
}
