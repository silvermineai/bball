"use client";

import { useEffect, useState } from "react";
import { date } from "../_lib/format";
import { fetchJson } from "../_lib/fetch-json";

type ForecastModel = {
  model_id?: string;
  forecasts?: number;
  last_created_at?: string | null;
};

type FootballModelSummary = {
  training_games?: number | null;
  training_seasons?: number[];
  calibration?: { games?: number | null; margin_half_width?: number | null } | null;
  evaluation?: {
    season?: number | null;
    games?: number | null;
    margin_mae?: number | null;
    winner_accuracy?: number | null;
    brier?: number | null;
    interval_coverage?: number | null;
  } | null;
};

type ForecastCoverage = {
  upcoming_games?: number;
  forecast_games?: number;
  outside_fbs_field?: number;
  eligible_missing_prediction?: number;
};

type ForecastMeta = {
  models?: ForecastModel[];
  latest_model?: { model_summary?: FootballModelSummary | null } | null;
  coverage?: ForecastCoverage;
};

export function formatFootballForecastCoverage(coverage?: ForecastCoverage) {
  if (!coverage) return "";
  const values = [
    coverage.upcoming_games,
    coverage.forecast_games,
    coverage.outside_fbs_field,
    coverage.eligible_missing_prediction,
  ];
  if (values.some((value) => !Number.isInteger(value) || (value as number) < 0)) return "";
  const [upcoming, forecast, outsideField, missingEligible] = values as number[];
  if (forecast + outsideField + missingEligible !== upcoming) return "";
  const reasons = outsideField
    ? ` · ${outsideField.toLocaleString()} outside the trained FBS field`
    : "";
  const eligible = missingEligible
    ? ` · ${missingEligible.toLocaleString()} eligible FBS ${missingEligible === 1 ? "matchup is" : "matchups are"} missing a registered prediction`
    : " · all eligible FBS matchups covered";
  return `${forecast.toLocaleString()} of ${upcoming.toLocaleString()} upcoming games forecast${reasons}${eligible}`;
}

export function formatFootballModelEvidence(summary?: FootballModelSummary | null) {
  const evaluation = summary?.evaluation;
  if (!evaluation || !Number.isInteger(evaluation.games) || (evaluation.games as number) <= 0) return "";
  const parts = [`held out ${(evaluation.games as number).toLocaleString()} games`];
  if (Number.isFinite(evaluation.winner_accuracy)) parts.push(`${((evaluation.winner_accuracy as number) * 100).toFixed(1)}% winner accuracy`);
  if (Number.isFinite(evaluation.margin_mae)) parts.push(`${(evaluation.margin_mae as number).toFixed(1)} pt margin MAE`);
  if (Number.isFinite(evaluation.brier)) parts.push(`Brier ${(evaluation.brier as number).toFixed(3)}`);
  if (Number.isFinite(evaluation.interval_coverage)) parts.push(`${((evaluation.interval_coverage as number) * 100).toFixed(1)}% range coverage`);
  if (summary.calibration?.games && Number.isFinite(summary.calibration.margin_half_width)) {
    parts.push(`calibrated on ${summary.calibration.games.toLocaleString()} games`);
  }
  return parts.join(" · ");
}

export default function LiveFootballForecastStatus() {
  const [model, setModel] = useState<ForecastModel | null>(null);
  const [coverage, setCoverage] = useState<ForecastCoverage | null>(null);
  const [modelEvidence, setModelEvidence] = useState<FootballModelSummary | null>(null);
  const [status, setStatus] = useState<"checking" | "live" | "fallback">("checking");
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setStatus("checking");
    fetchJson<ForecastMeta>("/api/football/research/forecasts?season=2026&meta=1", { signal: controller.signal })
      .then((payload) => {
        if (!controller.signal.aborted) {
          setModel(payload.models?.[0] || null);
          setCoverage(payload.coverage || null);
          setModelEvidence(payload.latest_model?.model_summary || null);
          setStatus(payload.models?.[0] ? "live" : "fallback");
        }
      })
      .catch((reason: unknown) => {
        if ((reason as { name?: string })?.name !== "AbortError" && !controller.signal.aborted) {
          setStatus("fallback");
        }
      });
    return () => controller.abort();
  }, [retryNonce]);

  const evidence = formatFootballModelEvidence(modelEvidence);
  return <>
    <p className="note" role="status">
      {status === "live" && model
        ? `Live D1 football forecast index: ${formatFootballForecastCoverage(coverage || undefined) || `${(model.forecasts || 0).toLocaleString()} registered rows`} · ${model.model_id || "current model"}${model.last_created_at ? ` · captured ${date(model.last_created_at)}` : ""}.`
        : status === "fallback"
          ? <>Live football forecast index unavailable; the published landing-page edition remains available. <button className="text-link" type="button" onClick={() => setRetryNonce((value) => value + 1)}>Retry live check</button></>
          : "Checking the live football forecast index…"}
    </p>
    {status === "live" && evidence ? <p className="note" aria-label="Football model evaluation">Model evidence: {evidence}. These are held-out results, separate from the upcoming forecast slate.</p> : null}
  </>;
}
