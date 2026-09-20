"use client";

import { useEffect, useState } from "react";
import { date } from "../_lib/format";
import { fetchJson } from "../_lib/fetch-json";
import { baselineMarginDelta } from "../_lib/forecast-lab-view";

type ForecastModel = {
  model_id?: string;
  forecasts?: number;
  primary_forecasts?: number;
  cold_start_forecasts?: number;
  invalid_forecasts?: number;
  last_created_at?: string | null;
  target_season?: number | null;
  training_games?: number | null;
  training_seasons?: number[];
  evaluation_winner_accuracy?: number | null;
  evaluation_margin_mae?: number | null;
  evaluation_baseline_margin_mae?: number | null;
  evaluation_interval_coverage?: number | null;
  evaluation_games?: number | null;
  evaluation_unscored_games?: number | null;
};
type ForecastMeta = { models?: ForecastModel[] };
type ForecastSlice = { total?: number; status?: string; model?: string };

export function formatForecastCoverage(modelRows: number | null | undefined, upcomingRows: number | null | undefined) {
  if (!Number.isInteger(modelRows) || (modelRows ?? 0) < 0 || !Number.isInteger(upcomingRows) || (upcomingRows ?? 0) < 0) return "";
  return `${(modelRows ?? 0).toLocaleString()} model rows for ${(upcomingRows ?? 0).toLocaleString()} upcoming games`;
}

export function formatEvaluationCoverage(
  evaluationGames: number | null | undefined,
  evaluationUnscoredGames: number | null | undefined,
) {
  if (
    !Number.isInteger(evaluationGames) ||
    (evaluationGames ?? 0) < 0 ||
    !Number.isInteger(evaluationUnscoredGames) ||
    (evaluationUnscoredGames ?? 0) < 0 ||
    (evaluationUnscoredGames ?? 0) > (evaluationGames ?? 0)
  ) {
    return "";
  }

  const total = evaluationGames ?? 0;
  const unscored = evaluationUnscoredGames ?? 0;
  const scored = total - unscored;
  return `${total.toLocaleString()} held-out rows (${scored.toLocaleString()} scored${unscored ? `, ${unscored.toLocaleString()} unscored` : ""})`;
}

export function forecastEditionNotice(
  liveModelId: string | null | undefined,
  publishedModelId: string | null | undefined,
  publishedEdition: string | null | undefined,
) {
  if (!liveModelId || !publishedModelId || liveModelId === publishedModelId) return "";
  const edition = publishedEdition ? ` from ${date(publishedEdition)}` : "";
  return `Live rows use a newer registered model edition; this page's bundled context is${edition}.`;
}

export default function LiveBasketballForecastStatus({
  publishedModelId,
  publishedEdition,
}: {
  publishedModelId?: string;
  publishedEdition?: string;
} = {}) {
  const [model, setModel] = useState<ForecastModel | null>(null);
  const [upcomingTotal, setUpcomingTotal] = useState<number | null>(null);
  const [status, setStatus] = useState<"checking" | "live" | "fallback">("checking");
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setStatus("checking");
    Promise.all([
      fetchJson<ForecastMeta>("/api/basketball/research/forecasts?season=2027&meta=1", { signal: controller.signal }),
      fetchJson<ForecastSlice>("/api/basketball/research/forecasts?season=2027&status=upcoming&limit=1&page=0", { signal: controller.signal }),
    ])
      .then(([payload, slice]) => {
        if (!controller.signal.aborted) {
          setModel(payload.models?.[0] || null);
          setUpcomingTotal(Number.isInteger(slice.total) && (slice.total ?? 0) >= 0 ? slice.total ?? 0 : null);
          setStatus(payload.models?.[0] ? "live" : "fallback");
        }
      })
      .catch((reason: unknown) => {
        if ((reason as { name?: string })?.name !== "AbortError" && !controller.signal.aborted) setStatus("fallback");
      });
    return () => controller.abort();
  }, [retryNonce]);

  const rowSummary = model
    ? model.primary_forecasts != null || model.cold_start_forecasts != null
      ? `${(model.forecasts || 0).toLocaleString()} rows (${(model.primary_forecasts ?? 0).toLocaleString()} primary${model.cold_start_forecasts ? `, ${model.cold_start_forecasts.toLocaleString()} cold-start` : ""}${model.invalid_forecasts ? `, ${model.invalid_forecasts.toLocaleString()} invalid` : ""})`
      : `${(model.forecasts || 0).toLocaleString()} rows`
    : "0 rows";
  const coverage = formatForecastCoverage(model?.forecasts, upcomingTotal);
  const coverageSummary = coverage ? ` · ${coverage}` : "";
  const editionNotice = forecastEditionNotice(model?.model_id, publishedModelId, publishedEdition);
  const baselineDelta = baselineMarginDelta(model?.evaluation_margin_mae, model?.evaluation_baseline_margin_mae);
  const evaluationCoverage = formatEvaluationCoverage(model?.evaluation_games, model?.evaluation_unscored_games);

  return (
    <p className="note" role="status">
      {status === "live" && model
        ? `Live D1 forecast index: ${rowSummary}${coverageSummary} · ${model.model_id || "current model"}${model.last_created_at ? ` · captured ${date(model.last_created_at)}` : ""}${model.training_games != null ? ` · trained on ${model.training_games.toLocaleString()} games${model.training_seasons?.length ? ` (${model.training_seasons.join(", ")})` : ""}` : ""}${model.evaluation_winner_accuracy != null && model.evaluation_margin_mae != null ? ` · held-out ${
            (model.evaluation_winner_accuracy * 100).toFixed(1)
          }% winner / ${model.evaluation_margin_mae.toFixed(1)}-point MAE${baselineDelta == null ? "" : ` / ${Math.abs(baselineDelta).toFixed(1)} points ${baselineDelta >= 0 ? "lower" : "higher"} than baseline`}${model.evaluation_interval_coverage != null ? ` / ${(model.evaluation_interval_coverage * 100).toFixed(1)}% range coverage` : ""}${evaluationCoverage ? ` across ${evaluationCoverage}` : ""}` : ""}.`
        + (editionNotice ? ` ${editionNotice}` : "")
        : status === "fallback"
          ? <>Live forecast index unavailable; the published landing-page edition remains available. <button className="text-link" type="button" onClick={() => setRetryNonce((value) => value + 1)}>Retry live check</button></>
          : "Checking the live forecast index…"}
    </p>
  );
}
