"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import type { FootballEfficiencyScenario, Game, Overview } from "../../_lib/data";
import MatchCard from "../../_components/MatchCard";
import { date, fmt, kick } from "../../_lib/format";
import { downloadCsv, toCsv } from "../../_lib/csv";
import {
  applyLiveFootballMarketComparisons,
  loadLiveFootballForecasts,
  loadLiveFootballMarketComparisons,
  mergeLiveFootballForecasts,
} from "../../_lib/live-football-forecasts";
import type { LiveFootballMarketComparisonSet } from "../../_lib/live-football-forecasts";
import type { FootballSlateIntel } from "../../_lib/football-brief";
import { loadFootballRecruitingContext, type FootballRecruitingTeam } from "../../_lib/football-recruiting-context";
import { comparisonQuoteSummary } from "../../_lib/market-display";
import {
  matchesFootballMatchupDivision,
  matchesFootballMatchupSignal,
  parseFootballMatchupDivision,
  parseFootballMatchupSignal,
  parseFootballMatchupSort,
  sortFootballMatchups,
  type FootballMatchupSignal,
  type FootballMatchupSort,
} from "../../_lib/football-matchup-view";
import { footballForecastReadiness } from "../../_lib/football-forecast-readiness";
export default function MatchupBrowser({
  games,
  generated,
  efficiencyScenarios = [],
  matchupIntel,
  marketCoverage,
  modelId,
  model,
}: {
  games: Game[];
  generated: string;
  efficiencyScenarios?: FootballEfficiencyScenario[];
  matchupIntel?: FootballSlateIntel;
  marketCoverage?: {
    market_observations: number;
    pregame_market_observations: number;
  };
  modelId?: string;
  model?: Pick<Overview["model"], "teams" | "margin_coef" | "total_coef">;
}) {
  const params = useSearchParams();
  const requestedPicks = params.get("picks") || "";
  const requestedPage = Number(params.get("page") || 0);
  const requestedWeek = params.get("week");
  const requestedDivision = parseFootballMatchupDivision(params.get("division"));
  const initialWeek = requestedWeek && /^\d{1,2}$/.test(requestedWeek) ? requestedWeek : "all";
  const [query, setQuery] = useState(params.get("team") || ""),
    [week, setWeek] = useState(initialWeek),
    [division, setDivision] = useState(requestedDivision),
    [mode, setMode] = useState<"all" | "forecast">(params.get("show") === "forecast" ? "forecast" : "all"),
    [signal, setSignal] = useState<FootballMatchupSignal>(parseFootballMatchupSignal(params.get("signal"))),
    [sort, setSort] = useState<FootballMatchupSort>(parseFootballMatchupSort(params.get("sort"))),
    [page, setPage] = useState(Number.isInteger(requestedPage) && requestedPage >= 0 && requestedPage <= 250 ? requestedPage : 0),
    [prepIds, setPrepIds] = useState<string[]>(() => requestedPicks.split(",").filter(Boolean).slice(0, 12)),
    [prepHydrated, setPrepHydrated] = useState(false),
    [copied, setCopied] = useState(""),
    [liveGames, setLiveGames] = useState<Game[] | null>(null),
    [liveModelId, setLiveModelId] = useState<string | null>(null),
    [liveError, setLiveError] = useState(""),
    [liveMarketComparisons, setLiveMarketComparisons] = useState<Record<string, LiveFootballMarketComparisonSet> | null>(null),
    [liveMarketError, setLiveMarketError] = useState(""),
    [recruitingContext, setRecruitingContext] = useState<Map<string, FootballRecruitingTeam> | null>(null);
  const activeGames = liveGames || games;
  const scopedGames = activeGames.filter((game) => matchesFootballMatchupDivision(game, division));
  const filteredRows = scopedGames.filter(
    (g) =>
      (
        g.home_name +
        " " +
        g.away_name +
        " " +
        g.home_conference +
        " " +
        g.away_conference
      )
      .toLowerCase()
        .includes(query.toLowerCase()) &&
      (week === "all" || String(g.week) === week) &&
      matchesFootballMatchupDivision(g, division) &&
      (mode === "all" || g.prediction) &&
      matchesFootballMatchupSignal(g.prediction, signal),
  );
  const rows = sortFootballMatchups(filteredRows, sort);
  const scenarioByGame = new Map(efficiencyScenarios.map((scenario) => [scenario.game_id, scenario]));
  const marketLinkedRows = scopedGames
    .map((game) => ({
      game,
      comparisons: applyLiveFootballMarketComparisons(game, liveMarketComparisons, modelId).market_comparisons || [],
    }))
    .filter(({ game, comparisons }) => Boolean(game.prediction) && comparisons.length > 0)
    .sort((left, right) => left.game.kickoff.localeCompare(right.game.kickoff));
  const forecastReadiness = footballForecastReadiness(
    activeGames,
    new Set(marketLinkedRows.map(({ game }) => game.id)),
  );
  const linkedComparisons = (game: Game) => applyLiveFootballMarketComparisons(game, liveMarketComparisons, modelId).market_comparisons || [];
  const prepRows = prepIds
    .map((id) => scopedGames.find((game) => game.id === id))
    .filter((game): game is Game => !!game);

  useEffect(() => {
    setDivision(requestedDivision);
    setPage(0);
  }, [requestedDivision]);

  useEffect(() => {
    const validIds = new Set(activeGames.map((game) => game.id));
    const fromUrl = requestedPicks.split(",").filter((id) => validIds.has(id)).slice(0, 12);
    let next = fromUrl;
    if (!fromUrl.length) {
      try {
        const saved = JSON.parse(window.localStorage.getItem("silvermine.football.matchup-prep.v1") || "null");
        if (Array.isArray(saved)) next = saved.filter((id): id is string => typeof id === "string" && validIds.has(id)).slice(0, 12);
      } catch {
        next = [];
      }
    }
    setPrepIds(next);
    setPrepHydrated(true);
  }, [activeGames, requestedPicks]);
  useEffect(() => {
    if (!prepHydrated) return;
    try {
      window.localStorage.setItem("silvermine.football.matchup-prep.v1", JSON.stringify(prepIds.slice(0, 12)));
    } catch {
      // Local persistence is a convenience; private browsing may disable it.
    }
  }, [prepHydrated, prepIds]);
  useEffect(() => {
    const validIds = new Set(activeGames.map((game) => game.id));
    const cleaned = prepIds.filter((id) => validIds.has(id)).slice(0, 12);
    if (cleaned.length !== prepIds.length || cleaned.some((id, index) => id !== prepIds[index])) setPrepIds(cleaned);
  }, [activeGames, prepIds]);

  const togglePrep = (id: string) => {
    setPrepIds((current) => current.includes(id)
      ? current.filter((value) => value !== id)
      : current.length >= 12 ? current : [...current, id]);
  };

  useEffect(() => {
    const url = new URL(window.location.href);
    if (query.trim()) url.searchParams.set("team", query.trim());
    else url.searchParams.delete("team");
    if (week !== "all") url.searchParams.set("week", week);
    else url.searchParams.delete("week");
    if (division !== "d1") url.searchParams.set("division", division);
    else if (url.searchParams.get("division") !== "1") url.searchParams.delete("division");
    if (mode === "forecast") url.searchParams.set("show", mode);
    else url.searchParams.delete("show");
    if (signal !== "all") url.searchParams.set("signal", signal);
    else url.searchParams.delete("signal");
    if (sort !== "date") url.searchParams.set("sort", sort);
    else url.searchParams.delete("sort");
    if (page) url.searchParams.set("page", String(page));
    else url.searchParams.delete("page");
    if (prepIds.length) url.searchParams.set("picks", prepIds.join(","));
    else url.searchParams.delete("picks");
    window.history.replaceState(window.history.state, "", url);
  }, [division, mode, page, prepIds, query, signal, sort, week]);

  useEffect(() => {
    const controller = new AbortController();
    loadLiveFootballForecasts(controller.signal)
      .then((rows) => {
        if (!controller.signal.aborted) {
          setLiveGames(mergeLiveFootballForecasts(games, rows));
          setLiveModelId(rows.find((row) => row.model_id)?.model_id || null);
          setLiveError("");
        }
      })
      .catch((reason: unknown) => {
        if ((reason as { name?: string })?.name !== "AbortError" && !controller.signal.aborted) {
          setLiveError(reason instanceof Error ? reason.message : "Live football forecasts unavailable.");
        }
      });
    return () => controller.abort();
  }, [games]);
  useEffect(() => {
    if (!liveModelId) return;
    const controller = new AbortController();
    loadLiveFootballMarketComparisons(controller.signal, liveModelId)
      .then((comparisons) => {
        if (!controller.signal.aborted) {
          setLiveMarketComparisons(comparisons);
          setLiveMarketError("");
        }
      })
      .catch((reason: unknown) => {
        if ((reason as { name?: string })?.name !== "AbortError" && !controller.signal.aborted) {
          setLiveMarketError(reason instanceof Error ? reason.message : "Live football market comparisons unavailable.");
        }
      });
    return () => controller.abort();
  }, [liveModelId]);
  useEffect(() => {
    const controller = new AbortController();
    loadFootballRecruitingContext(controller.signal)
      .then((context) => { if (!controller.signal.aborted) setRecruitingContext(context); })
      .catch(() => { if (!controller.signal.aborted) setRecruitingContext(null); });
    return () => controller.abort();
  }, []);
  return (
    <>
      <div className="toolbar">
        <label className="control">
          <span>TEAM OR CONFERENCE</span>
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
            placeholder="Try Ohio State or Big Ten"
          />
        </label>
        <label className="control">
          <span>WEEK</span>
          <select
            value={week}
            onChange={(e) => {
              setWeek(e.target.value);
              setPage(0);
            }}
          >
            <option value="all">All weeks</option>
            {[...new Set(activeGames.map((g) => g.week))]
              .sort((a, b) => a - b)
              .map((w) => (
                <option key={w} value={w}>
                  Week {w}
                </option>
              ))}
          </select>
        </label>
        <label className="control">
          <span>DIVISION</span>
          <select
            value={division}
            onChange={(e) => {
              setDivision(parseFootballMatchupDivision(e.target.value));
              setPage(0);
            }}
          >
            <option value="d1">D1 · FBS/FCS</option>
            <option value="d2">D2</option>
            <option value="d3">D3</option>
          </select>
        </label>
        <label className="control">
          <span>SHOW</span>
          <select
            value={mode}
            onChange={(e) => {
              setMode(e.target.value as "all" | "forecast");
              setPage(0);
            }}
          >
            <option value="all">All scheduled games</option>
            <option value="forecast">With a model forecast</option>
          </select>
        </label>
        <label className="control">
          <span>MODEL SIGNAL</span>
          <select
            value={signal}
            onChange={(e) => {
              setSignal(e.target.value as FootballMatchupSignal);
              setPage(0);
            }}
          >
            <option value="all">All forecast signals</option>
            <option value="toss-up">Toss-ups · under 60%</option>
            <option value="lean">Leans · 60–74.9%</option>
            <option value="strong">Strong leans · 75%+</option>
          </select>
        </label>
        <label className="control">
          <span>SORT BY</span>
          <select
            value={sort}
            onChange={(e) => {
              setSort(e.target.value as FootballMatchupSort);
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
        <button
          className="button secondary"
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(window.location.href);
              setCopied("Slate link copied.");
            } catch {
              setCopied("Copy the filtered URL from your address bar.");
            }
          }}
        >
          Copy slate link
        </button>
      </div>
      {copied && <p className="note" role="status">{copied}</p>}
      <p className="note" style={{ marginBottom: 22 }}>
        {rows.length} matchups · Generated {date(generated)} · {liveGames
          ? division === "d1"
            ? "Live D1 forecast rows are applied to the published cards."
            : "Lower-division schedule rows are shown; forecasts appear only where the model has an eligible projection."
          : liveError
            ? `${liveError} Showing the published snapshot.`
            : "Checking the live D1 forecast edition…"}
      </p>
      {liveMarketComparisons && <p className="note" role="status">Live football market ledger checked; {marketLinkedRows.length.toLocaleString()} upcoming games have one or more qualifying comparisons from the active model edition.</p>}
      {liveMarketError && <p className="note" role="status">{liveMarketError} The archived market coverage panel remains available.</p>}
      <section className="paper-panel football-forecast-readiness" aria-labelledby="football-forecast-readiness-title">
        <div className="section-heading" style={{ marginBottom: 12 }}>
          <div>
            <div className="eyebrow">FORECAST READINESS / UPCOMING SLATE</div>
            <h2 id="football-forecast-readiness-title">What each division has behind its forecast</h2>
          </div>
          <span className="note">{forecastReadiness.total_forecasted.toLocaleString()} validated forecast rows</span>
        </div>
        <p className="note">
          Counts use the exact source division on both teams. A missing row is kept visible as unavailable; malformed values do not count as forecasts. Market links require a qualifying pregame comparison for the same game and model edition.
        </p>
        <div className="table-scroll">
          <table className="data-table">
            <thead><tr><th>Division</th><th className="numeric">Scheduled</th><th className="numeric">Validated forecast</th><th className="numeric">Missing / invalid</th><th className="numeric">Model ID missing</th><th className="numeric">Market linked</th></tr></thead>
            <tbody>{forecastReadiness.rows.map((row) => <tr key={row.division}>
              <th scope="row">{row.division === "d1" ? "D1 · FBS/FCS" : row.division.toUpperCase()}</th>
              <td className="numeric">{row.scheduled.toLocaleString()}</td>
              <td className="numeric">{row.forecasted.toLocaleString()}</td>
              <td className="numeric">{row.missing_forecast.toLocaleString()}</td>
              <td className="numeric">{row.unlabeled_forecast.toLocaleString()}</td>
              <td className="numeric">{row.market_linked.toLocaleString()}</td>
            </tr>)}</tbody>
          </table>
        </div>
        {forecastReadiness.mixed_division_games || forecastReadiness.invalid_forecasts ? <p className="note" style={{ marginTop: 12 }}>
          {forecastReadiness.mixed_division_games ? `${forecastReadiness.mixed_division_games.toLocaleString()} mixed or unknown-division ${forecastReadiness.mixed_division_games === 1 ? "game remains" : "games remain"} outside the division totals. ` : ""}
          {forecastReadiness.invalid_forecasts ? `${forecastReadiness.invalid_forecasts.toLocaleString()} malformed forecast ${forecastReadiness.invalid_forecasts === 1 ? "row was" : "rows were"} withheld.` : ""}
        </p> : null}
      </section>
      <section className="paper-panel football-market-status" aria-labelledby="football-market-status-title">
        <div>
          <div className="eyebrow">MARKET EVIDENCE</div>
          <h2 id="football-market-status-title">Lines stay attached to their timestamps.</h2>
        </div>
        <p>
          {marketCoverage
            ? `${marketCoverage.market_observations.toLocaleString()} retained football market observations are available in the historical archive; ${marketCoverage.pregame_market_observations.toLocaleString()} currently qualify as pregame records.`
            : "The historical football market archive is available from the research desk."} {marketCoverage?.pregame_market_observations
            ? "Cards show the matching archived checkpoint when one is present."
            : "No verified pregame quote is attached to these cards, so the desk does not imply a live betting edge."}
        </p>
        <Link href="/research/markets/?sport=football">Open the football market archive →</Link>
      </section>
      {liveMarketComparisons && (
        <section className="paper-panel football-market-links" aria-labelledby="football-market-links-title">
          <div className="section-heading" style={{ marginBottom: 12 }}>
            <div>
              <div className="eyebrow">MODEL / MARKET CONNECTION</div>
              <h2 id="football-market-links-title">Upcoming forecasts with a qualifying line</h2>
            </div>
            <span className="note">{marketLinkedRows.length.toLocaleString()} games linked</span>
          </div>
          <p className="note">
            These rows join the published forecast to a timestamped pregame quote for the exact game. Spread and total gaps are model estimate minus the observed line; moneyline rows show the model and market home win probabilities.
          </p>
          {marketLinkedRows.length ? (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Matchup / start</th>
                    <th className="numeric">Model margin</th>
                    <th className="numeric">Model home win</th>
                    <th className="numeric">Spread / gap</th>
                    <th className="numeric">Total / gap</th>
                    <th>Captured</th>
                  </tr>
                </thead>
                <tbody>
                  {marketLinkedRows.slice(0, 12).map(({ game, comparisons }) => {
                    const spread = comparisons.find((quote) => quote.market === "spreads");
                    const total = comparisons.find((quote) => quote.market === "totals");
                    const captured = comparisons[0]?.captured_at;
                    return (
                      <tr key={game.id}>
                        <td>
                          <Link href={`/research/game/?sport=football&id=${encodeURIComponent(game.id)}`}>
                            {game.away_name} at {game.home_name}
                          </Link>
                          <small>{kick(game.kickoff)}</small>
                        </td>
                        <td className="numeric">{fmt(game.prediction?.home_margin)}</td>
                        <td className="numeric">{game.prediction?.home_win_probability == null ? "—" : `${fmt(game.prediction.home_win_probability * 100)}%`}</td>
                        <td className="numeric">{spread?.line == null ? "—" : `${spread.line > 0 ? "+" : ""}${fmt(spread.line)} / ${spread.model_difference >= 0 ? "+" : ""}${fmt(spread.model_difference)}`}</td>
                        <td className="numeric">{total?.line == null ? "—" : `${fmt(total.line)} / ${total.model_difference >= 0 ? "+" : ""}${fmt(total.model_difference)}`}</td>
                        <td>{captured ? kick(captured) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="empty">No upcoming model forecast currently has a qualifying market quote attached.</p>
          )}
          {marketLinkedRows.length > 12 && <p className="note" style={{ marginTop: 12 }}>Showing the first 12 linked games by scheduled start. The cards and research ledger retain all {marketLinkedRows.length.toLocaleString()} connections.</p>}
        </section>
      )}
      <div className="section-heading" style={{ marginBottom: 20 }}>
        <p>{rows.length} games in the filtered slate</p>
        <button
          className="button secondary"
          type="button"
          onClick={() => downloadCsv(
            "football-matchups.csv",
            toCsv(
              ["Scheduled start", "Week", "Away program", "Home program", "Away conference", "Home conference", "Neutral", "Projected away score", "Projected home score", "Home win probability", "Projected home margin", "Margin range low", "Margin range high", "Archived home spread", "Archived total", "Model spread gap", "Model total gap", "Market source", "Market observed at", "Qualifying market quote count", "Market quote snapshots"],
              rows.map((g) => [g.kickoff, g.week, g.away_name, g.home_name, g.away_conference, g.home_conference, g.neutral ? "yes" : "no", g.prediction?.away_score, g.prediction?.home_score, g.prediction?.home_win_probability == null ? null : g.prediction.home_win_probability * 100, g.prediction?.home_score == null || g.prediction?.away_score == null ? null : g.prediction.home_score - g.prediction.away_score, g.prediction?.margin_low, g.prediction?.margin_high, g.market?.home_spread, g.market?.total, g.market?.margin_difference, g.market?.total == null || g.prediction?.total == null ? null : g.prediction.total - g.market.total, g.market?.source, g.market?.observed_at, linkedComparisons(g).length, linkedComparisons(g).map(comparisonQuoteSummary).join(" | ")]),
            ),
          )}
        >
          Download CSV ↓
        </button>
      </div>
      {prepRows.length > 0 && (
        <section className="paper-panel matchup-prep-panel" aria-labelledby="football-prep-title">
          <div className="section-heading">
            <div><span className="eyebrow">COACH PREP</span><h2 id="football-prep-title">Prep list</h2></div>
            <button className="button secondary" type="button" onClick={() => setPrepIds([])}>Clear list</button>
          </div>
          <p className="note">Keep up to 12 games across filters. The list persists on this device and travels with the copied slate URL.</p>
          <div className="matchup-prep-list">
            {prepRows.map((game) => (
              <div className="matchup-prep-item" key={game.id}>
                <div><strong>{game.away_name} at {game.home_name}</strong><small>{game.time_tbd ? `${date(game.kickoff)} · time TBD` : kick(game.kickoff)}</small></div>
                <div className="button-row"><Link className="note" href={`/research/briefs/?sport=football&game=${encodeURIComponent(game.id)}`}>Brief ↗</Link><button className="button secondary" type="button" onClick={() => togglePrep(game.id)}>Remove</button></div>
              </div>
            ))}
          </div>
        </section>
      )}
      <div className="match-grid">
        {rows.slice(page * 12, page * 12 + 12).map((g) => (
          <div className="matchup-card-wrap" key={g.id}>
            <MatchCard
              game={(() => {
                const current = applyLiveFootballMarketComparisons(g, liveMarketComparisons, modelId);
                return current.prediction
                  ? {
                      ...current,
                      prediction: {
                        ...current.prediction,
                        model_id: current.prediction.model_id || modelId,
                        generated_at: current.prediction.generated_at || generated,
                      },
                    }
                  : current;
              })()}
              efficiencyScenario={scenarioByGame.get(g.id)}
              intel={matchupIntel ? {
                playerSeason: matchupIntel.playerSeason,
                programs: [matchupIntel.programs[g.away_id], matchupIntel.programs[g.home_id]].filter((program) => program != null),
              } : undefined}
              recruiting={recruitingContext ? {
                away: recruitingContext.get(g.away_id),
                home: recruitingContext.get(g.home_id),
              } : undefined}
              model={model}
            />
            <button className="button secondary matchup-prep-toggle" type="button" aria-pressed={prepIds.includes(g.id)} onClick={() => togglePrep(g.id)}>
              {prepIds.includes(g.id) ? "✓ In prep list" : prepIds.length >= 12 ? "Prep list full" : "+ Add to prep list"}
            </button>
          </div>
        ))}
      </div>
      {!rows.length && (
        <p className="empty">
          No matchups match these filters. Try a different team or week.
        </p>
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
