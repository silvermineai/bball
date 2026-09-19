"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { BBGame, BBOverview, BBRosterScenario } from "../../_lib/basketball-types";
import type { Comparison } from "../../_lib/research-types";
import {
  forecastEvidenceCoverage,
  forecastSignalContext,
  type ForecastEvidenceCoverage,
  type ForecastMatchupSignal,
  type ForecastSignalContext,
} from "../../_lib/forecast-lab-analysis";
import { downloadCsv, toCsv } from "../../_lib/csv";
import { date, fmt, kick } from "../../_lib/format";
import ManualMarketCheck from "../briefs/ManualMarketCheck";
import {
  loadLiveBasketballForecasts,
  loadLiveBasketballMarketComparisons,
  mergeLiveBasketballForecasts,
} from "../../_lib/live-basketball-forecasts";
import {
  loadLiveBasketballScheduleClocks,
  type ScheduleClockRow,
} from "../../_lib/live-basketball-schedule";
import {
  forecastLabFilterSearch,
  formatForecastModelOption,
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
  modelDelta: ModelDelta | null;
  factorSignal: ForecastMatchupSignal | null;
  evidence: ForecastEvidenceCoverage;
  signal: ForecastSignalContext;
};

type ModelDelta = {
  margin: number;
  total: number;
  winProbability: number;
  latestModelId?: string;
};

type LiveModel = {
  model_id: string;
  version?: string | null;
  forecasts: number;
  primary_forecasts?: number;
  cold_start_forecasts?: number;
  invalid_forecasts?: number;
  last_created_at: string | null;
  target_season: number | null;
  cutoff: string | null;
  training_games?: number | null;
  training_seasons?: number[];
  calibration_season?: number | null;
  calibration_games?: number | null;
  margin_half_width?: number | null;
  evaluation_season?: number | null;
  evaluation_games?: number | null;
  evaluation_winner_accuracy?: number | null;
  evaluation_margin_mae?: number | null;
  evaluation_interval_coverage?: number | null;
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

function modelRow(
  game: BBGame,
  scenario: BBRosterScenario | undefined,
  comparisons: Comparison[] | undefined,
  modelDelta: ModelDelta | null,
  factorSignal: ForecastMatchupSignal | undefined,
  scheduled: boolean,
): Row | null {
  const prediction = game.prediction || game.fallback_prediction;
  if (!prediction) return null;
  const marketComparisons = comparisons || [];
  return {
    game,
    prediction,
    scenario: scenario || null,
    comparisons: marketComparisons,
    modelDelta,
    factorSignal: factorSignal || null,
    signal: forecastSignalContext(prediction, !!game.prediction),
    evidence: forecastEvidenceCoverage({
      primary: !!game.prediction,
      scheduled,
      factors: !!factorSignal,
      roster: !!scenario,
      market: marketComparisons.length > 0,
    }),
  };
}

function sortRows(rows: Row[], sort: Sort) {
  return [...rows].sort((a, b) => {
    if (sort === "date") return a.game.starts_at.localeCompare(b.game.starts_at);
    if (sort === "coverage") {
      return a.evidence.present - b.evidence.present
        || Number(a.evidence.market === "verified") - Number(b.evidence.market === "verified")
        || a.game.starts_at.localeCompare(b.game.starts_at);
    }
    if (sort === "disagreement") {
      return Math.max(Math.abs(b.scenario?.margin_delta || 0), Math.abs(b.modelDelta?.margin || 0))
        - Math.max(Math.abs(a.scenario?.margin_delta || 0), Math.abs(a.modelDelta?.margin || 0))
        || a.game.starts_at.localeCompare(b.game.starts_at);
    }
    if (sort === "confidence") {
      const ac = Math.max(a.prediction.home_win_probability, 1 - a.prediction.home_win_probability);
      const bc = Math.max(b.prediction.home_win_probability, 1 - b.prediction.home_win_probability);
      return bc - ac || a.game.starts_at.localeCompare(b.game.starts_at);
    }
    if (sort === "factor") {
      return Math.abs(b.factorSignal?.edge || 0) - Math.abs(a.factorSignal?.edge || 0)
        || a.game.starts_at.localeCompare(b.game.starts_at);
    }
    return (b.prediction.margin_high - b.prediction.margin_low) - (a.prediction.margin_high - a.prediction.margin_low)
      || a.game.starts_at.localeCompare(b.game.starts_at);
  });
}

export default function ForecastLab({
  overview,
  scenarios,
  rosterPrimaryModelId,
  markets,
  factorSignals,
  factorSignalModelId,
}: {
  overview: BBOverview;
  scenarios: BBRosterScenario[];
  rosterPrimaryModelId: string;
  markets: Record<string, Comparison[]>;
  factorSignals: Record<string, ForecastMatchupSignal>;
  factorSignalModelId: string;
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
  const [latestGames, setLatestGames] = useState<BBGame[] | null>(null);
  const [latestGamesError, setLatestGamesError] = useState("");
  const [scheduleClocks, setScheduleClocks] = useState<ScheduleClockRow[]>([]);
  const [scheduleClockConfirmed, setScheduleClockConfirmed] = useState<number | null>(null);
  const [scheduleClockError, setScheduleClockError] = useState("");
  const scenarioByGame = useMemo(() => new Map(scenarios.map((row) => [row.game_id, row])), [scenarios]);
  const scheduleClockByGame = useMemo(() => new Map(scheduleClocks.map((row) => [row.game_id, row])), [scheduleClocks]);
  const activeGames = liveGames || overview.upcoming;

  useEffect(() => {
    const controller = new AbortController();
    loadLiveBasketballScheduleClocks(controller.signal)
      .then((payload) => {
        if (!controller.signal.aborted) {
          setScheduleClocks(payload.rows || []);
          setScheduleClockConfirmed(payload.confirmed_count ?? (payload.rows || []).filter((row) => row.source_time_valid).length);
          setScheduleClockError("");
        }
      })
      .catch((reason: unknown) => {
        if ((reason as { name?: string })?.name !== "AbortError" && !controller.signal.aborted) {
          setScheduleClockConfirmed(null);
          setScheduleClockError(reason instanceof Error ? reason.message : "Live schedule-clock evidence unavailable.");
        }
      });
    return () => controller.abort();
  }, []);

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
    if (modelSelection === "latest") {
      setLatestGames(null);
      setLatestGamesError("");
      return;
    }
    const controller = new AbortController();
    setLatestGames(null);
    loadLiveBasketballForecasts(controller.signal, { model: "latest" })
      .then((rows) => {
        if (!controller.signal.aborted) {
          setLatestGames(mergeLiveBasketballForecasts(overview.upcoming, rows));
          setLatestGamesError("");
        }
      })
      .catch((reason: unknown) => {
        if ((reason as { name?: string })?.name !== "AbortError" && !controller.signal.aborted) {
          setLatestGamesError(reason instanceof Error ? reason.message : "Latest model forecasts unavailable.");
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
    const selectedModelId = modelSelection === "latest"
      ? liveCatalog?.models[0]?.model_id || overview.model.id
      : modelSelection;
    const factorEditionMatches = selectedModelId === factorSignalModelId;
    const rosterEditionMatches = selectedModelId === rosterPrimaryModelId;
    const latestById = new Map(
      (modelSelection === "latest" ? activeGames : latestGames || []).map((game) => [game.id, game]),
    );
    const candidates = activeGames
      .filter((game) => !search || `${game.home_name} ${game.away_name}`.toLowerCase().includes(search))
      .map((game) => modelRow(
        game,
        modelSelection === "latest" && rosterEditionMatches ? scenarioByGame.get(game.id) : undefined,
        modelSelection === "latest" ? (liveMarkets || markets)[game.id] : undefined,
        modelSelection === "latest"
          ? null
          : (() => {
              const latest = latestById.get(game.id)?.prediction;
              const selected = game.prediction;
              return latest && selected
                ? {
                    margin: selected.home_margin - latest.home_margin,
                    total: selected.total - latest.total,
                    winProbability: selected.home_win_probability - latest.home_win_probability,
                    latestModelId: liveCatalog?.models[0]?.model_id,
                  }
                : null;
            })(),
        factorEditionMatches ? factorSignals[game.id] : undefined,
        scheduleClockByGame.get(game.id)?.source_time_valid === true || !game.time_tbd,
      ));
    return sortRows(
      candidates.filter((row): row is Row => !!row).filter((row) => {
        if (view === "scenario") return !!row.scenario;
        if (view === "cold-start") return !row.game.prediction && !!row.game.fallback_prediction;
        if (view === "market") return row.comparisons.length > 0;
        if (view === "model-delta") return !!row.modelDelta;
        if (view === "factor") return !!row.factorSignal;
        if (view === "coverage-gap") return !row.evidence.complete;
        return true;
      }),
      sort,
    );
  }, [activeGames, factorSignalModelId, factorSignals, latestGames, liveCatalog, liveMarkets, markets, modelSelection, overview.model.id, query, rosterPrimaryModelId, scenarioByGame, scheduleClockByGame, sort, view]);

  const scenarioCount = rows.filter((row) => row.scenario).length;
  const disagreement = rows.reduce(
    (best, row) => Math.max(best, Math.abs(row.scenario?.margin_delta || 0), Math.abs(row.modelDelta?.margin || 0)),
    0,
  );
  const modelDeltaCount = rows.filter((row) => row.modelDelta).length;
  const factorSignalCount = rows.filter((row) => row.factorSignal).length;
  const evidenceCompleteCount = rows.filter((row) => row.evidence.complete).length;
  const evidenceGapCount = rows.length - evidenceCompleteCount;
  const selectedModelId = modelSelection === "latest"
    ? liveCatalog?.models[0]?.model_id || overview.model.id
    : modelSelection;
  const factorEditionMatches = selectedModelId === factorSignalModelId;
  const rosterEditionMatches = selectedModelId === rosterPrimaryModelId;
  const modeledGames = activeGames.filter((game) => game.prediction || game.fallback_prediction);
  const confirmedStartCount = modeledGames.filter((game) => !game.time_tbd).length;
  const unconfirmedStartCount = modeledGames.length - confirmedStartCount;
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
  const selectedTrainingGames = liveModel?.training_games ?? (modelSelection === "latest" ? overview.model.training_games : null);
  const selectedTrainingSeasons = liveModel?.training_seasons?.length ? liveModel.training_seasons : (modelSelection === "latest" ? overview.model.training_seasons : []);
  const selectedCutoff = liveModel?.cutoff || (modelSelection === "latest" ? overview.model.cutoff : null);
  const selectedEvaluation = liveModel?.evaluation_games != null && liveModel.evaluation_winner_accuracy != null && liveModel.evaluation_margin_mae != null
    ? liveModel
    : modelSelection === "latest"
      ? { evaluation_games: overview.model.evaluation.games, evaluation_winner_accuracy: overview.model.evaluation.winner_accuracy, evaluation_margin_mae: overview.model.evaluation.margin_mae, evaluation_interval_coverage: overview.model.evaluation.interval_coverage }
      : null;
  const exportRows = () => downloadCsv(
    "basketball-forecast-lab.csv",
    toCsv(
      ["Scheduled start", "Recorded source start", "Recorded time valid", "Away", "Home", "Evidence present", "Evidence total", "Missing core evidence", "Market lineage", "Estimate type", "Signal context", "Probability edge from even (pp)", "Prediction range width", "Primary home margin", "Roster scenario home margin", "Roster delta", "Primary home win probability", "Roster scenario home win probability", "Primary margin range low", "Primary margin range high", "Roster scenario range low", "Roster scenario range high", "Roster primary model ID", "Strongest factor", "Factor side", "Factor rate gap percentage points", "Factor source season", "Factor model ID", "Verified market observations", "Latest home spread", "Spread edge", "Latest total", "Total edge", "No-vig market home probability", "Moneyline probability edge", "Edition margin delta", "Edition total delta", "Edition win probability delta", "Compared latest model", "Brief"],
      rows.map((row) => [
        row.game.starts_at,
        scheduleClockByGame.get(row.game.id)?.source_start,
        scheduleClockByGame.get(row.game.id)?.source_time_valid == null ? null : scheduleClockByGame.get(row.game.id)!.source_time_valid ? "yes" : "no",
        row.game.away_name,
        row.game.home_name,
        row.evidence.present,
        row.evidence.total,
        row.evidence.missing.join("; "),
        row.evidence.market,
        row.signal.estimate,
        row.signal.label,
        row.signal.probability_edge_pp,
        row.signal.range_width,
        row.prediction.home_margin,
        row.scenario?.roster_margin,
        row.scenario?.margin_delta,
        row.prediction.home_win_probability * 100,
        row.scenario == null ? null : row.scenario.roster_home_win_probability * 100,
        row.prediction.margin_low,
        row.prediction.margin_high,
        row.scenario?.roster_margin_low,
        row.scenario?.roster_margin_high,
        row.scenario?.primary_model_id,
        row.factorSignal?.label,
        row.factorSignal == null || row.factorSignal.edge === 0 ? null : row.factorSignal.edge > 0 ? "home" : "away",
        row.factorSignal == null ? null : Math.abs(row.factorSignal.edge) * 100,
        row.factorSignal?.season,
        row.factorSignal ? factorSignalModelId : null,
        row.comparisons.length,
        marketQuote(row.comparisons, "spreads")?.line,
        marketQuote(row.comparisons, "spreads")?.model_difference,
        marketQuote(row.comparisons, "totals")?.line,
        marketQuote(row.comparisons, "totals")?.model_difference,
        marketQuote(row.comparisons, "h2h")?.market_home_probability == null ? null : marketQuote(row.comparisons, "h2h")!.market_home_probability! * 100,
        marketQuote(row.comparisons, "h2h")?.model_difference == null ? null : marketQuote(row.comparisons, "h2h")!.model_difference * 100,
        row.modelDelta?.margin,
        row.modelDelta?.total,
        row.modelDelta?.winProbability == null ? null : row.modelDelta.winProbability * 100,
        row.modelDelta?.latestModelId,
        `https://bball.silvermine.dev/basketball/briefs/${row.game.id}/`,
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
        <label className="control"><span>MODEL EDITION</span><select value={modelSelection} onChange={(event) => { setModelSelection(event.target.value); setMarketGameId(""); }}><option value="latest">Latest registered model</option>{liveCatalog?.models.map((model) => <option value={model.model_id} key={model.model_id}>{formatForecastModelOption(model)}</option>)}</select></label>
        <label className="control"><span>VIEW</span><select value={view} onChange={(event) => setView(event.target.value as View)}><option value="all">All modeled games</option><option value="coverage-gap">Core evidence gaps</option><option value="factor">Four Factor evidence available</option><option value="scenario">Roster challenger available</option><option value="cold-start">Cold-start estimates</option><option value="market">Verified market observations</option><option value="model-delta">Model edition delta</option></select></label>
        <label className="control"><span>ORDER</span><select value={sort} onChange={(event) => setSort(event.target.value as Sort)}><option value="date">Scheduled date</option><option value="coverage">Fewest evidence checks first</option><option value="factor">Largest Four Factor mismatch</option><option value="disagreement">Largest roster disagreement</option><option value="confidence">Strongest primary signal</option><option value="uncertainty">Widest primary range</option></select></label>
      </div>
      <div className="button-row" style={{ marginTop: 12 }}>
        <button className="button secondary" type="button" onClick={share}>Copy forecast lab link</button>
        {copied && <span className="note" role="status">{copied}</span>}
      </div>
      <p className="note">This board compares published model artifacts. Each row audits four core checks: a primary team model, confirmed tip time, same-edition Four Factors and an exact-ID roster continuity scenario. Missing market evidence is reported separately because no quote is not a zero edge or a failed forecast. The roster challenger is a research scenario whose probability mapping and range reuse the matching primary edition&apos;s held-out calibration; it does not replace the ledger forecast or market interpretation. Four Factor context appears only when its source edition matches the selected model{factorEditionMatches ? ` (${factorSignalModelId})` : ""}. Choose <strong>Model edition delta</strong> with a historical edition to see that edition&apos;s margin, total and win-probability difference from the latest D1 model. Market comparisons are shown only for the latest registered edition because their model ID is part of the evidence boundary.</p>
      {!rosterEditionMatches && <p className="notice" role="status">Roster scenarios are withheld: challenger edition <span className="mono">{rosterPrimaryModelId}</span> was calibrated against a different primary model than <span className="mono">{selectedModelId}</span>. Rebuild the challenger before using continuity deltas.</p>}
      <div className="strip" style={{ borderTop: "1px solid var(--ink)" }}>
        <div><strong>{rows.length.toLocaleString()}</strong><span>Games in view</span></div>
        <div><strong>{confirmedStartCount.toLocaleString()}</strong><span>Canonical starts marked timed</span></div>
        <div><strong>{unconfirmedStartCount.toLocaleString()}</strong><span>Starts still marked TBD</span></div>
        <div><strong>{(scheduleClockConfirmed ?? scheduleClocks.filter((row) => row.source_time_valid).length).toLocaleString()}</strong><span>Recorded source clocks confirmed</span></div>
        <div><strong>{scenarioCount.toLocaleString()}</strong><span>Roster scenarios</span></div>
        <div><strong>{factorSignalCount.toLocaleString()}</strong><span>Games with factor context</span></div>
        <div><strong>{evidenceCompleteCount.toLocaleString()}</strong><span>Core evidence complete</span></div>
        <div><strong>{evidenceGapCount.toLocaleString()}</strong><span>Core evidence gaps</span></div>
        <div><strong>{disagreement ? `${numeric(disagreement)} pts` : "—"}</strong><span>Largest model/scenario shift</span></div>
        <div><strong>{liveModel?.version || (modelSelection === "latest" ? overview.model.version : modelSelection)}</strong><span>Selected model edition</span></div>
        <div><strong>{modelDeltaCount.toLocaleString()}</strong><span>Edition deltas in view</span></div>
      </div>
      <section className="section two-col forecast-release-status" style={{ marginTop: 26 }}>
          <div className="paper-panel">
            <div className="eyebrow">Release health / model clock</div>
            <h2>{liveModel && (liveModel.primary_forecasts != null || liveModel.cold_start_forecasts != null)
              ? `${liveModel.forecasts.toLocaleString()} forecast rows are registered: ${(liveModel.primary_forecasts ?? 0).toLocaleString()} primary, ${(liveModel.cold_start_forecasts ?? 0).toLocaleString()} cold-start${liveModel.invalid_forecasts ? `, ${liveModel.invalid_forecasts.toLocaleString()} invalid` : ""}.`
              : `${(liveModel?.forecasts ?? overview.coverage.forecast_games).toLocaleString()} forecasts are registered.`}</h2>
            <p>{selectedCutoff ? `The selected edition was cut off at ${date(selectedCutoff)}.` : "The selected edition does not expose a cutoff clock in the live catalog."} {selectedTrainingGames != null ? `Its fit uses ${selectedTrainingGames.toLocaleString()} paired games${selectedTrainingSeasons.length ? ` across ${selectedTrainingSeasons.join(", ")}` : ""}.` : "Training sample metadata is unavailable for this historical edition."}</p>
            <p className="note">{selectedEvaluation ? `Retrospective holdout: ${numeric(selectedEvaluation.evaluation_winner_accuracy! * 100)}% winner accuracy · ${numeric(selectedEvaluation.evaluation_margin_mae)} point margin MAE${selectedEvaluation.evaluation_interval_coverage != null ? ` · ${numeric(selectedEvaluation.evaluation_interval_coverage * 100)}% interval coverage` : ""} across ${selectedEvaluation.evaluation_games!.toLocaleString()} games.` : "No holdout metrics were published with this historical edition."}</p>
            <p className="note">Schedule readiness in this view: {confirmedStartCount.toLocaleString()} canonical rows are marked timed, while {unconfirmedStartCount.toLocaleString()} remain TBD. The separate recorded clock layer currently has {(scheduleClockConfirmed ?? scheduleClocks.filter((row) => row.source_time_valid).length).toLocaleString()} confirmed observations{scheduleClockError ? ` (${scheduleClockError})` : ""}. TBD rows remain useful forecasts, but the prospective scorecard and market checks exclude them until the source confirms the start.</p>
          </div>
        <div className="paper-panel">
          <div className="eyebrow">Market evidence / availability</div>
          <h2>{verifiedMarketGames ? `${verifiedMarketGames.toLocaleString()} games with verified quotes.` : "No verified quotes in this edition."}</h2>
          <p>{verifiedMarketGames ? "These rows passed the participant, timestamp and pregame checks and can enter the settled model-versus-market scorecard." : liveMarketsError ? `${liveMarketsError} No market snapshot is available in the bundled edition.` : "No market snapshot has been captured for the current slate. That is unavailable evidence, not a zero edge; the browser-only line checker remains available for a line you observed."}</p>
          <p><Link href="/research/markets/">Open market archive →</Link> · <Link href="/research/scorecard/?sport=basketball">Open forecast record →</Link></p>
        </div>
      </section>
      <section className="section" style={{ marginTop: 26 }}>
        <div className="paper-panel">
          <div className="eyebrow">Live D1 catalog / deployed record</div>
          <h2>{liveCatalog ? `${(liveModel?.forecasts ?? 0).toLocaleString()} rows in the selected edition.` : liveCatalogError ? "Live catalog unavailable." : "Checking the live catalog…"}</h2>
          {liveCatalog ? (liveModel ? <p>{modelSelection === "latest" ? (liveModel.model_id === overview.model.id ? "The deployed D1 model matches this page’s static edition." : `D1’s newest model is ${liveModel.model_id}; this page is showing ${overview.model.id}.`) : `This historical edition is ${liveModel.model_id}.`} Last forecast clock: {liveModel.last_created_at ? date(liveModel.last_created_at) : "unavailable"}.</p> : <p>No 2026–27 model edition is registered in D1.</p>) : <p>{liveCatalogError || "Reading the deployed forecast catalog from D1."}</p>}
          {liveModel && <div className="rule-list" style={{ marginTop: 18 }}>
            <div><span>Target season</span><strong>{liveModel.target_season ?? "—"}</strong></div>
            <div><span>Calibration sample</span><strong>{liveModel.calibration_games != null ? `${liveModel.calibration_games.toLocaleString()} games` : "—"}</strong></div>
            <div><span>Interval half-width</span><strong>{liveModel.margin_half_width != null ? `${numeric(liveModel.margin_half_width)} pts` : "—"}</strong></div>
            <div><span>Holdout result</span><strong>{liveModel.evaluation_winner_accuracy != null ? `${numeric(liveModel.evaluation_winner_accuracy * 100)}% winner` : "—"}</strong></div>
            <div><span>Range coverage</span><strong>{liveModel.evaluation_interval_coverage != null ? `${numeric(liveModel.evaluation_interval_coverage * 100)}%` : "—"}</strong></div>
          </div>}
          <p className="note"><Link href="/research/scorecard/?sport=basketball">Open the forecast record →</Link> · <Link href="/basketball/model/">Read the model notebook →</Link></p>
        </div>
      </section>
      <p className="note" role="status">
        {liveGames
          ? `Live D1 matchup rows: ${liveGames.filter((game) => game.prediction).length.toLocaleString()} modeled · sorting and exports use the latest registered edition.`
          : liveGamesError
            ? `${liveGamesError} Showing the published static edition.`
            : "Checking live matchup rows…"}
        {latestGamesError && modelSelection !== "latest" ? ` ${latestGamesError} Edition deltas are unavailable.` : ""}
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
            key={`${marketRow.game.id}:${modelSelection}`}
            storageKey={`forecast-lab:${modelSelection}:${marketRow.game.id}`}
            gameId={marketRow.game.id}
            modelId={modelSelection}
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
          <thead><tr><th>Game</th><th>Evidence coverage</th><th>Primary model</th><th>Largest factor mismatch</th><th>Roster challenger</th><th>Range / confidence</th><th>Market comparison</th><th>Edition delta</th></tr></thead>
          <tbody>{rows.map((row) => {
            const p = row.prediction;
            const confidence = Math.max(p.home_win_probability, 1 - p.home_win_probability);
            return <tr key={row.game.id}>
              <td><strong>{row.game.away_name} at {row.game.home_name}</strong><small>{row.game.time_tbd ? `${date(row.game.starts_at)} · time TBD` : kick(row.game.starts_at)}{row.game.neutral ? " · neutral" : ""}</small>{scheduleClockByGame.get(row.game.id)?.source_time_valid && scheduleClockByGame.get(row.game.id)?.source_start && <small>Recorded start: {kick(scheduleClockByGame.get(row.game.id)!.source_start!)}</small>}<small><Link href={`/basketball/briefs/${row.game.id}/`}>Open matchup brief →</Link></small></td>
              <td><strong>{row.evidence.present}/{row.evidence.total} core checks</strong><small>{row.evidence.complete ? "Ready for full matchup review" : `Missing: ${row.evidence.missing.join(", ")}`}</small><small>{row.evidence.market === "verified" ? "Verified market lineage available" : "Market lineage unavailable"}</small></td>
              <td className="numeric"><strong>{numeric(p.home_margin, 1)}</strong><small>{numeric(p.home_win_probability * 100)}% home · {numeric(p.total, 1)} total</small><small>{row.signal.label} · {row.signal.probability_edge_pp == null ? "probability unavailable" : `${numeric(row.signal.probability_edge_pp)} pp from even`}</small></td>
              <td>{row.factorSignal ? <><strong>{row.factorSignal.edge > 0 ? row.game.home_name : row.factorSignal.edge < 0 ? row.game.away_name : "Even"}</strong><small>{row.factorSignal.label} · {numeric(Math.abs(row.factorSignal.edge) * 100)} pp gap</small><small>{row.factorSignal.season - 1}–{String(row.factorSignal.season).slice(-2)} descriptive rates</small></> : <span className="muted">No same-edition factor signal</span>}</td>
              <td className="numeric">{row.scenario ? <><strong>{numeric(row.scenario.roster_margin, 1)}</strong><small>{numeric(row.scenario.roster_home_win_probability * 100)}% home · {numeric(row.scenario.roster_margin_low)} to {numeric(row.scenario.roster_margin_high)}</small><small>{row.scenario.margin_delta >= 0 ? "+" : ""}{numeric(row.scenario.margin_delta, 1)} pts vs primary · exact-ID continuity</small></> : <span>—</span>}</td>
                              <td className="numeric"><strong>{numeric(p.margin_low, 1)} to {numeric(p.margin_high, 1)}</strong><small>{numeric(confidence * 100)}% strongest-side win probability</small><small>{numeric(p.margin_high - p.margin_low, 1)}-point range width · {numeric(p.pace, 1)} possessions</small></td>
              <td>{row.comparisons.length ? <><strong>{row.comparisons.length} verified quote{row.comparisons.length === 1 ? "" : "s"}</strong><small>{row.comparisons[0].bookmaker} · {row.comparisons[0].market}</small>{marketQuote(row.comparisons, "spreads") && <small>Spread {numeric(marketQuote(row.comparisons, "spreads")!.line)} · edge {signed(marketQuote(row.comparisons, "spreads")!.model_difference)}</small>}{marketQuote(row.comparisons, "totals") && <small>Total {numeric(marketQuote(row.comparisons, "totals")!.line)} · edge {signed(marketQuote(row.comparisons, "totals")!.model_difference)}</small>}{marketQuote(row.comparisons, "h2h") && <small>No-vig home {numeric(marketQuote(row.comparisons, "h2h")!.market_home_probability == null ? null : marketQuote(row.comparisons, "h2h")!.market_home_probability! * 100)}% · edge {signed(marketQuote(row.comparisons, "h2h")!.model_difference * 100, " pp")}</small>}</> : <span className="muted">No verified market quote</span>}</td>
              <td className="numeric">{row.modelDelta ? <><strong>{signed(row.modelDelta.margin)}</strong><small>margin vs latest</small><small>{signed(row.modelDelta.total)} total · {signed(row.modelDelta.winProbability * 100, " pp")} home probability</small></> : <span className="muted">—</span>}</td>
            </tr>;
          })}</tbody>
        </table>
      </div>
      {!rows.length && <p className="empty">No modeled games match this view.</p>}
      <section className="section two-col" style={{ marginTop: 34 }}>
        <div className="paper-panel"><div className="eyebrow">Read the disagreement</div><h2>Primary model first. Scenario second.</h2><p>The primary forecast is the historical opponent-adjusted efficiency and tempo model. The roster challenger uses prior net efficiency plus exact source-athlete-ID continuity and prior minutes. Its adjusted probability and range use the same held-out calibration as the identified primary model edition, while remaining a research sensitivity rather than the registered forecast.</p></div>
        <div className="paper-panel"><div className="eyebrow">Verify the inputs</div><h2>Every row has a trail.</h2><p>The factor column shows the largest descriptive rate mismatch from the completed-season profile; it is not a point contribution or a current-lineup claim. Open the matchup brief for all Four Factors, historical workload, source roster observations and the research ledger. Market rows appear only when a licensed pregame quote matched the exact game, participants and start time.</p><p><Link href="/basketball/model/">Read the model notebook →</Link> · <Link href="/basketball/recruiting/">Review recruiting evidence →</Link></p></div>
      </section>
    </>
  );
}
