"use client";

import { useEffect, useState } from "react";
import { date } from "../_lib/format";
import { fetchJson } from "../_lib/fetch-json";

type ForecastModel = {
  model_id?: string;
  forecasts?: number;
  last_created_at?: string | null;
};

type ForecastCoverage = {
  upcoming_games?: number;
  forecast_games?: number;
  outside_fbs_field?: number;
  eligible_missing_prediction?: number;
};

type ForecastMeta = { models?: ForecastModel[]; coverage?: ForecastCoverage };

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

export default function LiveFootballForecastStatus() {
  const [model, setModel] = useState<ForecastModel | null>(null);
  const [coverage, setCoverage] = useState<ForecastCoverage | null>(null);
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

  return (
    <p className="note" role="status">
      {status === "live" && model
        ? `Live D1 football forecast index: ${formatFootballForecastCoverage(coverage || undefined) || `${(model.forecasts || 0).toLocaleString()} registered rows`} · ${model.model_id || "current model"}${model.last_created_at ? ` · captured ${date(model.last_created_at)}` : ""}.`
        : status === "fallback"
          ? <>Live football forecast index unavailable; the published landing-page edition remains available. <button className="text-link" type="button" onClick={() => setRetryNonce((value) => value + 1)}>Retry live check</button></>
          : "Checking the live football forecast index…"}
    </p>
  );
}
