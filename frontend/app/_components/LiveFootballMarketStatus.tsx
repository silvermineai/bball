"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { date } from "../_lib/format";
import { fetchJson } from "../_lib/fetch-json";
import { footballMarketArchiveDetail, footballMarketCaptureDetail, footballMarketStatusDetail } from "../_lib/football-market-status";
import { marketCaptureStatusDetail, marketCaptureStatusLabel, type MarketCaptureStatus } from "../_lib/market-availability";
import { formatMarketComparisonReadiness, modelScopedScorecardPath } from "../_lib/market-readiness";

type MarketMetadata = {
  total?: number;
  pregame?: number;
  research_receipts?: number;
  research_latest_capture_at?: string | null;
  research_capture?: {
    summary_count?: number;
    summary_with_pickcenter?: number;
    accepted_markets?: number;
    rejected_records?: number;
    market_status?: MarketCaptureStatus;
  };
  source?: "partial" | "unavailable";
  unavailable_reason?: string;
};

type ScorecardSummary = {
  games?: number;
  games_with_comparisons?: number;
  qualifying_market_observations?: number;
  metrics?: {
    games?: number;
    winner_accuracy?: number | null;
    margin_mae?: number | null;
  };
  market_metrics?: Array<{ games?: number | null }>;
  comparison_readiness?: Parameters<typeof formatMarketComparisonReadiness>[0];
};

type ScorecardResponse = {
  generated_at?: string;
  model?: string | null;
  market_observations?: number;
  qualifying_market_observations?: number;
  unmatched_events?: number;
  sports?: { football?: ScorecardSummary };
};

type ForecastSlice = { rows?: Array<{ model_id?: string | null }>; model?: string | null };

export default function LiveFootballMarketStatus() {
  const [scorecard, setScorecard] = useState<ScorecardResponse | null>(null);
  const [archive, setArchive] = useState<MarketMetadata | null>(null);
  const [status, setStatus] = useState<"checking" | "live" | "fallback">("checking");
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setStatus("checking");
    Promise.all([
      fetchJson<ForecastSlice>("/api/football/research/forecasts?season=2026&status=upcoming&limit=1&page=0", { signal: controller.signal }),
      fetchJson<MarketMetadata>("/api/research/markets?meta=1&sport=football", { signal: controller.signal }),
    ])
      .then(([forecastPayload, archivePayload]) => {
        if (controller.signal.aborted) return;
        setArchive(archivePayload);
        const modelId = forecastPayload.rows?.find((row) => typeof row.model_id === "string" && row.model_id.trim())?.model_id
          || forecastPayload.model
          || null;
        const scorecardPath = modelScopedScorecardPath("football", modelId);
        if (!scorecardPath) {
          setScorecard(null);
          setStatus("fallback");
          return;
        }
        fetchJson<ScorecardResponse>(scorecardPath, { signal: controller.signal })
          .then((scorecardPayload) => {
            if (controller.signal.aborted) return;
            setScorecard(scorecardPayload);
            setStatus(archivePayload.source === "unavailable" ? "fallback" : "live");
          })
          .catch((reason: unknown) => {
            if ((reason as { name?: string })?.name !== "AbortError" && !controller.signal.aborted) setStatus("fallback");
          });
      })
      .catch((reason: unknown) => {
        if ((reason as { name?: string })?.name !== "AbortError" && !controller.signal.aborted) {
          setStatus("fallback");
        }
      });
    return () => controller.abort();
  }, [retryNonce]);

  const summary = scorecard?.sports?.football;
  const metrics = summary?.metrics;
  const marketMetrics = summary?.market_metrics || [];
  const settledMarketComparisons = marketMetrics.reduce((total, group) => total + (Number.isFinite(group.games) && (group.games || 0) > 0 ? Math.trunc(group.games || 0) : 0), 0);
  const caveat = archive?.source === "partial"
    ? "The market archive is partially available."
    : archive?.source === "unavailable"
      ? archive.unavailable_reason || "The market archive is temporarily unavailable."
      : "";
  const captureDiagnostic = footballMarketCaptureDetail(archive?.research_capture);
  const archiveDiagnostic = footballMarketArchiveDetail(archive);
  const captureStatus = archive?.research_capture?.market_status;
  const captureStatusNote = captureStatus
    ? ` Capture status: ${marketCaptureStatusLabel(captureStatus)}. ${marketCaptureStatusDetail(captureStatus)}`
    : "";
  const readinessDiagnostic = formatMarketComparisonReadiness(summary?.comparison_readiness);
  const modelScope = summary && scorecard?.model ? ` for model ${scorecard.model}` : "";

  return (
    <p className="note" role="status">
      {status === "live" && scorecard && summary
        ? <>
            {footballMarketStatusDetail({
              qualifyingMarketObservations: scorecard.qualifying_market_observations || 0,
              marketObservations: scorecard.market_observations || 0,
              gamesWithComparisons: summary.games_with_comparisons || 0,
              settledMarketComparisons,
              settledModelGames: metrics?.games || 0,
              winnerAccuracy: metrics?.winner_accuracy ?? null,
              marginMae: metrics?.margin_mae ?? null,
            })}{modelScope}. {readinessDiagnostic ? `${readinessDiagnostic} ` : ""}{archiveDiagnostic ? `${archiveDiagnostic} ` : ""}{caveat ? `${caveat} ` : ""}{captureDiagnostic ? `${captureDiagnostic} ` : ""}{captureStatusNote}{scorecard.generated_at ? ` Checked ${date(scorecard.generated_at)}. ` : ""}<Link href="/research/scorecard/?sport=football">Open the football scorecard →</Link>
          </>
        : status === "fallback"
          ? <>Live market record unavailable; the retained archive remains available. <Link href="/research/scorecard/?sport=football">Open the scorecard →</Link> <button className="text-link" type="button" onClick={() => setRetryNonce((value) => value + 1)}>Retry live check</button></>
          : "Checking the live football market record…"}
    </p>
  );
}
