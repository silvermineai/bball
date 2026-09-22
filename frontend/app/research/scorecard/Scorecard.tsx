"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { date, fmt, kick, signed } from "../../_lib/format";
import { marketEvidenceState, modelReliabilityScope, reasons, type Ledger } from "../../_lib/research-types";
import { marketCaptureDiagnostic, marketCaptureHistoryDiagnostic, marketReadinessLabel, marketReadinessScorecardNote, marketReadinessState, marketSourceAccessLabel, modelScopedScorecardPath, type MarketReadinessMetadata } from "../../_lib/market-readiness";
import { comparisonGapDirectionLabel, comparisonGapLabel, comparisonTimingLabel } from "../../_lib/market-display";
import { gameMarketReadinessExport, gameMarketReadinessLabel } from "../../_lib/game-market-readiness";
import { downloadCsv, toCsv } from "../../_lib/csv";
const exportHeaders = ["Sport", "Season", "Game ID", "Away", "Home", "Scheduled start", "Model", "Estimate type", "Generated", "Registered", "Status", "Home margin", "Total", "Home win probability", "Margin low", "Margin high", "Actual margin", "Actual total", "Market status", "Market readiness", "Retained market observations", "Eligible market observations", "Comparable market observations", "Selected market comparisons", "Quote count", "Quotes JSON"];
const exportRow = (sport: "football" | "basketball", g: Ledger["games"][number]) => [sport, g.season, g.game_id, g.away_name, g.home_name, g.starts_at, g.model_id, g.estimate_type || "unknown", g.generated_at, g.registered_at, reasons[g.status] || g.status, g.home_margin, g.total, g.home_win_probability, g.margin_low, g.margin_high, g.actual_margin, g.actual_total, ...gameMarketReadinessExport(g.market_readiness), g.comparisons.length, JSON.stringify(g.comparisons)];
type RetrospectiveBenchmark = {
  coverage: { evaluation_games: number; market_games: number; pregame_market_games: number };
  metrics: {
    model: { margin_mae: number | null; winner_accuracy: number | null };
    archived_line: { margin_mae: number | null; winner_accuracy: number | null };
  };
};
type ForecastCatalog = {
  models?: Array<{ model_id?: string; target_season?: number | null }>;
};

function directionSummary(results: Record<string, number>) {
  const order = ["win", "loss", "push"];
  return order
    .filter((key) => Number.isFinite(results[key]) && results[key] > 0)
    .map((key) => `${key} ${results[key].toLocaleString()}`)
    .join(" · ") || "—";
}

export default function Scorecard() {
  const params = useSearchParams();
  const [sport, setSport] = useState<"football" | "basketball">(
    params.get("sport") === "basketball" ? "basketball" : "football",
  );
  const [data, setData] = useState<Ledger | null>(null),
    [error, setError] = useState(""),
    [source, setSource] = useState<"live" | "edition">("edition"),
    [refreshing, setRefreshing] = useState(true);
  const [benchmark, setBenchmark] = useState<RetrospectiveBenchmark | null>(null);
  const [marketMetadata, setMarketMetadata] = useState<MarketReadinessMetadata | null>(null);
  const [marketMetadataStatus, setMarketMetadataStatus] = useState<"checking" | "ready" | "unavailable">("checking");
  // undefined = still checking, null = live catalog unavailable. A model
  // edition is never presented as current until this immutable ID matches.
  const [liveModelId, setLiveModelId] = useState<string | null | undefined>(undefined);
  const [liveModelSport, setLiveModelSport] = useState<"football" | "basketball" | null>(null);
  const [query, setQuery] = useState(params.get("q") || ""),
    [status, setStatus] = useState(params.get("status") || "all"),
    [page, setPage] = useState(() => {
      const value = Number(params.get("page") || 0);
      return Number.isInteger(value) && value > 0 ? value : 0;
    });
  const [copied, setCopied] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setMarketMetadata(null);
    setMarketMetadataStatus("checking");
    fetch(`/api/research/markets?meta=1&sport=${sport}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("market metadata unavailable");
        return response.json() as Promise<MarketReadinessMetadata>;
      })
      .then((next) => {
        if (!controller.signal.aborted) {
          setMarketMetadata(next);
          setMarketMetadataStatus(next.source === "unavailable" ? "unavailable" : "ready");
        }
      })
      .catch((reason: unknown) => {
        if ((reason as { name?: string })?.name !== "AbortError" && !controller.signal.aborted) {
          setMarketMetadataStatus("unavailable");
        }
      });
    return () => controller.abort();
  }, [sport]);
  useEffect(() => {
    const next = new URLSearchParams({ sport });
    if (query.trim()) next.set("q", query.trim());
    if (status !== "all") next.set("status", status);
    if (page) next.set("page", String(page));
    window.history.replaceState(null, "", `${window.location.pathname}?${next}`);
  }, [sport, query, status, page]);
  const refresh = () => {
    const c = new AbortController();
    setRefreshing(true);
    setError("");
    const scopedPath = liveModelSport === sport ? modelScopedScorecardPath(sport, liveModelId, 5000) : null;
    fetch(scopedPath || `/api/research/scorecard?sport=${sport}&limit=5000`, { signal: c.signal })
      .then((r) => {
        if (!r.ok) throw Error("The live research ledger could not be loaded.");
        return r.json();
      })
      .then((next) => {
        setData(next as Ledger);
        setSource("live");
      })
      .catch((e) => {
        if (e.name === "AbortError") return;
        fetch("/data/research/ledger-client.json", { signal: c.signal })
          .then((r) => {
            if (!r.ok) throw Error("The research ledger could not be loaded.");
            return r.json();
          })
          .then((next) => {
            setData(next as Ledger);
            setSource("edition");
          })
          .catch((fallbackError) => {
            if (fallbackError.name !== "AbortError") setError(fallbackError.message);
          });
      })
      .finally(() => setRefreshing(false));
    return () => c.abort();
  };
  useEffect(() => refresh(), [sport, liveModelId, liveModelSport]);
  useEffect(() => {
    if (sport !== "football") {
      setBenchmark(null);
      return;
    }
    const controller = new AbortController();
    fetch("/data/football/market-benchmark.json", { signal: controller.signal })
      .then((response) => response.ok ? response.json() as Promise<RetrospectiveBenchmark> : Promise.reject(new Error("benchmark unavailable")))
      .then((next) => { if (!controller.signal.aborted) setBenchmark(next); })
      .catch(() => { if (!controller.signal.aborted) setBenchmark(null); });
    return () => controller.abort();
  }, [sport]);
  useEffect(() => {
    const controller = new AbortController();
    setLiveModelId(undefined);
    setLiveModelSport(null);
    const season = sport === "basketball" ? 2027 : 2026;
    const endpoint = sport === "basketball"
      ? `/api/basketball/research/forecasts?season=${season}&meta=1`
      : `/api/football/research/forecasts?season=${season}&meta=1`;
    fetch(endpoint, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("The live forecast catalog is unavailable.");
        return response.json() as Promise<ForecastCatalog>;
      })
      .then((catalog) => {
        const model = (catalog.models || []).find((candidate) => candidate.target_season === season)
          || catalog.models?.[0];
        if (!model?.model_id) throw new Error("The live forecast catalog has no model edition.");
        if (!controller.signal.aborted) {
          setLiveModelId(model.model_id);
          setLiveModelSport(sport);
        }
      })
      .catch((reason: unknown) => {
        if ((reason as { name?: string })?.name !== "AbortError" && !controller.signal.aborted) setLiveModelId(null);
      });
    return () => controller.abort();
  }, [sport]);
  if (error)
    return (
      <p role="alert" className="status-error">
        {error}
      </p>
    );
  if (!data)
    return (
      <p role="status" className="empty">
        Loading registered forecasts…
      </p>
    );
  const summary = data.sports[sport],
    m = summary.metrics,
    marketObservations = summary.market_observations ?? 0,
    qualifyingMarketObservations = summary.qualifying_market_observations ?? 0,
    settledMarketObservations = summary.settled_market_observations,
    pendingMarketObservations = summary.pending_market_observations,
    unmatchedEvents = summary.unmatched_events ?? 0,
    readiness = summary.comparison_readiness,
    marketEvidence = marketEvidenceState(marketObservations, qualifyingMarketObservations),
    reliabilityScope = modelReliabilityScope(summary, liveModelId);
  const rows = data.games.filter(
    (g) =>
      g.sport === sport &&
      (status === "all" || g.status === status) &&
      (g.home_name + " " + g.away_name)
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const pendingMarketMetrics = summary.pending_market_metrics || [];
  const marketReadiness = marketReadinessState(
    marketMetadata,
    marketMetadataStatus === "checking",
  );
  const marketCaptureNote = marketCaptureDiagnostic(marketMetadata);
  const marketCaptureHistoryNote = marketCaptureHistoryDiagnostic(marketMetadata);
  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied("Scorecard link copied.");
    } catch {
      setCopied("Copy the scorecard URL from your address bar.");
    }
  };
  const download = () => {
    const visible = rows.slice(page * 25, page * 25 + 25);
    downloadCsv(
      `forecast-scorecard-${sport}-page-${page + 1}.csv`,
      toCsv(exportHeaders, visible.map((g) => exportRow(sport, g))),
    );
  };
  const downloadAll = () => {
    if (!rows.length) return;
    downloadCsv(
      `forecast-scorecard-${sport}-all.csv`,
      toCsv(exportHeaders, rows.map((g) => exportRow(sport, g))),
    );
  };
  return (
    <>
      <div className="toolbar section" style={{ marginBottom: 20 }}>
        <label className="control">
          <span>SPORT</span>
          <select
            value={sport}
            onChange={(e) => {
              setSport(e.target.value as typeof sport);
              setPage(0);
              setStatus("all");
            }}
          >
            <option value="football">College football</option>
            <option value="basketball">Men’s college basketball</option>
          </select>
        </label>
        <p className="note">
          {source === "live" ? "Live ledger · refreshed just now." : `Edition snapshot · ${date(data.generated_at)}.`} Prospective tracking is separate from historical backtests.
        </p>
        <button className="button secondary" type="button" onClick={refresh} disabled={refreshing}>
          {refreshing ? "Refreshing…" : "Refresh ledger"}
        </button>
      </div>
      <div className="strip">
        <div>
          <strong>{summary.games.toLocaleString()}</strong>
          <span>Games with registered forecasts</span>
        </div>
        <div>
          <strong>{m.games.toLocaleString()}</strong>
          <span>{reliabilityScope.editionCount > 1 ? "Settled games across editions" : "Settled games · current edition"}</span>
        </div>
        <div>
          <strong>{fmt(m.margin_mae)}</strong>
          <span>Margin MAE · {reliabilityScope.editionCount > 1 ? "selected editions" : "current edition"}</span>
        </div>
        <div>
          <strong>
            {m.winner_accuracy === null
              ? "—"
              : fmt(m.winner_accuracy * 100) + "%"}
          </strong>
          <span>Winner accuracy · {reliabilityScope.editionCount > 1 ? "selected editions" : "current edition"} · {m.winner_picks} picks</span>
        </div>
      </div>
      {reliabilityScope.lineage === "matched" && reliabilityScope.current ? (
        <p className="note" role="status" style={{ marginTop: 12 }}>
          {reliabilityScope.editionCount > 1
            ? <>Headline reliability aggregates {reliabilityScope.aggregateSettled.toLocaleString()} settled eligible games across {reliabilityScope.editionCount.toLocaleString()} model editions. Current edition <code>{reliabilityScope.current.model_id}</code> has {reliabilityScope.current.settled_games.toLocaleString()} settled games and {reliabilityScope.current.eligible_forecasts.toLocaleString()} eligible forecasts; {reliabilityScope.priorSettled.toLocaleString()} settled games come from earlier editions.</>
            : <>Scorecard is scoped to the verified current edition <code>{reliabilityScope.current.model_id}</code>: {reliabilityScope.current.eligible_forecasts.toLocaleString()} eligible forecasts and {reliabilityScope.current.settled_games.toLocaleString()} settled games. No earlier edition is pooled into these figures.</>}
        </p>
      ) : reliabilityScope.lineage === "mismatch" ? (
        <p className="notice" role="alert" style={{ marginTop: 12 }}>
          Current-edition reliability is withheld. The live forecast catalog reports <code>{reliabilityScope.authoritativeModelId}</code>, but this scorecard has no selected ledger edition with that immutable model ID. Aggregate figures remain historical ledger evidence across the recorded editions.
        </p>
      ) : reliabilityScope.lineage === "unavailable" ? (
        <p className="notice" role="status" style={{ marginTop: 12 }}>
          Current-edition reliability is withheld because the live forecast catalog could not be verified. Aggregate figures remain historical ledger evidence; retry to confirm the active model edition.
        </p>
      ) : (
        <p className="note" role="status" style={{ marginTop: 12 }}>Checking the live forecast catalog before labeling a scorecard edition current…</p>
      )}
      <div className="ledger-metrics">
        <span>
          Brier score <b>{fmt(m.brier, 4)}</b>
        </span>
        <span>
          Total MAE <b>{fmt(m.total_mae)}</b>
        </span>
        <span>
          Log loss <b>{fmt(m.log_loss, 4)}</b>
        </span>
        <span>
          80% interval coverage{" "}
          <b>
            {m.interval_coverage === null
              ? "—"
              : fmt(m.interval_coverage * 100) + "%"}
          </b>
        </span>
        <span>
          Mean interval width <b>{fmt(m.interval_mean_width)}</b>
        </span>
        <span>
          Calibration error{" "}
          <b>{m.expected_calibration_error == null ? "—" : `${fmt(m.expected_calibration_error * 100, 1)} pts`}</b>
        </span>
        <span>
          Retained odds observations <b>{marketObservations.toLocaleString()}</b>
        </span>
        <span>
          Unmatched feed events <b>{unmatchedEvents.toLocaleString()}</b>
        </span>
      </div>
      {summary.model_metrics?.length ? (
        <section className="paper-panel" style={{ marginTop: 24 }} aria-labelledby="model-edition-record-title">
          <div className="section-heading">
            <div>
              <div className="eyebrow">Model lineage / first eligible forecast</div>
              <h2 id="model-edition-record-title">Keep each edition’s record separate.</h2>
            </div>
            <span className="note">Prospective ledger only</span>
          </div>
          <p className="note">
            Each game belongs to the model edition selected by the ledger policy. Metrics use only settled eligible games from that edition; an em dash means the required outcome or interval evidence is unavailable.
          </p>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Model edition</th>
                  <th>First registered</th>
                  <th className="numeric">Selected</th>
                  <th className="numeric">Eligible</th>
                  <th className="numeric">Settled</th>
                  <th className="numeric">Margin MAE</th>
                  <th className="numeric">Brier</th>
                  <th className="numeric">Calibration error</th>
                  <th className="numeric">80% range</th>
                </tr>
              </thead>
              <tbody>
                {summary.model_metrics.map((edition) => (
                  <tr key={edition.model_id}>
                    <th scope="row"><code>{edition.model_id}</code></th>
                    <td>{edition.first_registered_at ? date(edition.first_registered_at) : "—"}</td>
                    <td className="numeric">{edition.selected_forecasts.toLocaleString()}</td>
                    <td className="numeric">{edition.eligible_forecasts.toLocaleString()}</td>
                    <td className="numeric">{edition.settled_games.toLocaleString()}</td>
                    <td className="numeric">{fmt(edition.margin_mae)}</td>
                    <td className="numeric">{fmt(edition.brier, 4)}</td>
                    <td className="numeric">{edition.expected_calibration_error == null ? "—" : `${fmt(edition.expected_calibration_error * 100, 1)} pts`}</td>
                    <td className="numeric">
                      {edition.interval_coverage === null
                        ? "—"
                        : `${fmt(edition.interval_coverage * 100)}% · ${fmt(edition.interval_mean_width)} pts (${edition.interval_games.toLocaleString()})`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
      {summary.estimate_metrics?.length ? (
        <section className="paper-panel" style={{ marginTop: 24 }} aria-labelledby="estimate-type-record-title">
          <div className="section-heading">
            <div>
              <div className="eyebrow">Forecast output type / integrity split</div>
              <h2 id="estimate-type-record-title">Primary and cold-start records stay separate.</h2>
            </div>
            <span className="note">Settled eligible games only</span>
          </div>
          <p className="note">
            Primary rows use the trained team field. Cold-start rows are exploratory estimates for teams outside that field and carry wider uncertainty; they are reported separately so they cannot improve or weaken the primary model record.
          </p>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Model / output</th>
                  <th className="numeric">Selected</th>
                  <th className="numeric">Eligible</th>
                  <th className="numeric">Settled</th>
                  <th className="numeric">Margin MAE</th>
                  <th className="numeric">Winner accuracy</th>
                  <th className="numeric">Brier</th>
                  <th className="numeric">Calibration error</th>
                  <th className="numeric">80% range</th>
                </tr>
              </thead>
              <tbody>
                {summary.estimate_metrics.map((estimate) => (
                  <tr key={`${estimate.model_id}|${estimate.estimate_type}`}>
                    <th scope="row"><code>{estimate.model_id}</code><small>{estimate.estimate_type === "cold_start" ? "Cold-start estimate" : estimate.estimate_type === "primary" ? "Primary model" : "Unknown output type"}</small></th>
                    <td className="numeric">{estimate.selected_forecasts.toLocaleString()}</td>
                    <td className="numeric">{estimate.eligible_forecasts.toLocaleString()}</td>
                    <td className="numeric">{estimate.settled_games.toLocaleString()}</td>
                    <td className="numeric">{fmt(estimate.margin_mae)}</td>
                    <td className="numeric">{estimate.winner_accuracy == null ? "—" : `${fmt(estimate.winner_accuracy * 100)}%`}</td>
                    <td className="numeric">{fmt(estimate.brier, 4)}</td>
                    <td className="numeric">{estimate.expected_calibration_error == null ? "—" : `${fmt(estimate.expected_calibration_error * 100, 1)} pts`}</td>
                    <td className="numeric">{estimate.interval_coverage == null ? "—" : `${fmt(estimate.interval_coverage * 100)}% · ${fmt(estimate.interval_mean_width)} pts (${estimate.interval_games.toLocaleString()})`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
      {m.reliability?.length ? (
        <section className="paper-panel" style={{ marginTop: 24 }} aria-labelledby="reliability-title">
          <div className="section-heading">
            <div>
              <div className="eyebrow">Probability calibration / settled non-ties</div>
              <h2 id="reliability-title">Does 70% mean about 70%?</h2>
            </div>
            <span className="note">Observed rate vs forecast average</span>
          </div>
          <p className="note">
            Each row groups settled games by the forecast probability recorded before the scheduled start. Tied finals are excluded because they do not produce a home-win outcome. Empty probability bands stay hidden; a small sample can swing the observed rate substantially.
          </p>
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr><th>Forecast band</th><th className="numeric">Games</th><th className="numeric">Average forecast</th><th className="numeric">Observed home wins</th><th className="numeric">Calibration gap</th></tr></thead>
              <tbody>
                {m.reliability.map((bin) => {
                  const gap = bin.predicted != null && bin.observed != null ? bin.observed - bin.predicted : null;
                  return (
                    <tr key={`${bin.lower}-${bin.upper}`}>
                      <td>{fmt(bin.lower * 100, 0)}–{fmt(bin.upper * 100, 0)}%</td>
                      <td className="numeric">{bin.games.toLocaleString()}</td>
                      <td className="numeric">{bin.predicted == null ? "—" : `${fmt(bin.predicted * 100, 1)}%`}</td>
                      <td className="numeric">{bin.observed == null ? "—" : `${fmt(bin.observed * 100, 1)}%`}</td>
                      <td className="numeric">{gap == null ? "—" : `${gap >= 0 ? "+" : ""}${fmt(gap * 100, 1)} pts`}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <section className="paper-panel" style={{ marginTop: 24 }} aria-labelledby="reliability-title">
          <div className="eyebrow">Probability calibration</div>
          <h3 id="reliability-title" style={{ marginTop: 8 }}>Waiting for settled non-tie games.</h3>
          <p>No reliability bins are shown until this sport has settled binary outcomes in the registered ledger.</p>
        </section>
      )}
      <section className="paper-panel" style={{ marginTop: 24 }} aria-live="polite">
        <div className="eyebrow">Market feed / capture status</div>
        <h3 style={{ marginTop: 8 }}>
          {marketEvidence === "qualified"
            ? `${marketObservations.toLocaleString()} retained market observations`
            : marketEvidence === "retained_unqualified"
              ? `${marketObservations.toLocaleString()} retained observations · none qualify yet`
              : marketEvidence === "inconsistent"
                ? "Market evidence counts are inconsistent"
                : "No qualifying pregame quote has been captured"}
        </h3>
        <p>
          {marketEvidence === "qualified"
            ? `${qualifyingMarketObservations.toLocaleString()} observations passed the forecast-registration, participant, kickoff, and freshness checks. ${unmatchedEvents.toLocaleString()} feed events remain unmatched or rejected for review.`
            : marketEvidence === "retained_unqualified"
              ? `${marketObservations.toLocaleString()} quote rows were retained, but none passed the forecast-registration, participant, kickoff, and freshness checks. The scorecard withholds model-versus-market comparisons until a quote qualifies.`
              : marketEvidence === "inconsistent"
                ? "The ledger reports qualifying observations without retained rows. Model-versus-market comparisons are withheld until the ledger is repaired."
                : "The scorecard does not invent a line from an archival reference. A feed must provide terms that permit prospective capture and the required game and clock fields; accepted quotes retain their source access class, timestamp, and archive hash."}
        </p>
        <div className="ledger-metrics" style={{ marginTop: 16 }} aria-label="Market capture readiness">
          <span>Capture readiness <b>{marketReadinessLabel(marketReadiness)}</b></span>
          <span>Feed access <b>{marketSourceAccessLabel(marketMetadata)}</b></span>
          <span>Applicable feed contracts <b>{(marketMetadata?.provider_capabilities?.length || 0).toLocaleString()}</b></span>
          <span>Capture receipts <b>{(marketMetadata?.research_receipts || 0).toLocaleString()}</b></span>
          <span>Latest capture <b>{marketMetadata?.research_capture?.market_status ? "Recorded" : "Not recorded"}</b></span>
          {settledMarketObservations != null && <span>Settled comparisons <b>{settledMarketObservations.toLocaleString()}</b></span>}
          {pendingMarketObservations != null && <span>Awaiting source finals <b>{pendingMarketObservations.toLocaleString()}</b></span>}
        </div>
        <p className="note" role="status" style={{ marginTop: 12 }}>
          {marketReadinessScorecardNote(marketReadiness)}
        </p>
        {marketCaptureNote && <p className="note" role="status" style={{ marginTop: 12 }}>{marketCaptureNote} This is capture evidence; only exact-game, pregame quotes enter the comparison ledger.</p>}
        {marketCaptureHistoryNote && <p className="note" role="status" style={{ marginTop: 12 }}>{marketCaptureHistoryNote}</p>}
        {readiness && (
          <>
            <div className="ledger-metrics" style={{ marginTop: 16 }}>
              <span>Selected-game quotes <b>{readiness.selected_game_observations.toLocaleString()}</b></span>
              <span>Clock + identity eligible <b>{readiness.eligible_observations.toLocaleString()}</b></span>
              <span>Comparable values <b>{readiness.comparable_observations.toLocaleString()}</b></span>
              <span>Latest selected comparisons <b>{readiness.selected_comparisons.toLocaleString()}</b></span>
              <span>Outside selected cohort <b>{readiness.outside_selected_cohort.toLocaleString()}</b></span>
              <span>Superseded updates <b>{readiness.superseded_observations.toLocaleString()}</b></span>
            </div>
            {Object.keys(readiness.rejection_counts).length > 0 && (
              <details style={{ marginTop: 16 }}>
                <summary>Why selected-game quotes did not qualify</summary>
                <div className="table-scroll" style={{ marginTop: 12 }}>
                  <table className="data-table">
                    <thead><tr><th>Integrity gate</th><th className="numeric">Quotes withheld</th></tr></thead>
                    <tbody>
                      {Object.entries(readiness.rejection_counts)
                        .sort(([, left], [, right]) => right - left)
                        .map(([reason, count]) => (
                          <tr key={reason}><th scope="row">{reasons[reason] || reason}</th><td className="numeric">{count.toLocaleString()}</td></tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}
            <p className="note" style={{ marginTop: 12 }}>
              The funnel is scoped to the selected season and model cohort. Multiple valid updates for the same provider, bookmaker, and market are reduced to the latest captured quote; earlier updates remain counted as superseded evidence.
            </p>
          </>
        )}
        {marketEvidence === "none" && (
          <p className="note">
            A licensed odds feed must be configured by an operator; keys never
            enter frontend code or logs. Read the{" "}
            <Link href="/research/markets/#market-policy">capture policy →</Link>{" "}
            · <Link href="/research/markets/#csv-import">licensed CSV import →</Link>
          </p>
        )}
      </section>
      {!m.games && (
        <p className="empty">
          No eligible registered games have a verified final in this data
          edition. Accuracy and errors will appear after results are imported;
          no historical test is being presented as prospective performance.
        </p>
      )}
      <div className="section-heading section">
        <div>
          <div className="eyebrow">01 / Model against market</div>
          <h2>Compare on the same court.</h2>
        </div>
        <span className="note">
          {summary.games_with_comparisons} games with qualifying quotes
        </span>
      </div>
      {!summary.market_metrics.length ? (
        <div className="paper-panel">
          <h3>
            {summary.games_with_comparisons
              ? "Comparisons are waiting for results."
              : "The market record is still empty."}
          </h3>
          <p>
            {marketEvidence === "qualified"
              ? "No settled games have qualifying quotes for this sport yet."
              : marketEvidence === "retained_unqualified"
                ? "Retained rows exist, but none qualify for a comparison because the required forecast, participant, kickoff, or freshness checks did not pass."
                : marketEvidence === "inconsistent"
                  ? "The ledger reports qualifying observations without retained rows, so comparisons remain withheld until the counts agree."
                  : "No timestamped odds-feed observations have been collected. Historical lines without a reliable pregame clock are excluded."}{" "}
            Model-versus-market errors will appear here once matched games
            settle. Open the <Link href="/research/markets/">market archive</Link> for retained observations and its <Link href="/research/markets/#market-policy">capture policy</Link> for the licensed feed workflow.
          </p>
          {settledMarketObservations != null && pendingMarketObservations != null && (
            <p className="note">{settledMarketObservations.toLocaleString()} qualifying quote observations have verified finals; {pendingMarketObservations.toLocaleString()} remain attached to scheduled or awaiting-result games. Only settled observations contribute to model and market error metrics.</p>
          )}
        </div>
      ) : (
        <div>
          <p className="note">
            Market results stay attached to the exact model edition that produced each selected forecast. Older edition snapshots without model lineage are labeled as legacy pooled results.
          </p>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Model edition</th>
                  <th>Source / bookmaker</th>
                  <th>Market</th>
                  <th>Matched games</th>
                  <th>Model MAE</th>
                  <th>Market MAE</th>
                  <th>Model winner%</th>
                  <th>Market winner%</th>
                  <th>Model Brier</th>
                  <th>Market Brier</th>
                  <th>Direction result</th>
                </tr>
              </thead>
              <tbody>
                {summary.market_metrics.map((r) => (
                  <tr key={`${r.model_id || "legacy"}|${r.provider}|${r.bookmaker}|${r.market}`}>
                    <th scope="row"><code>{r.model_id || "Legacy pooled"}</code></th>
                    <td><strong>{r.provider}</strong><small>{r.bookmaker}</small></td>
                    <td>{r.market}</td>
                    <td>{r.games}</td>
                    <td>{fmt(r.model_mae)}</td>
                    <td>{fmt(r.market_mae)}</td>
                    <td>{r.model_winner_accuracy == null ? "—" : `${fmt(r.model_winner_accuracy * 100)}%`}</td>
                    <td>{r.market_winner_accuracy == null ? "—" : `${fmt(r.market_winner_accuracy * 100)}%`}</td>
                    <td>{fmt(r.model_brier, 4)}</td>
                    <td>{fmt(r.market_brier, 4)}</td>
                    <td>{directionSummary(r.direction_results)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {pendingMarketMetrics.length > 0 && (
        <section className="paper-panel" style={{ marginTop: 24 }} aria-labelledby="pending-market-title">
          <div className="section-heading">
            <div>
              <div className="eyebrow">Upcoming / awaiting source finals</div>
              <h3 id="pending-market-title">Model context beside the current line.</h3>
            </div>
            <span className="note">No accuracy claim yet</span>
          </div>
          <p className="note">
            These are qualifying pregame quote observations attached to scheduled or awaiting-result games. The average difference is preparation context only; it becomes an error metric only after the game has a verified final.
          </p>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Model edition</th>
                  <th>Market</th>
                  <th className="numeric">Games</th>
                  <th className="numeric">Average model difference</th>
                  <th className="numeric">Average overround</th>
                </tr>
              </thead>
              <tbody>
                {pendingMarketMetrics.map((r) => (
                  <tr key={`${r.model_id || "legacy"}|${r.provider}|${r.bookmaker}|${r.market}`}>
                    <th scope="row"><code>{r.model_id || "Legacy pooled"}</code></th>
                    <td>{r.market}</td>
                    <td className="numeric">{r.games.toLocaleString()}</td>
                    <td className="numeric">
                      {r.model_difference_mean == null
                        ? "—"
                        : `${r.model_difference_mean >= 0 ? "+" : ""}${fmt(r.market === "h2h" ? r.model_difference_mean * 100 : r.model_difference_mean, 1)} ${r.market === "h2h" ? "pp" : "pts"}`}
                    </td>
                    <td className="numeric">
                      {r.market_overround_mean == null ? "—" : `${fmt(r.market_overround_mean * 100, 2)}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {sport === "football" && benchmark && (
        <section className="paper-panel" style={{ marginTop: 24 }} aria-labelledby="retrospective-benchmark-title">
          <div className="section-heading">
            <div>
              <div className="eyebrow">Football / retrospective reference</div>
              <h3 id="retrospective-benchmark-title">Model beside the archived line.</h3>
            </div>
            <Link className="hero-link" href="/research/markets/">Open full benchmark →</Link>
          </div>
          <p className="note">
            {benchmark.coverage.market_games.toLocaleString()} of {benchmark.coverage.evaluation_games.toLocaleString()} held-out 2025 games have an exact archived line. The archive has {benchmark.coverage.pregame_market_games.toLocaleString()} verified pregame captures, so this is descriptive reference evidence and stays outside the prospective scorecard.
          </p>
          <div className="stat-grid" style={{ marginTop: 16 }}>
            <div><strong>{fmt(benchmark.metrics.model.margin_mae)}</strong><span>model margin MAE</span></div>
            <div><strong>{fmt(benchmark.metrics.archived_line.margin_mae)}</strong><span>archived line margin MAE</span></div>
            <div><strong>{benchmark.metrics.model.winner_accuracy == null ? "—" : `${fmt(benchmark.metrics.model.winner_accuracy * 100)}%`}</strong><span>model winner accuracy</span></div>
            <div><strong>{benchmark.metrics.archived_line.winner_accuracy == null ? "—" : `${fmt(benchmark.metrics.archived_line.winner_accuracy * 100)}%`}</strong><span>archived line winner accuracy</span></div>
          </div>
        </section>
      )}
      <section className="section">
        <div className="section-heading">
          <div>
            <div className="eyebrow">02 / The game ledger</div>
            <h2>Every forecast has a trail.</h2>
          </div>
          <div className="button-row"><span className="note">{summary.registered_versions.toLocaleString()} retained versions</span><button className="button secondary" type="button" onClick={download} disabled={!rows.length}>Download page CSV ↓</button><button className="button secondary" type="button" onClick={downloadAll} disabled={!rows.length}>Download all matching CSV ↓</button><button className="button secondary" type="button" onClick={share}>Copy scorecard link</button></div>
        </div>
        {copied && <p role="status">{copied}</p>}
        <div className="toolbar">
          <label className="control">
            <span>PROGRAM</span>
            <input
              type="search"
              placeholder="Search the ledger"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(0);
              }}
            />
          </label>
          <label className="control">
            <span>STATUS</span>
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(0);
              }}
            >
              <option value="all">All registered games</option>
              {[
                "scheduled",
                "awaiting_result",
                "settled",
                "excluded",
                "final_missing_scores",
                "inconsistent_final",
              ].map((s) => (
                <option value={s} key={s}>
                  {reasons[s]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Matchup / scheduled start</th>
                <th>Status</th>
                <th className="numeric">Home margin</th>
                <th className="numeric">Total</th>
                <th className="numeric">Home win</th>
                <th className="numeric">Actual margin</th>
                <th>Market observations</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(page * 25, page * 25 + 25).map((g) => (
                <tr key={g.id}>
                  <td>
                    <Link
                      href={`/research/game/?sport=${sport}&id=${g.game_id}&selected=${g.id}`}
                    >
                      {g.away_name} at {g.home_name}
                    </Link>
                    <small>
                      {g.schedule_time_basis === "validated_source_clock"
                        ? `${kick(g.starts_at)} · verified source clock${g.canonical_time_tbd ? " · canonical time TBD" : ""}`
                        : g.time_tbd
                          ? date(g.starts_at) + " · time TBD"
                          : kick(g.starts_at)}
                    </small>
                  </td>
                  <td>
                    <span
                      className={`ledger-status ${g.status === "settled" ? "settled" : ""}`}
                    >
                      {reasons[g.status] || g.status}
                    </span>
                    {g.exclusion && <small>{reasons[g.exclusion]}</small>}
                  </td>
                  <td className="numeric">{signed(g.home_margin)}</td>
                  <td className="numeric">{fmt(g.total)}</td>
                  <td className="numeric">
                    {fmt(g.home_win_probability * 100)}%
                  </td>
                  <td className="numeric">
                    {g.actual_margin === null ? "—" : signed(g.actual_margin)}
                  </td>
                  <td>
                    {g.comparisons.length ? (
                      <details>
                        <summary>
                          {g.comparisons.length} last-observed quotes
                        </summary>
                        {g.comparisons.map((c) => (
                          <p
                            className="note"
                            key={c.market_observation_id || `${c.provider}|${c.bookmaker}|${c.market}|${c.captured_at}`}
                          >
                            Verified line · {c.market}
                            <br />
                            {c.market === "h2h"
                              ? `Market home win ${fmt((c.market_home_probability || 0) * 100)}% · ${comparisonGapLabel(c) || "model difference unavailable"}`
                              : `Line ${signed(c.line!)} · ${comparisonGapLabel(c) || "model difference unavailable"}`}
                            {comparisonGapDirectionLabel(c) && <><br />{comparisonGapDirectionLabel(c)}</>}
                            <br />
                            {c.market_overround == null
                              ? "Market margin unavailable"
                              : `Market margin ${fmt(c.market_overround * 100, 2)}%`}
                            <br />
                            Evidence ID{" "}
                            <code>{c.market_observation_id || "not retained"}</code>
                            {" · source game "}
                            <code>{c.market_game_id || "not retained"}</code>
                            <br />
                            Captured {kick(c.captured_at)}
                            <br />
                            {comparisonTimingLabel(c, g.starts_at)} · {kick(c.updated_at)}
                            {c.direction_result && (
                              <>
                                <br />
                                Hypothetical direction: {c.direction_result}
                              </>
                            )}
                          </p>
                        ))}
                      </details>
                  ) : (
                      <span className="note">
                        {gameMarketReadinessLabel(g.market_readiness)}
                        {g.market_readiness && <small>{g.market_readiness.message}</small>}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && (
          <p className="empty">No registered games match these filters.</p>
        )}
        <div className="pagination">
          <span>
            {rows.length.toLocaleString()} games · page {page + 1} of{" "}
            {Math.max(1, Math.ceil(rows.length / 25))}
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
              disabled={(page + 1) * 25 >= rows.length}
              onClick={() => setPage(page + 1)}
            >
              Next →
            </button>
          </div>
        </div>
        <p className="note">
          Positive margins favor the designated home team, including neutral
          sites. Game rows use the first eligible registration; when none
          qualifies, the first excluded version remains visible. Quotes are last
          observed, not live prices.
        </p>
      </section>
    </>
  );
}
