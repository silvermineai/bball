"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { BBGame, BBOverview, BBRosterScenario } from "../../_lib/basketball-types";
import type { Comparison } from "../../_lib/research-types";
import { downloadCsv, toCsv } from "../../_lib/csv";
import { date, fmt, kick } from "../../_lib/format";
import ManualMarketCheck from "../briefs/ManualMarketCheck";
import {
  loadLiveBasketballForecasts,
  loadLiveBasketballMarketComparisons,
  mergeLiveBasketballForecasts,
} from "../../_lib/live-basketball-forecasts";
import {
  forecastLabFilterSearch,
  parseForecastLabFilters,
  type ForecastLabSort,
  type ForecastLabView,
} from "../../_lib/forecast-lab-view";

type View = ForecastLabView;
type Sort = ForecastLabSort;

type Row = {
  game: BBGame;
  prediction: NonNullable<BBGame["prediction"]>;
  scenario: BBRosterScenario | null;
  comparisons: Comparison[];
};

type LiveModel = {
  model_id: string;
  version?: string | null;
  forecasts: number;
  last_created_at: string | null;
  target_season: number | null;
  cutoff: string | null;
  training_games?: number | null;
};
type LiveCatalog = { models: LiveModel[] };

function numeric(value: number | null | undefined, digits = 1) {
  return value == null || !Number.isFinite(value) ? "—" : value.toFixed(digits);
}

function marketQuote(comparisons: Comparison[], market: Comparison["market"]) {
  return comparisons.find((quote) => quote.market === market) || null;
}

function signed(value: number | null | undefined, suffix = " pts") {
  return value == null || !Number.isFinite(value) ? "—" : `${value > 0 ? "+" : ""}${value.toFixed(1)}${suffix}`;
}

function modelRow(game: BBGame, scenario: BBRosterScenario | undefined, comparisons: Comparison[] | undefined): Row | null {
  const prediction = game.prediction || game.fallback_prediction;
  if (!prediction) return null;
  return { game, prediction, scenario: scenario || null, comparisons: comparisons || [] };
}

function sortRows(rows: Row[], sort: Sort) {
  return [...rows].sort((a, b) => {
    if (sort === "date") return a.game.starts_at.localeCompare(b.game.starts_at);
    if (sort === "disagreement") {
      return Math.abs(b.scenario?.margin_delta || 0) - Math.abs(a.scenario?.margin_delta || 0)
        || a.game.starts_at.localeCompare(b.game.starts_at);
    }
    if (sort === "confidence") {
      const ac = Math.max(a.prediction.home_win_probability, 1 - a.prediction.home_win_probability);
      const bc = Math.max(b.prediction.home_win_probability, 1 - b.prediction.home_win_probability);
      return bc - ac || a.game.starts_at.localeCompare(b.game.starts_at);
    }
    return (b.prediction.margin_high - b.prediction.margin_low) - (a.prediction.margin_high - a.prediction.margin_low)
      || a.game.starts_at.localeCompare(b.game.starts_at);
  });
}

export default function ForecastLab({
  overview,
  scenarios,
  markets,
}: {
  overview: BBOverview;
  scenarios: BBRosterScenario[];
  markets: Record<string, Comparison[]>;
}) {
  const params = useSearchParams();
  const initial = parseForecastLabFilters(params.toString());
  const [query, setQuery] = useState(initial.query);
  const [view, setView] = useState<View>(initial.view);
  const [sort, setSort] = useState<Sort>(initial.sort);
  const [marketGameId, setMarketGameId] = useState(initial.gameId);
  const [modelSelection, setModelSelection] = useState(initial.model);
  const [copied, setCopied] = useState("");
  const [liveCatalog, setLiveCatalog] = useState<LiveCatalog | null>(null);
  const [liveCatalogError, setLiveCatalogError] = useState("");
  const [liveGames, setLiveGames] = useState<BBGame[] | null>(null);
  const [liveMarkets, setLiveMarkets] = useState<Record<string, Comparison[]> | null>(null);
  const [liveMarketsError, setLiveMarketsError] = useState("");
  const [liveGamesError, setLiveGamesError] = useState("");
  const scenarioByGame = useMemo(() => new Map(scenarios.map((row) => [row.game_id, row])), [scenarios]);
  const activeGames = liveGames || overview.upcoming;

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/basketball/research/forecasts?season=2027&meta=1", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("The live forecast catalog is unavailable.");
        return response.json() as Promise<LiveCatalog>;
      })
      .then((value) => {
        if (!controller.signal.aborted) setLiveCatalog(value);
      })
      .catch((reason: unknown) => {
        if ((reason as { name?: string })?.name !== "AbortError") {
          setLiveCatalogError(reason instanceof Error ? reason.message : "The live forecast catalog is unavailable.");
        }
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLiveGames(null);
    loadLiveBasketballForecasts(controller.signal, { model: modelSelection })
      .then((rows) => {
        if (!controller.signal.aborted) {
          setLiveGames(mergeLiveBasketballForecasts(overview.upcoming, rows));
          setLiveGamesError("");
        }
      })
      .catch((reason: unknown) => {
        if ((reason as { name?: string })?.name !== "AbortError" && !controller.signal.aborted) {
          setLiveGamesError(reason instanceof Error ? reason.message : "Live matchup forecasts unavailable.");
        }
      });
    return () => controller.abort();
  }, [modelSelection, overview.upcoming]);

  useEffect(() => {
    const controller = new AbortController();
    loadLiveBasketballMarketComparisons(controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) {
          setLiveMarkets(value);
          setLiveMarketsError("");
        }
      })
      .catch((reason: unknown) => {
        if ((reason as { name?: string })?.name !== "AbortError" && !controller.signal.aborted) {
          setLiveMarketsError(reason instanceof Error ? reason.message : "Live market comparisons unavailable.");
        }
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const next = forecastLabFilterSearch({ query, view, sort, gameId: marketGameId, model: modelSelection });
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${next}`);
  }, [marketGameId, modelSelection, query, sort, view]);

  const rows = useMemo(() => {
    const search = query.trim().toLowerCase();
    const candidates = activeGames
      .filter((game) => !search || `${game.home_name} ${game.away_name}`.toLowerCase().includes(search))
      .map((game) => modelRow(
        game,
        modelSelection === "latest" ? scenarioByGame.get(game.id) : undefined,
        modelSelection === "latest" ? (liveMarkets || markets)[game.id] : undefined,
      ));
    return sortRows(
      candidates.filter((row): row is Row => !!row).filter((row) => {
        if (view === "scenario") return !!row.scenario;
        if (view === "cold-start") return !row.game.prediction && !!row.game.fallback_prediction;
        if (view === "market") return row.comparisons.length > 0;
        return true;
      }),
      sort,
    );
  }, [activeGames, liveMarkets, markets, modelSelection, query, scenarioByGame, sort, view]);

  const scenarioCount = rows.filter((row) => row.scenario).length;
  const disagreement = rows.filter((row) => row.scenario).reduce((best, row) => Math.max(best, Math.abs(row.scenario!.margin_delta)), 0);
  const modeledGames = activeGames.filter((game) => game.prediction || game.fallback_prediction);
  const activeMarkets = liveMarkets || markets;
  const verifiedMarketGames = modelSelection === "latest"
    ? modeledGames.filter((game) => (activeMarkets[game.id] || []).length > 0).length
    : 0;
  const marketRow = rows.find((row) => row.game.id === marketGameId) || rows[0];
  useEffect(() => {
    if (rows.length && !rows.some((row) => row.game.id === marketGameId)) {
      setMarketGameId(rows[0].game.id);
    }
  }, [marketGameId, rows]);
  const liveModel = modelSelection === "latest"
    ? liveCatalog?.models[0] || null
    : liveCatalog?.models.find((model) => model.model_id === modelSelection) || null;
  const exportRows = () => downloadCsv(
    "basketball-forecast-lab.csv",
    toCsv(
      ["Scheduled start", "Away", "Home", "Estimate type", "Primary home margin", "Roster scenario home margin", "Roster delta", "Home win probability", "Margin range low", "Margin range high", "Verified market observations", "Latest home spread", "Spread edge", "Latest total", "Total edge", "No-vig market home probability", "Moneyline probability edge", "Brief"],
      rows.map((row) => [
        row.game.starts_at,
        row.game.away_name,
        row.game.home_name,
        row.game.prediction ? "primary" : "cold-start",
        row.prediction.home_margin,
        row.scenario?.roster_margin,
        row.scenario?.margin_delta,
        row.prediction.home_win_probability * 100,
        row.prediction.margin_low,
        row.prediction.margin_high,
        row.comparisons.length,
        marketQuote(row.comparisons, "spreads")?.line,
        marketQuote(row.comparisons, "spreads")?.model_difference,
        marketQuote(row.comparisons, "totals")?.line,
        marketQuote(row.comparisons, "totals")?.model_difference,
        marketQuote(row.comparisons, "h2h")?.market_home_probability == null ? null : marketQuote(row.comparisons, "h2h")!.market_home_probability! * 100,
        marketQuote(row.comparisons, "h2h")?.model_difference == null ? null : marketQuote(row.comparisons, "h2h")!.model_difference * 100,
        row.game.prediction ? `https://bball.silvermine.dev/basketball/briefs/${row.game.id}/` : null,
      ]),
    ),
  );
  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied("Forecast lab link copied.");
    } catch {
      setCopied("Copy the filtered URL from your address bar.");
    }
  };

  return (
    <>
      <div className="toolbar">
        <label className="control"><span>PROGRAM</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search either program" /></label>
        <label className="control"><span>MODEL EDITION</span><select value={modelSelection} onChange={(event) => { setModelSelection(event.target.value); setMarketGameId(""); }}><option value="latest">Latest registered model</option>{liveCatalog?.models.map((model) => <option value={model.model_id} key={model.model_id}>{model.version || model.model_id} · {model.forecasts.toLocaleString()} rows</option>)}</select></label>
        <label className="control"><span>VIEW</span><select value={view} onChange={(event) => setView(event.target.value as View)}><option value="all">All modeled games</option><option value="scenario">Roster challenger available</option><option value="cold-start">Cold-start estimates</option><option value="market">Verified market observations</option></select></label>
        <label className="control"><span>ORDER</span><select value={sort} onChange={(event) => setSort(event.target.value as Sort)}><option value="date">Scheduled date</option><option value="disagreement">Largest roster disagreement</option><option value="confidence">Strongest primary signal</option><option value="uncertainty">Widest primary range</option></select></label>
      </div>
      <div className="button-row" style={{ marginTop: 12 }}>
        <button className="button secondary" type="button" onClick={share}>Copy forecast lab link</button>
        {copied && <span className="note" role="status">{copied}</span>}
      </div>
      <p className="note">This board compares published model artifacts. The roster challenger is a research scenario and does not change the primary probability, interval, ledger registration or market interpretation. Market comparisons are shown only for the latest registered edition because their model ID is part of the evidence boundary.</p>
      <div className="strip" style={{ borderTop: "1px solid var(--ink)" }}>
        <div><strong>{rows.length.toLocaleString()}</strong><span>Games in view</span></div>
        <div><strong>{scenarioCount.toLocaleString()}</strong><span>Roster scenarios</span></div>
        <div><strong>{disagreement ? `${numeric(disagreement)} pts` : "—"}</strong><span>Largest scenario shift</span></div>
        <div><strong>{liveModel?.version || (modelSelection === "latest" ? overview.model.version : modelSelection)}</strong><span>Selected model edition</span></div>
      </div>
      <section className="section two-col forecast-release-status" style={{ marginTop: 26 }}>
        <div className="paper-panel">
          <div className="eyebrow">Release health / model clock</div>
          <h2>{overview.coverage.forecast_games.toLocaleString()} forecasts are registered.</h2>
          <p>Generated {date(overview.generated_at)} from a cutoff of {date(overview.model.cutoff)}. The primary fit uses {overview.model.training_games.toLocaleString()} paired games across {overview.model.training_seasons.join(", ")}.</p>
          <p className="note">Retrospective holdout: {numeric(overview.model.evaluation.winner_accuracy * 100)}% winner accuracy · {numeric(overview.model.evaluation.margin_mae)} point margin MAE · {numeric(overview.model.evaluation.interval_coverage * 100)}% interval coverage.</p>
        </div>
        <div className="paper-panel">
          <div className="eyebrow">Market evidence / availability</div>
          <h2>{verifiedMarketGames ? `${verifiedMarketGames.toLocaleString()} games with verified quotes.` : "No verified quotes in this edition."}</h2>
          <p>{verifiedMarketGames ? "These rows passed the provider, participant, timestamp and pregame checks and can enter the settled model-versus-market scorecard." : liveMarketsError ? `${liveMarketsError} No licensed odds snapshot is available in the bundled edition.` : "No licensed odds snapshot has been captured for the current slate. That is unavailable evidence, not a zero edge; the browser-only line checker remains available for a source you observed."}</p>
          <p><Link href="/research/markets/">Open market archive →</Link> · <Link href="/research/scorecard/?sport=basketball">Open forecast record →</Link></p>
        </div>
      </section>
      <section className="section" style={{ marginTop: 26 }}>
        <div className="paper-panel">
          <div className="eyebrow">Live D1 catalog / deployed record</div>
          <h2>{liveCatalog ? `${(liveModel?.forecasts ?? 0).toLocaleString()} rows in the selected edition.` : liveCatalogError ? "Live catalog unavailable." : "Checking the live catalog…"}</h2>
          {liveCatalog ? (liveModel ? <p>{modelSelection === "latest" ? (liveModel.model_id === overview.model.id ? "The deployed D1 model matches this page’s static edition." : `D1’s newest model is ${liveModel.model_id}; this page is showing ${overview.model.id}.`) : `This historical edition is ${liveModel.model_id}.`} Last forecast clock: {liveModel.last_created_at ? date(liveModel.last_created_at) : "unavailable"}.</p> : <p>No 2026–27 model edition is registered in D1.</p>) : <p>{liveCatalogError || "Reading the deployed forecast catalog from D1."}</p>}
          <p className="note"><Link href="/research/scorecard/?sport=basketball">Open the forecast record →</Link> · <Link href="/basketball/model/">Read the model notebook →</Link></p>
        </div>
      </section>
      <p className="note" role="status">
        {liveGames
          ? `Live D1 matchup rows: ${liveGames.filter((game) => game.prediction).length.toLocaleString()} modeled · sorting and exports use the latest registered edition.`
          : liveGamesError
            ? `${liveGamesError} Showing the published static edition.`
            : "Checking live matchup rows…"}
      </p>
      {marketRow && (
        <section className="section market-workbench">
          <div className="section-heading">
            <div>
              <div className="eyebrow">Reader tool / Manual quote check</div>
              <h2>Test a line against any game in view.</h2>
            </div>
            <span className="note">Browser only · never published</span>
          </div>
          <label className="control market-game-picker">
            <span>GAME</span>
            <select value={marketRow.game.id} onChange={(event) => setMarketGameId(event.target.value)}>
              {rows.map((row) => <option value={row.game.id} key={row.game.id}>{row.game.away_name} at {row.game.home_name} · {date(row.game.starts_at)}</option>)}
            </select>
          </label>
          <ManualMarketCheck
            key={marketRow.game.id}
            storageKey={`forecast-lab:${marketRow.game.id}`}
            gameId={marketRow.game.id}
            homeName={marketRow.game.home_name}
            modelMargin={marketRow.prediction.home_margin}
            modelMarginLow={marketRow.prediction.margin_low}
            modelMarginHigh={marketRow.prediction.margin_high}
            modelTotal={marketRow.prediction.total}
            modelHomeWinProbability={marketRow.prediction.home_win_probability}
          />
        </section>
      )}
      <div className="section-heading" style={{ marginTop: 28, marginBottom: 20 }}>
        <p>{rows.length.toLocaleString()} modeled games · generated {date(overview.generated_at)} · primary cutoff {date(overview.model.cutoff)}</p>
        <button className="button secondary" type="button" onClick={exportRows}>Download comparison CSV ↓</button>
      </div>
      <div className="table-scroll">
      <table className="data-table">
          <thead><tr><th>Game</th><th>Primary model</th><th>Roster challenger</th><th>Range / confidence</th><th>Market comparison</th></tr></thead>
          <tbody>{rows.map((row) => {
            const p = row.prediction;
            const confidence = Math.max(p.home_win_probability, 1 - p.home_win_probability);
            return <tr key={row.game.id}>
              <td><strong>{row.game.away_name} at {row.game.home_name}</strong><small>{row.game.time_tbd ? `${date(row.game.starts_at)} · time TBD` : kick(row.game.starts_at)}{row.game.neutral ? " · neutral" : ""}</small>{row.game.prediction && <small><Link href={`/basketball/briefs/${row.game.id}/`}>Open matchup brief →</Link></small>}</td>
              <td className="numeric"><strong>{numeric(p.home_margin, 1)}</strong><small>{numeric(p.home_win_probability * 100)}% home · {numeric(p.total, 1)} total</small><small>{row.game.prediction ? "primary" : "cold-start"}</small></td>
              <td className="numeric">{row.scenario ? <><strong>{numeric(row.scenario.roster_margin, 1)}</strong><small>{row.scenario.margin_delta >= 0 ? "+" : ""}{numeric(row.scenario.margin_delta, 1)} pts vs primary</small><small>prior net + exact-ID continuity</small></> : <span>—</span>}</td>
              <td className="numeric"><strong>{numeric(p.margin_low, 1)} to {numeric(p.margin_high, 1)}</strong><small>{numeric(confidence * 100)}% strongest-side confidence</small><small>{numeric(p.pace, 1)} possessions</small></td>
              <td>{row.comparisons.length ? <><strong>{row.comparisons.length} verified quote{row.comparisons.length === 1 ? "" : "s"}</strong><small>{row.comparisons[0].bookmaker} · {row.comparisons[0].market}</small>{marketQuote(row.comparisons, "spreads") && <small>Spread {numeric(marketQuote(row.comparisons, "spreads")!.line)} · edge {signed(marketQuote(row.comparisons, "spreads")!.model_difference)}</small>}{marketQuote(row.comparisons, "totals") && <small>Total {numeric(marketQuote(row.comparisons, "totals")!.line)} · edge {signed(marketQuote(row.comparisons, "totals")!.model_difference)}</small>}{marketQuote(row.comparisons, "h2h") && <small>No-vig home {numeric(marketQuote(row.comparisons, "h2h")!.market_home_probability == null ? null : marketQuote(row.comparisons, "h2h")!.market_home_probability! * 100)}% · edge {signed(marketQuote(row.comparisons, "h2h")!.model_difference * 100, " pp")}</small>}</> : <span className="muted">No verified market quote</span>}</td>
            </tr>;
          })}</tbody>
        </table>
      </div>
      {!rows.length && <p className="empty">No modeled games match this view.</p>}
      <section className="section two-col" style={{ marginTop: 34 }}>
        <div className="paper-panel"><div className="eyebrow">Read the disagreement</div><h2>Primary model first. Scenario second.</h2><p>The primary forecast is the historical opponent-adjusted efficiency and tempo model. The roster challenger uses prior net efficiency plus exact source-athlete-ID continuity and prior minutes. A positive scenario delta moves the modeled home margin up; it is a research prompt, not an adjusted win probability.</p></div>
        <div className="paper-panel"><div className="eyebrow">Verify the inputs</div><h2>Every row has a trail.</h2><p>Open a matchup brief for Four Factors, historical workload, source roster observations and the research ledger. Market rows appear only when a licensed pregame quote matched the exact game, participants and start time.</p><p><Link href="/basketball/model/">Read the model notebook →</Link> · <Link href="/basketball/recruiting/">Review recruiting evidence →</Link></p></div>
      </section>
    </>
  );
}
