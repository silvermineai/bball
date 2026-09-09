"use client";

import { useEffect, useState } from "react";
import { date } from "../_lib/format";

type ForecastModel = {
  model_id?: string;
  forecasts?: number;
  last_created_at?: string | null;
  target_season?: number | null;
};
type ForecastMeta = { models?: ForecastModel[] };

export default function LiveBasketballForecastStatus() {
  const [model, setModel] = useState<ForecastModel | null>(null);
  const [status, setStatus] = useState<"checking" | "live" | "fallback">("checking");

  useEffect(() => {
    const controller = new AbortController();
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
  }, []);

  return (
    <p className="note" role="status">
      {status === "live" && model
        ? `Live D1 forecast index: ${(model.forecasts || 0).toLocaleString()} rows · ${model.model_id || "current model"}${model.last_created_at ? ` · captured ${date(model.last_created_at)}` : ""}.`
        : status === "fallback"
          ? "Live forecast index unavailable; the published landing-page edition remains available."
          : "Checking the live forecast index…"}
    </p>
  );
}
