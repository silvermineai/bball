"use client";

import { useEffect, useState } from "react";
import { date } from "../_lib/format";

type ForecastModel = {
  model_id?: string;
  forecasts?: number;
  last_created_at?: string | null;
  target_season?: number | null;
  evaluation_winner_accuracy?: number | null;
  evaluation_margin_mae?: number | null;
  evaluation_interval_coverage?: number | null;
  evaluation_games?: number | null;
};
type ForecastMeta = { models?: ForecastModel[] };

export default function LiveBasketballForecastStatus() {
  const [model, setModel] = useState<ForecastModel | null>(null);
  const [status, setStatus] = useState<"checking" | "live" | "fallback">("checking");
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setStatus("checking");
    fetch("/api/basketball/research/forecasts?season=2027&meta=1", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("live forecast index unavailable");
        return response.json() as Promise<ForecastMeta>;
      })
      .then((payload) => {
        if (!controller.signal.aborted) {
          setModel(payload.models?.[0] || null);
          setStatus(payload.models?.[0] ? "live" : "fallback");
        }
      })
      .catch((reason: unknown) => {
        if ((reason as { name?: string })?.name !== "AbortError" && !controller.signal.aborted) setStatus("fallback");
      });
    return () => controller.abort();
  }, [retryNonce]);

  return (
    <p className="note" role="status">
      {status === "live" && model
        ? `Live D1 forecast index: ${(model.forecasts || 0).toLocaleString()} rows · ${model.model_id || "current model"}${model.last_created_at ? ` · captured ${date(model.last_created_at)}` : ""}${model.evaluation_winner_accuracy != null && model.evaluation_margin_mae != null ? ` · held-out ${
            (model.evaluation_winner_accuracy * 100).toFixed(1)
          }% winner / ${model.evaluation_margin_mae.toFixed(1)}-point MAE${model.evaluation_interval_coverage != null ? ` / ${(model.evaluation_interval_coverage * 100).toFixed(1)}% range coverage` : ""}${model.evaluation_games != null ? ` across ${model.evaluation_games.toLocaleString()} games` : ""}` : ""}.`
        : status === "fallback"
          ? <>Live forecast index unavailable; the published landing-page edition remains available. <button className="text-link" type="button" onClick={() => setRetryNonce((value) => value + 1)}>Retry live check</button></>
          : "Checking the live forecast index…"}
    </p>
  );
}
