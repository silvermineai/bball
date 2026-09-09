"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import type { BBGame, BBRosterScenario, BBRosterSummary, BBTeam } from "../../_lib/basketball-types";
import BasketballCard from "../../_components/BasketballCard";
import { downloadCsv, toCsv } from "../../_lib/csv";
import type { BBOverview } from "../../_lib/basketball-types";
import { date, kick } from "../../_lib/format";
import {
  matchupFilterSearch,
  parseMatchupFilters,
  sortMatchups,
  type MatchupCoverage,
  type MatchupSort,
} from "../../_lib/basketball-matchups";

type LiveForecastRow = {
  game_id: string;
  season: number;
  starts_at: string;
  home_id: string;
  away_id: string;
  home_name: string | null;
  away_name: string | null;
  neutral: number;
  time_tbd: number;
  venue: string | null;
  broadcast: string | null;
  prediction: BBGame["prediction"];
};

type LiveForecastPage = {
  total: number;
  page_size: number;
  rows: LiveForecastRow[];
};

function mergeLiveForecasts(games: BBGame[], rows: LiveForecastRow[]) {
  const staticById = new Map(games.map((game) => [game.id, game]));
  const liveIds = new Set<string>();
  const merged = rows.flatMap((row) => {
    const base = staticById.get(row.game_id);
    const names = row.home_name && row.away_name
      ? { home_name: row.home_name, away_name: row.away_name }
      : base
        ? { home_name: base.home_name, away_name: base.away_name }
        : null;
    if (!names) return [];
    liveIds.add(row.game_id);
    return [{
      ...(base || {
        id: row.game_id,
        season: row.season,
        home_id: row.home_id,
        away_id: row.away_id,
        neutral: row.neutral,
        time_tbd: row.time_tbd,
        venue: row.venue || "",
        broadcast: row.broadcast || "",
        prediction: null,
      }),
      starts_at: row.starts_at,
      home_id: row.home_id,
      away_id: row.away_id,
      home_name: names.home_name,
      away_name: names.away_name,
      neutral: row.neutral,
      time_tbd: row.time_tbd,
      venue: row.venue || base?.venue || "",
      broadcast: row.broadcast || base?.broadcast || "",
      prediction: row.prediction,
    } satisfies BBGame];
  });
  // Keep scheduled rows without a current model record so the slate still
  // shows explicitly unforecasted games.
  return [...merged, ...games.filter((game) => !liveIds.has(game.id))].sort(
    (a, b) => a.starts_at.localeCompare(b.starts_at) || a.id.localeCompare(b.id),
  );
}

export default function Matchups({
  games,
  marketComparisons,
  rosterSummaries,
  model,
  generatedAt,
  rosterScenarios = [],
  teamRatings = {},
  scope = "all",
}: {
  games: BBGame[];
  marketComparisons: Record<string, NonNullable<BBGame["market_comparisons"]>>;
  rosterSummaries: BBRosterSummary[];
  model: BBOverview["model"];
  generatedAt: string;
  rosterScenarios?: BBRosterScenario[];
  teamRatings?: Record<string, BBTeam>;
  scope?: "all" | "forecasted";
}) {
  const params = useSearchParams();
  const initial = parseMatchupFilters(params.toString());
  const [q, setQ] = useState(initial.team),
    [month, setMonth] = useState(initial.month),
    [coverage, setCoverage] = useState<MatchupCoverage>(initial.coverage),
    [sort, setSort] = useState<MatchupSort>(initial.sort),
    [page, setPage] = useState(initial.page),
    [prepIds, setPrepIds] = useState<string[]>(initial.picks || []),
    [prepHydrated, setPrepHydrated] = useState(false),
    [copied, setCopied] = useState(""),
    [liveCatalog, setLiveCatalog] = useState<{
      models?: Array<{
        model_id: string;
        forecasts: number;
        last_created_at: string | null;
        target_season?: number | null;
      }>;
    } | null>(null),
    [liveCatalogError, setLiveCatalogError] = useState(""),
    [liveGames, setLiveGames] = useState<BBGame[] | null>(null),
    [liveGamesError, setLiveGamesError] = useState("");
  const activeGames = liveGames || games;

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      const firstResponse = await fetch(
        "/api/basketball/research/forecasts?season=2027&status=upcoming&limit=100&page=0",
        { signal: controller.signal },
      );
      if (!firstResponse.ok) throw new Error("Live matchup forecasts unavailable.");
      const first = await firstResponse.json() as LiveForecastPage;
      const pageCount = Math.ceil(first.total / Math.max(first.page_size, 1));
      const additional = await Promise.all(
        Array.from({ length: Math.max(0, pageCount - 1) }, (_, index) =>
          fetch(
            `/api/basketball/research/forecasts?season=2027&status=upcoming&limit=100&page=${index + 1}`,
            { signal: controller.signal },
          ).then((response) => {
            if (!response.ok) throw new Error("Live matchup forecasts unavailable.");
            return response.json() as Promise<LiveForecastPage>;
          }),
        ),
      );
      if (!controller.signal.aborted) {
        setLiveGames(mergeLiveForecasts(games, [first, ...additional].flatMap((page) => page.rows)));
        setLiveGamesError("");
      }
    };
    load().catch((reason: unknown) => {
      if ((reason as { name?: string })?.name !== "AbortError" && !controller.signal.aborted) {
        setLiveGamesError(reason instanceof Error ? reason.message : "Live matchup forecasts unavailable.");
      }
    });
    return () => controller.abort();
  }, [games]);

  useEffect(() => {
    const validIds = new Set(activeGames.map((game) => game.id));
    const fromUrl = (initial.picks || []).filter((id) => validIds.has(id)).slice(0, 12);
    let next = fromUrl;
    if (!fromUrl.length) {
      try {
        const saved = JSON.parse(window.localStorage.getItem("silvermine.basketball.matchup-prep.v1") || "null");
        if (Array.isArray(saved)) next = saved.filter((id): id is string => typeof id === "string" && validIds.has(id)).slice(0, 12);
      } catch {
        next = [];
      }
    }
    setPrepIds(next);
    setPrepHydrated(true);
  }, [activeGames]);
  useEffect(() => {
    if (!prepHydrated) return;
    try {
      window.localStorage.setItem("silvermine.basketball.matchup-prep.v1", JSON.stringify(prepIds.slice(0, 12)));
    } catch {
      // Local persistence is a convenience; private browsing may disable it.
    }
  }, [prepHydrated, prepIds]);
  useEffect(() => {
    const validIds = new Set(activeGames.map((game) => game.id));
    const cleaned = prepIds.filter((id) => validIds.has(id)).slice(0, 12);
    if (cleaned.length !== prepIds.length || cleaned.some((id, index) => id !== prepIds[index])) {
      setPrepIds(cleaned);
    }
  }, [activeGames, prepIds]);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/basketball/research/forecasts?season=2027&meta=1", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Live forecast catalog unavailable.");
        return response.json() as Promise<typeof liveCatalog>;
      })
      .then((value) => { if (!controller.signal.aborted) setLiveCatalog(value); })
      .catch((reason: Error) => {
        if (reason.name !== "AbortError" && !controller.signal.aborted) setLiveCatalogError(reason.message);
      });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    const next = matchupFilterSearch({ team: q, month, coverage, sort, page, picks: prepIds });
    if (next !== window.location.search) {
      window.history.replaceState(
        window.history.state,
        "",
        `${window.location.pathname}${next}${window.location.hash}`,
      );
    }
  }, [q, month, coverage, sort, page, prepIds]);
  const eligibleGames = scope === "forecasted" ? activeGames.filter((g) => g.prediction != null) : activeGames;
  const effectiveCoverage = scope === "forecasted" ? "forecasted" : coverage;
  const rows = sortMatchups(
    eligibleGames.filter(
      (g) =>
        (g.home_name + " " + g.away_name)
          .toLowerCase()
          .includes(q.toLowerCase()) &&
        (month === "all" || g.starts_at.startsWith(month)) &&
        (effectiveCoverage === "all" ||
          (effectiveCoverage === "forecasted"
            ? g.prediction != null
            : g.prediction == null)),
    ),
    sort,
  );
  const rosterByTeam = new Map(rosterSummaries.map((summary) => [summary.team_id, summary]));
  const rosterScenarioByGame = new Map(rosterScenarios.map((scenario) => [scenario.game_id, scenario]));
  const prepRows = prepIds
    .map((id) => activeGames.find((game) => game.id === id))
    .filter((game): game is BBGame => !!game);
  const togglePrep = (id: string) => {
    setPrepIds((current) => current.includes(id)
      ? current.filter((value) => value !== id)
      : current.length >= 12 ? current : [...current, id]);
  };
  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied("Slate link copied.");
    } catch {
      setCopied("Copy the filtered URL from your address bar.");
    }
  };
  return (
    <>
      <div className="toolbar">
        <label className="control">
          <span>TEAM</span>
          <input
            type="search"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(0);
            }}
            placeholder="Search a program"
          />
        </label>
        <label className="control">
          <span>MONTH</span>
          <select
            value={month}
            onChange={(e) => {
              setMonth(e.target.value);
              setPage(0);
            }}
          >
            <option value="all">All published months</option>
            {[...new Set(activeGames.map((g) => g.starts_at.slice(0, 7)))]
              .sort()
              .map((m) => (
                <option key={m}>{m}</option>
              ))}
          </select>
        </label>
        {scope === "forecasted" ? (
          <div className="control" aria-label="Forecast scope">
            <span>FORECAST</span>
            <strong className="note">Primary forecasts only</strong>
          </div>
        ) : (
          <label className="control">
            <span>FORECAST</span>
            <select
              value={coverage}
              onChange={(e) => {
                setCoverage(e.target.value as MatchupCoverage);
                setPage(0);
              }}
            >
              <option value="all">All games</option>
              <option value="forecasted">With model forecast</option>
              <option value="unforecasted">Without primary forecast</option>
            </select>
          </label>
        )}
        <label className="control">
          <span>SORT BY</span>
          <select
            value={sort}
            onChange={(e) => {
              setSort(e.target.value as MatchupSort);
              setPage(0);
            }}
          >
            <option value="date">Date</option>
            <option value="confidence">Strongest model signal</option>
            <option value="close">Closest projected margin</option>
            <option value="margin">Largest projected margin</option>
            <option value="uncertainty">Widest margin range</option>
          </select>
        </label>
      </div>
      <p className="note">
        This filtered slate updates the URL, so a preparation view can be
        bookmarked or shared with the exact team, coverage and triage sort.
      </p>
      <p className="note">
        Forecast edition {generatedAt.slice(0, 10)} · model {model.version} · training cutoff {model.cutoff}. Read the <Link href="/basketball/model/">model notebook</Link> for fitting windows, held-out results and limitations.
      </p>
      <p className="note" role="status">
        {liveCatalog ? (() => {
          const latest = liveCatalog.models?.find((item) => item.target_season === 2027) || liveCatalog.models?.[0];
          if (!latest) return "Live D1 catalog has no registered 2026–27 model; showing the static edition.";
          const matches = latest.model_id === model.id;
          return `Live D1 catalog: ${latest.forecasts.toLocaleString()} rows · ${latest.last_created_at ? `last captured ${latest.last_created_at.slice(0, 10)}` : "capture clock unavailable"} · ${matches ? "matches this page" : `newer than this page (${latest.model_id})`}.`;
        })() : liveCatalogError ? `${liveCatalogError} Showing the static forecast edition.` : "Checking the live forecast catalog…"}
      </p>
      <p className="note" role="status">
        {liveGames
          ? `Live D1 matchup rows: ${liveGames.filter((game) => game.prediction).length.toLocaleString()} modeled · refreshed from the latest registered edition.`
          : liveGamesError
            ? `${liveGamesError} Showing the published static slate.`
            : "Checking live matchup rows…"}
      </p>
      <div className="section-heading" style={{ marginBottom: 20 }}>
        <p>
          {rows.length} games · partial schedule · times Eastern when confirmed
        </p>
        <button
          className="button secondary"
          type="button"
          onClick={() =>
            downloadCsv(
              "basketball-2026-27-matchups.csv",
              toCsv(
                [
                  "Scheduled start",
                  "Away program",
                  "Home program",
                  "Venue",
                  "Projected away score",
                  "Projected home score",
                  "Home win probability",
                  "Projected home margin",
                  "Projected total",
                  "Margin range low",
                  "Margin range high",
                  "Projected pace",
                  "Broadcast",
                  "Estimate type",
                ],
                rows.map((g) => [
                  g.starts_at,
                  g.away_name,
                  g.home_name,
                  g.venue,
                  (g.prediction || g.fallback_prediction)?.away_score,
                  (g.prediction || g.fallback_prediction)?.home_score,
                  (g.prediction || g.fallback_prediction)?.home_win_probability == null
                    ? null
                    : (g.prediction || g.fallback_prediction)!.home_win_probability * 100,
                  (g.prediction || g.fallback_prediction)?.home_margin,
                  (g.prediction || g.fallback_prediction)?.total,
                  (g.prediction || g.fallback_prediction)?.margin_low,
                  (g.prediction || g.fallback_prediction)?.margin_high,
                  (g.prediction || g.fallback_prediction)?.pace,
                  g.broadcast,
                  g.prediction ? "primary" : g.fallback_prediction ? "cold-start" : null,
                ]),
              ),
            )
          }
        >
          Download CSV ↓
        </button>
        <button className="button secondary" type="button" onClick={share}>
          Copy slate link
        </button>
        <Link className="button secondary" href="/research/scorecard/?sport=basketball">
          Forecast record
        </Link>
      </div>
      {copied && <p role="status">{copied}</p>}
      {prepRows.length > 0 && (
        <section className="paper-panel matchup-prep-panel" aria-labelledby="matchup-prep-title">
          <div className="section-heading">
            <div>
              <span className="eyebrow">COACH PREP</span>
              <h2 id="matchup-prep-title">Prep list</h2>
            </div>
            <button className="button secondary" type="button" onClick={() => setPrepIds([])}>
              Clear list
            </button>
          </div>
          <p className="note">Keep up to 12 games across filters. The list persists on this device and travels with the copied slate URL.</p>
          <div className="matchup-prep-list">
            {prepRows.map((game) => (
              <div className="matchup-prep-item" key={game.id}>
                <div>
                  <strong>{game.away_name} at {game.home_name}</strong>
                  <small>{game.time_tbd ? `${date(game.starts_at)} · time TBD` : kick(game.starts_at)}</small>
                </div>
                <div className="button-row">
                  {game.prediction && <Link className="note" href={`/basketball/briefs/${game.id}/`}>Brief ↗</Link>}
                  <button className="button secondary" type="button" onClick={() => togglePrep(game.id)}>Remove</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
      <div className="match-grid">
        {rows.slice(page * 12, page * 12 + 12).map((g) => (
          <div className="matchup-card-wrap" key={g.id}>
            <BasketballCard
              game={marketComparisons[g.id]?.length ? { ...g, market_comparisons: marketComparisons[g.id] } : g}
              homeRoster={rosterByTeam.get(g.home_id)}
              awayRoster={rosterByTeam.get(g.away_id)}
              rosterScenario={rosterScenarioByGame.get(g.id)}
              homeRating={teamRatings[g.home_id]}
              awayRating={teamRatings[g.away_id]}
            />
            <button
              className="button secondary matchup-prep-toggle"
              type="button"
              aria-pressed={prepIds.includes(g.id)}
              onClick={() => togglePrep(g.id)}
            >
              {prepIds.includes(g.id) ? "✓ In prep list" : prepIds.length >= 12 ? "Prep list full" : "+ Add to prep list"}
            </button>
          </div>
        ))}
      </div>
      {!rows.length && (
        <p className="empty">No published games match these filters.</p>
      )}
      <div className="pagination">
        <span>
          Page {page + 1} of {Math.max(1, Math.ceil(rows.length / 12))}
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
            disabled={(page + 1) * 12 >= rows.length}
            onClick={() => setPage(page + 1)}
          >
            Next →
          </button>
        </div>
      </div>
    </>
  );
}
