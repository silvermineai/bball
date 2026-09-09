"use client";

import { useEffect, useState } from "react";
import { date } from "../_lib/format";

type ForecastModel = {
  model_id?: string;
  forecasts?: number;
  last_created_at?: string | null;
};

type ForecastMeta = { models?: ForecastModel[] };

export default function LiveFootballForecastStatus() {
  const [model, setModel] = useState<ForecastModel | null>(null);
  const [status, setStatus] = useState<"checking" | "live" | "fallback">("checking");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/football/research/forecasts?season=2026&meta=1", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("live football forecast index unavailable");
        return response.json() as Promise<ForecastMeta>;
      })
      .then((payload) => {
        if (!controller.signal.aborted) {
          setModel(payload.models?.[0] || null);
          setStatus(payload.models?.[0] ? "live" : "fallback");
        }
      })
      .catch((reason: unknown) => {
        if ((reason as { name?: string })?.name !== "AbortError" && !controller.signal.aborted) {
          setStatus("fallback");
        }
      });
    return () => controller.abort();
  }, []);

  return (
    <p className="note" role="status">
      {status === "live" && model
        ? `Live D1 football forecast index: ${(model.forecasts || 0).toLocaleString()} rows · ${model.model_id || "current model"}${model.last_created_at ? ` · captured ${date(model.last_created_at)}` : ""}.`
        : status === "fallback"
          ? "Live football forecast index unavailable; the published landing-page edition remains available."
          : "Checking the live football forecast index…"}
    </p>
  );
}
