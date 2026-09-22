"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { fmt } from "../../_lib/format";
import { downloadCsv, toCsv } from "../../_lib/csv";
import {
  verifyPlayerIndex,
  type PlayerCatalog,
} from "../../_lib/football-player-history";
import {
  computeFcsEpaRanks,
  computeProvisionalProductionRanks,
  computeSourceBoxRanks,
  compareFootballPlayers,
  footballCohortPercentiles,
  footballFcsRankingBasis,
  footballPlayerRankKey,
  footballPlayerCategories,
  footballEventDataset,
  footballSourceBoxMetric,
  footballPlayerFilterSearch,
  footballPlayerSorts,
  parseFootballPlayerFilters,
  parseFootballPlayerScope,
  productionForCategory,
  type FootballPlayerCategory,
  type FootballPlayerDivision,
  type FootballPlayerSort,
} from "../../_lib/football-player-view";
import ScopeUnavailable from "../../_components/ScopeUnavailable";
import { footballScopeAvailable, type SportScope } from "../../_lib/sport-scope";
import FootballLowerDivisionPlayers from "../../_components/FootballLowerDivisionPlayers";
type Production = {
  games?: number | null;
  plays: number | null;
  yards: number | null;
  yards_per_play?: number | null;
  epa: number | null;
  epa_per_play: number | null;
  success_rate?: number | null;
  touchdowns: number | null;
  rank: number | null;
  source?: string;
  metrics?: Record<string, number>;
};
const sortLabels: Record<FootballPlayerSort, string> = {
  rank: "EPA rank",
  epa: "Total EPA",
  epa_per_play: "EPA per play",
  yards_per_play: "Yards per play",
  success_rate: "Success rate",
  plays: "Volume (plays)",
};
const exportHeaders = ["Season", "Division", "Category", "Rank", "Rank basis", "Player", "Athlete ID", "Team", "Team ID", "Conference", "Box games", "Category games", "Plays", "Yards", "Yards per play", "Touchdowns", "Success rate %", "Total EPA", "EPA per play", "EPA per play percentile", "Ranked threshold plays", "Qualified", "Source metrics"];
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
    [sort, setSort] = useState<FootballPlayerSort>("rank"),
    [query, setQuery] = useState(""),
    [qualified, setQualified] = useState(false),
    [page, setPage] = useState(0),
    [data, setData] = useState<Board | null>(null),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0),
    [copied, setCopied] = useState(""),
    [hydrated, setHydrated] = useState(false),
    [scope, setScope] = useState<SportScope | null>(null),
    [compareKeys, setCompareKeys] = useState<string[]>([]),
    [compareMessage, setCompareMessage] = useState("");
  const coverage = catalog.seasons.find((s) => String(s.season) === season);
  const eventDataset = footballEventDataset(category);
  const sourceBoxMetric = footballSourceBoxMetric(category);
  useEffect(() => {
    const requestedScope = parseFootballPlayerScope(window.location.search);
    setScope(requestedScope);
    const parsed = parseFootballPlayerFilters(
      window.location.search,
      catalog.seasons.map((s) => s.season),
    );
    setSeason(parsed.season);
    setCategory(parsed.category);
    setDivision(parsed.division);
    setSort(parsed.sort);
    setQuery(parsed.query);
    setQualified(parsed.qualified);
    setPage(parsed.page);
    setHydrated(true);
  }, [catalog]);
  useEffect(() => {
    if (!hydrated || !scope || !footballScopeAvailable(scope)) return;
    const url = new URL(window.location.href);
    url.search = footballPlayerFilterSearch({
      season,
      category,
      division,
      sort,
      query,
      qualified,
      page,
    });
    window.history.replaceState(window.history.state, "", url);
  }, [hydrated, scope, season, category, division, sort, query, qualified, page]);
  useEffect(() => {
    setCompareKeys([]);
    setCompareMessage("");
  }, [season, category, division]);
  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError("");
    if (!scope || !footballScopeAvailable(scope)) return () => controller.abort();
    if (eventDataset && !sourceBoxMetric) {
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
  }, [season, retry, catalog, eventDataset, sourceBoxMetric, scope]);
  const fcsRanks = useMemo(
    () => computeFcsEpaRanks(
      data?.season === +season ? data.players : [],
      category,
      Object.fromEntries(Object.entries(data?.rankings || {}).map(([key, value]) => [key, value.minimum_plays])),
    ),
    [category, data, season],
  );
  const fcsRankBasis = useMemo(
    () => footballFcsRankingBasis(
      data?.season === +season ? data.players : [],
      category,
      Object.fromEntries(Object.entries(data?.rankings || {}).map(([key, value]) => [key, value.minimum_plays])),
    ),
    [category, data, season],
  );
  const sourceBoxRanks = useMemo(
    () => computeSourceBoxRanks(
      data?.season === +season ? data.players : [],
      category,
      division,
    ),
    [category, data, division, season],
  );
  const provisionalRanks = useMemo(
    () => computeProvisionalProductionRanks(
      data?.season === +season ? data.players : [],
      category,
      division,
    ),
    [category, data, division, season],
  );
  const selectedRank = (player: Player, selected: ReturnType<typeof productionForCategory>) => {
    if (!selected?.stats) return null;
    if (selected.stats.rank != null) return selected.stats.rank;
    if (sourceBoxMetric) {
      return sourceBoxRanks.get(footballPlayerRankKey(player.id, player.team_id, selected.category));
    }
    const sourceRank = division !== "fcs"
      ? null
      : fcsRanks.get(footballPlayerRankKey(player.id, player.team_id, selected.category));
    if (sourceRank != null) return sourceRank;
    // The live 2026 publisher edition has not reached its full-season play
    // thresholds, so it has no native offensive ranks yet. Keep the observed
    // EPA order visibly provisional until a source rank exists.
    if (season === "2026") {
      return provisionalRanks.get(footballPlayerRankKey(player.id, player.team_id, selected.category));
    }
    return null;
  };
  const cohortRows = (data?.season === +season ? data.players : []).filter(
    (p) =>
      (division === "all" || p.division === division) &&
      (category === "all" || p.categories.includes(category)) &&
      (!qualified || selectedRank(p, productionForCategory(p, category)) != null),
  );
  const rows = cohortRows.filter(
    (p) =>
      (p.name + " " + p.team + " " + p.conference)
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const efficiencyPercentiles = useMemo(() => {
    const peers = cohortRows.map((player) => productionForCategory(player, category)?.stats.epa_per_play);
    const percentiles = footballCohortPercentiles(peers);
    return new Map(
      cohortRows.map((player, index) => {
        const selected = productionForCategory(player, category);
        return [
          footballPlayerRankKey(player.id, player.team_id, selected?.category || category),
          percentiles[index],
        ];
      }),
    );
  }, [category, cohortRows]);
  const sortValue = (player: Player) => {
    const stats = productionForCategory(player, category)?.stats;
    if (!stats) return null;
    // Source-box categories have one named native total. Do not let the EPA
    // sort controls imply that an unavailable EPA value is being ranked.
    if (sourceBoxMetric) {
      const selected = productionForCategory(player, category);
      const rank = selectedRank(player, selected);
      return rank == null ? null : -rank;
    }
    if (sort === "rank") {
      const selected = productionForCategory(player, category);
      const rank = selectedRank(player, selected);
      return rank == null ? null : -rank;
    }
    if (sort === "epa") return stats.epa;
    if (sort === "epa_per_play") return stats.epa_per_play;
    if (sort === "yards_per_play") return stats.yards_per_play ?? (stats.yards != null && stats.plays ? stats.yards / stats.plays : null);
    if (sort === "success_rate") return stats.success_rate;
    return stats.plays;
  };
  rows.sort((a, b) => {
    const av = sortValue(a), bv = sortValue(b);
    if (av == null && bv != null) return 1;
    if (av != null && bv == null) return -1;
    return (bv ?? 0) - (av ?? 0) || a.name.localeCompare(b.name);
  });
  const minimum = data?.rankings[category]?.minimum_plays;
  const canQualify = Boolean(minimum || sourceBoxMetric);
  const comparisonPlayers = compareFootballPlayers(
    data?.season === +season ? data.players : [],
    compareKeys,
    category,
  );
  const comparisonKey = (player: Player) => `${player.id}:${player.team_id}`;
  const toggleComparison = (player: Player) => {
    const key = comparisonKey(player);
    setCompareMessage("");
    setCompareKeys((current) => {
      if (current.includes(key)) return current.filter((value) => value !== key);
      if (current.length >= 3) {
        setCompareMessage("Choose up to three player/team rows for one comparison.");
        return current;
      }
      return [...current, key];
    });
  };
  if (!scope) return <p className="empty" role="status">Reading the requested football player scope…</p>;
  if (!footballScopeAvailable(scope)) {
    if (scope.gender === "men" && (scope.division === "2" || scope.division === "3")) {
      return <FootballLowerDivisionPlayers division={scope.division} />;
    }
    return <ScopeUnavailable sport="football" scope={scope} />;
  }
  const exportRow = (p: Player) => {
    const selected = productionForCategory(p, category), s = selected?.stats;
    const yardsPerPlay = s?.yards != null && s.plays ? s.yards / s.plays : null;
    const rank = selectedRank(p, selected);
    const rankBasis = s?.rank != null
      ? "publisher_source_rank"
      : sourceBoxMetric
        ? `exact_id_source_box_${sourceBoxMetric}_competition_rank`
        : season === "2026"
          ? "provisional_observed_total_epa_competition_rank"
          : division === "fcs"
            ? fcsRankBasis === "total_epa"
              ? "silvermine_fcs_total_epa_competition_rank"
              : fcsRankBasis === "source_box_yards"
                ? "silvermine_fcs_source_box_yards_competition_rank"
                : "unavailable"
            : "unavailable";
    return [season, p.division, selected?.category || category, rank, rankBasis, p.name, p.id, p.team, p.team_id, p.conference, p.box_games, s?.games, s?.plays, s?.yards, s?.yards_per_play ?? yardsPerPlay, s?.touchdowns, s?.success_rate == null ? null : s.success_rate * 100, s?.epa, s?.epa_per_play, efficiencyPercentiles.get(footballPlayerRankKey(p.id, p.team_id, selected?.category || category)), data?.rankings[selected?.category || category]?.minimum_plays, rank != null ? "yes" : "no", s?.metrics ? JSON.stringify(s.metrics) : null];
  };
  const download = (all = false) => {
    const selectedRows = all ? rows : rows.slice(page * 40, page * 40 + 40);
    downloadCsv(
      `football-player-rankings-${season}-${category}-${sort}-${all ? "all" : `page-${page + 1}`}.csv`,
      toCsv(exportHeaders, selectedRows.map(exportRow)),
    );
  };
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
          <span>ORDER BY</span>
          <select value={sort} disabled={Boolean(sourceBoxMetric)} onChange={(e) => { setSort(e.target.value as FootballPlayerSort); setPage(0); }}>
            {footballPlayerSorts.map((value) => <option key={value} value={value}>{sortLabels[value]}</option>)}
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
            <option value="fcs">FCS</option>
            <option value="all">All imported divisions</option>
          </select>
        </label>
      </div>
      <div className="button-row" style={{ marginTop: 12 }}>
        <button className="button secondary" type="button" onClick={() => download()} disabled={!rows.length}>
          Download page CSV ↓
        </button>
        <button className="button secondary" type="button" onClick={() => download(true)} disabled={!rows.length}>
          Download all matching CSV ↓
        </button>
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
      {canQualify && (
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
          Show ranked players only ({sourceBoxMetric ? `source-box order by ${sourceBoxMetric}` : season === "2026" ? "observed EPA order (provisional)" : division === "fcs" ? "FCS Silvermine production order" : "FBS source rank"}{minimum && season !== "2026" ? `, at least ${minimum} plays` : ", numeric source total required"})
        </label>
      )}
      {compareMessage && <p className="note" role="status">{compareMessage}</p>}
      {comparisonPlayers.length > 0 && (
        <section className="section paper-panel" aria-labelledby="football-player-comparison" style={{ marginTop: 18 }}>
          <div className="section-heading">
            <div>
              <div className="eyebrow">Exact-ID comparison / {season}</div>
              <h2 id="football-player-comparison">Compare observed production.</h2>
            </div>
            <button className="button secondary" type="button" onClick={() => setCompareKeys([])}>Clear comparison</button>
          </div>
          <p className="note">These are source production rows for the selected category. Team-season affiliations stay separate, and unavailable values remain dashes.</p>
          {comparisonPlayers.some((player) => [player.stats.games, player.stats.plays, player.stats.yards, player.stats.touchdowns, player.stats.epa, player.stats.epa_per_play].some((value) => value != null)) && <div className="table-scroll">
            <table className="data-table">
              <thead><tr><th>Player / team</th><th>Category</th><th className="numeric">Publisher rank</th><th className="numeric">Games</th><th className="numeric">Plays</th><th className="numeric">Yards</th><th className="numeric">Yards / play</th><th className="numeric">TD</th><th className="numeric">Success rate</th><th className="numeric">Total EPA</th><th className="numeric">EPA / play</th></tr></thead>
              <tbody>{comparisonPlayers.map((player) => {
                const stats = player.stats;
                const yardsPerPlay = stats.yards_per_play ?? (stats.yards != null && stats.plays ? stats.yards / stats.plays : null);
                return <tr key={`${player.id}-${player.team_id}`}>
                  <th scope="row"><Link href={`/football/player/?id=${encodeURIComponent(player.id)}&season=${season}`}>{player.name}</Link><small>{player.team || "Team unavailable"} · {player.conference || "Conference unavailable"} · {player.division.toUpperCase()}</small></th>
                  <td>{player.selectedCategory}</td>
                  <td className="numeric">{stats.rank == null ? "—" : `#${stats.rank}`}<small>{stats.rank == null ? "Not in publisher rank" : "Retained source rank"}</small></td>
                  <td className="numeric">{fmt(stats.games, 0)}</td>
                  <td className="numeric">{fmt(stats.plays, 0)}</td>
                  <td className="numeric">{fmt(stats.yards, 0)}</td>
                  <td className="numeric">{fmt(yardsPerPlay, 2)}</td>
                  <td className="numeric">{fmt(stats.touchdowns, 0)}</td>
                  <td className="numeric">{fmt(stats.success_rate == null ? null : stats.success_rate * 100, 1)}{stats.success_rate == null ? "" : "%"}</td>
                  <td className="numeric">{fmt(stats.epa)}</td>
                  <td className="numeric">{fmt(stats.epa_per_play, 2)}</td>
                </tr>;
              })}</tbody>
            </table>
          </div>}
          {comparisonPlayers.some((player) => Object.keys(player.stats.metrics || {}).length > 0) && <div className="table-scroll" style={{ marginTop: 14 }}>
            <table className="data-table">
              <thead><tr><th>Player / team</th><th>Exact-ID source-box totals</th></tr></thead>
              <tbody>{comparisonPlayers.filter((player) => Object.keys(player.stats.metrics || {}).length > 0).map((player) => <tr key={`${player.id}-${player.team_id}-metrics`}>
                <th scope="row">{player.name}<small>{player.team || "Team unavailable"} · {player.selectedCategory}</small></th>
                <td>{Object.entries(player.stats.metrics || {}).map(([key, value]) => <span className="table-subrow" key={key}><strong>{key.replaceAll("_", " ")}</strong><small>{fmt(value, 2)}</small></span>)}</td>
              </tr>)}</tbody>
            </table>
          </div>}
        </section>
      )}
      <p className="note" style={{ marginBottom: 20 }}>
        Ordered by {sourceBoxMetric ? `source-box order by ${sourceBoxMetric}` : division === "fcs" && sort === "rank" ? "FCS Silvermine production order" : sortLabels[sort].toLowerCase()} within{" "}
        {category === "all"
          ? "the best available ranked category per player"
          : category}. Team
        affiliations reflect {season} production and do not establish current
        rosters.{" "}
        {season === "2026"
          ? "Early-season samples are incomplete."
          : "Historical coverage varies by division and category."}{" "}
        Category games, yards per play and success rate come from the same
        source production record; a dash means unranked or unavailable, never
        zero. The EPA / play percentile compares observed values within the
        selected season, division and category cohort; it is a descriptive rate
        context and does not replace the source rank or create a composite grade.
        {sourceBoxMetric ? ` ${sourceBoxMetric} order is a transparent exact-ID source-box total; equal totals share a competition rank, and it is not a composite grade.` : season === "2026" ? " The 2026 offensive order is provisional: it competition-ranks observed total EPA within the selected division because the partial-season source has not issued qualified native ranks. Equal EPA totals share a rank. It is descriptive and should not be read as a full-season or composite grade." : division === "fcs" ? ` FCS rank is a Silvermine competition ranking of ${fcsRankBasis === "total_epa" ? "retained total EPA" : fcsRankBasis === "source_box_yards" ? "exact-ID source-box yards because this cohort has no retained EPA" : "available retained production"} after the category play threshold; equal values share a rank, and EPA is never compared with yards. The publisher does not provide a source FCS rank.` : " FBS rank is the retained source rank."}
      </p>
      {eventDataset && !sourceBoxMetric ? (
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
                  <th>Compare</th>
                  <th>{sourceBoxMetric ? "Source-box rank" : season === "2026" ? "Provisional EPA rank" : division === "fcs" ? "FCS rank" : "EPA rank"}</th>
                  <th>Player / team</th>
                  <th>Category</th>
                  {sourceBoxMetric ? (
                    <>
                      <th className="numeric">Box games</th>
                      <th className="numeric">Stat games</th>
                      <th>Recorded source metrics</th>
                    </>
                  ) : (
                    <>
                      <th className="numeric">Box games</th>
                      <th className="numeric">Stat games</th>
                      <th className="numeric">Plays</th>
                      <th className="numeric">Yards</th>
                      <th className="numeric">Yards / play</th>
                      <th className="numeric">TD</th>
                      <th className="numeric">Success rate</th>
                      <th className="numeric">Total EPA</th>
                      <th className="numeric">EPA / play</th>
                      <th className="numeric">EPA / play percentile</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.slice(page * 40, page * 40 + 40).map((p) => {
                  const selected = productionForCategory(p, category),
                    s = selected?.stats;
                  return (
                    <tr key={`${p.id}-${p.team_id}`}>
                      <td>
                        <label className="sr-only">
                          <span>Select {p.name} for comparison</span>
                          <input
                            type="checkbox"
                            checked={compareKeys.includes(comparisonKey(p))}
                            onChange={() => toggleComparison(p)}
                          />
                        </label>
                      </td>
                      <td className="rank-number">{selectedRank(p, selected) ?? "—"}</td>
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
                      {sourceBoxMetric ? (
                        <>
                          <td className="numeric">{p.box_games}</td>
                          <td className="numeric">{fmt(s?.games, 0)}</td>
                          <td>
                            <div className="note" style={{ margin: 0 }}>
                              {Object.entries(s?.metrics || {}).map(([key, value]) => `${key.replaceAll("_", " ")}: ${fmt(value, 2)}`).join(" · ") || "—"}
                            </div>
                            <small>Exact-ID source-box totals</small>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="numeric">{p.box_games}</td>
                          <td className="numeric">{fmt(s?.games, 0)}</td>
                          <td className="numeric">{fmt(s?.plays, 0)}</td>
                          <td className="numeric">{fmt(s?.yards, 0)}</td>
                          <td className="numeric">{fmt(s?.yards_per_play ?? (s?.yards != null && s.plays ? s.yards / s.plays : null), 2)}</td>
                          <td className="numeric">{fmt(s?.touchdowns, 0)}</td>
                          <td className="numeric">{fmt(s?.success_rate == null ? null : s.success_rate * 100, 1)}{s?.success_rate == null ? "" : "%"}</td>
                          <td className="numeric">{fmt(s?.epa)}</td>
                          <td className="numeric">{fmt(s?.epa_per_play, 2)}</td>
                          <td className="numeric">{efficiencyPercentiles.get(footballPlayerRankKey(p.id, p.team_id, selected?.category || category)) == null ? "—" : `${fmt(efficiencyPercentiles.get(footballPlayerRankKey(p.id, p.team_id, selected?.category || category)), 1)}%`}</td>
                        </>
                      )}
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
        Passing, rushing and
        receiving EPA can credit overlapping plays and must not be added
        together. Defensive and special-teams rows use exact-ID source-box
        totals with a named metric order; no composite role grade is assigned.
      </p>
      <section className="section paper-panel">
        <h2>Read the dataset coverage.</h2>
        <p>
          Player boxes retain every imported category row, including
          team-attributed plays. Negative source IDs labeled “Team” are kept in
          storage but excluded from athlete profiles and rankings. Games and
          player counts describe these dataset editions, not verified national
          completeness. Schedule counts include all imported divisions, while
          player box coverage is narrower.
        </p>
        <details>
          <summary>Season coverage and capture receipts</summary>
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
              <span className="hero-link">
                {s.dataset} · {s.season} ↗
              </span>
              <br />
              <small>Retrieved {s.fetched_at}</small>
              <br />
              <small className="source-hash">SHA-256 {s.sha256}</small>
            </p>
          ))}
          <p className="note">
            Retained editions. Silvermine keeps raw fields, excludes team
            placeholders from
            athlete lists and ranks eligible offensive production. Source IDs
            are not independently verified person-level identities.
          </p>
          <div className="button-row">
            <a className="hero-link" href="/data/football/player-catalog.json">
              Download full coverage catalog ↗
            </a>
            <a className="hero-link" href="/api/football/player-history/source">
              Download validated source archive ↓
            </a>
          </div>
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
