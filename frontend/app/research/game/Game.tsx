"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { fmt, signed } from "../../_lib/format";
type RecordRow = {
  id: string;
  generated_at?: string;
  registered_at?: string;
  observed_at?: string;
  model_id?: string;
  starts_at?: string;
  time_tbd?: number;
  payload: {
    home_name?: string;
    away_name?: string;
    home_score?: number | null;
    away_score?: number | null;
    completed?: number;
    starts_at?: string;
    time_tbd?: number;
    source_url?: string;
    source_fetched_at?: string;
    source_sha256?: string;
    model_cutoff?: string;
    prediction?: {
      home_margin: number;
      total: number;
      home_win_probability: number;
    };
  } | null;
};
type Data = { rows: RecordRow[]; total: number };
export default function Game() {
  const params = useSearchParams(),
    sport = params.get("sport") || "football",
    id = params.get("id"),
    selected = params.get("selected");
  const [kind, setKind] = useState("predictions"),
    [page, setPage] = useState(0),
    [data, setData] = useState<Data | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    if (!id) return;
    const c = new AbortController();
    setData(null);
    setError("");
    fetch(
      `/api/research/games/${encodeURIComponent(sport)}/${encodeURIComponent(id)}?kind=${kind}&page=${page}`,
      { signal: c.signal },
    )
      .then((r) => {
        if (!r.ok)
          throw Error(
            r.status === 404
              ? "No registered history found for this game."
              : "The game history could not be loaded.",
          );
        return r.json();
      })
      .then(setData)
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => c.abort();
  }, [sport, id, kind, page]);
  return (
    <>
      <Link className="eyebrow" href={`/research/scorecard/?sport=${sport}`}>
        ← Forecast scorecard
      </Link>
      <div className="page-title">
        <div className="eyebrow">
          {sport} / game {id || "not selected"}
        </div>
        <h1>The original record.</h1>
        <p>
          Inspect every retained prediction and source-state observation. Times
          are UTC. Original registrations are preserved when a forecast or
          result changes.
        </p>
      </div>
      <div className="toolbar">
        <label className="control">
          <span>HISTORY</span>
          <select
            value={kind}
            onChange={(e) => {
              setKind(e.target.value);
              setPage(0);
            }}
          >
            <option value="predictions">Registered predictions</option>
            <option value="states">Schedule and result observations</option>
          </select>
        </label>
      </div>
      {!id ? (
        <p className="empty">Select a game from the scorecard.</p>
      ) : error ? (
        <p role="alert" className="status-error">
          {error}
        </p>
      ) : !data ? (
        <p role="status" className="empty">
          Loading the retained history…
        </p>
      ) : (
        <>
          {data.rows.map((r) => (
            <section className="paper-panel ledger-record" key={r.id}>
              <div className="eyebrow">
                {r.id === selected ? "Selected scorecard version / " : ""}
                {r.model_id || "Source observation"}
              </div>
              {r.payload?.prediction ? (
                <>
                  <h2>
                    {r.payload.away_name} at {r.payload.home_name}
                  </h2>
                  <div className="ledger-metrics">
                    <span>
                      Home margin{" "}
                      <b>{signed(r.payload.prediction.home_margin)}</b>
                    </span>
                    <span>
                      Total <b>{fmt(r.payload.prediction.total)}</b>
                    </span>
                    <span>
                      Home win{" "}
                      <b>
                        {fmt(r.payload.prediction.home_win_probability * 100)}%
                      </b>
                    </span>
                  </div>
                  <dl className="raw-stat-grid">
                    {Object.entries({
                      Generated: r.generated_at,
                      "First registered": r.registered_at,
                      "Model cutoff": r.payload.model_cutoff,
                      "Scheduled start": r.starts_at,
                      "Start time confirmed": r.time_tbd ? "No" : "Yes",
                    }).map(([k, v]) => (
                      <div key={k}>
                        <dt>{k}</dt>
                        <dd>{v}</dd>
                      </div>
                    ))}
                  </dl>
                </>
              ) : (
                <>
                  <h2>
                    {r.payload?.completed
                      ? "Source marked final"
                      : "Schedule observation"}
                  </h2>
                  <p>Observed {r.observed_at}</p>
                  {r.payload ? (
                    <>
                      <p>
                        Start: {r.payload.starts_at}
                        {r.payload.time_tbd ? " · time unconfirmed" : ""}
                        <br />
                        Home score: {fmt(r.payload.home_score, 0)} · away score:{" "}
                        {fmt(r.payload.away_score, 0)}
                      </p>
                      <p className="note">
                        Source retrieved: {r.payload.source_fetched_at}
                        <br />
                        Source file SHA-256: {r.payload.source_sha256}
                      </p>
                      {r.payload.source_url && (
                        <a href={r.payload.source_url}>Source release ↗</a>
                      )}
                    </>
                  ) : (
                    <p>
                      The game was missing from the current source snapshot.
                    </p>
                  )}
                </>
              )}
              <p className="note ledger-hash">Record ID: {r.id}</p>
            </section>
          ))}
          {!data.rows.length && (
            <p className="empty">No records in this history view.</p>
          )}
          <div className="pagination">
            <span>
              {data.total} records · page {page + 1} of{" "}
              {Math.max(1, Math.ceil(data.total / 25))}
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
                disabled={(page + 1) * 25 >= data.total}
                onClick={() => setPage(page + 1)}
              >
                Next →
              </button>
            </div>
          </div>
        </>
      )}
      <p className="note">
        Source finals include overtime. Corrections are appended as new
        observations; the scorecard uses the latest available state. Local
        registration timestamps are not independent proof of publication time.
      </p>
    </>
  );
}
