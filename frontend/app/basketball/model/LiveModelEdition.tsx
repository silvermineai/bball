"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchJson } from "../../_lib/fetch-json";

type LiveModel = {
  model_id?: string | null;
  forecasts?: number;
  primary_forecasts?: number;
  cold_start_forecasts?: number;
  last_created_at?: string | null;
  target_season?: number | null;
  cutoff?: string | null;
};

type Catalog = { models?: LiveModel[] };

function date(value: string | null | undefined) {
  if (!value || !Number.isFinite(Date.parse(value))) return "capture time unavailable";
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  });
}

/** Keep the model notebook tied to the live edition after a source refresh. */
export default function LiveModelEdition({ bundledModelId }: { bundledModelId: string }) {
  const [model, setModel] = useState<LiveModel | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetchJson<Catalog>("/api/basketball/research/forecasts?season=2027&meta=1", { signal: controller.signal })
      .then((payload) => {
        const next = payload.models?.find((item) => typeof item.model_id === "string" && item.model_id.trim());
        if (!next?.model_id) throw new Error("The live 2026–27 model edition is unavailable.");
        if (!controller.signal.aborted) setModel(next);
      })
      .catch((reason: unknown) => {
        if ((reason as { name?: string })?.name !== "AbortError" && !controller.signal.aborted) {
          setError(reason instanceof Error ? reason.message : "The live model edition is unavailable.");
        }
      });
    return () => controller.abort();
  }, []);

  return (
    <section className="section paper-panel" aria-live="polite">
      <div className="section-heading">
        <div>
          <div className="eyebrow">Live 2026–27 model edition</div>
          <h2>Use the edition that is actually forecasting the slate.</h2>
        </div>
        <Link href="/basketball/forecast-lab/">Open forecast lab →</Link>
      </div>
      {error ? <p className="note">{error} The bundled notebook remains visible, but its edition is not treated as live.</p> : !model ? <p className="empty" role="status">Checking the deployed forecast catalog…</p> : (
        <>
          <div className="raw-stat-grid">
            <div><dt>{model.model_id}</dt><dd>Active model ID</dd></div>
            <div><dt>{(model.forecasts || 0).toLocaleString()}</dt><dd>Registered forecasts</dd></div>
            <div><dt>{(model.primary_forecasts || 0).toLocaleString()}</dt><dd>Primary estimates</dd></div>
            <div><dt>{(model.cold_start_forecasts || 0).toLocaleString()}</dt><dd>Cold-start estimates</dd></div>
          </div>
          <p className="note" style={{ marginTop: 16 }}>
            Live catalog captured {date(model.last_created_at)}{model.cutoff ? ` · training cutoff ${date(model.cutoff)}` : ""}. {model.model_id === bundledModelId ? "The bundled notebook and live forecast edition agree." : <>The bundled notebook is {bundledModelId}; the live edition has advanced since that static snapshot.</>}
          </p>
        </>
      )}
    </section>
  );
}
