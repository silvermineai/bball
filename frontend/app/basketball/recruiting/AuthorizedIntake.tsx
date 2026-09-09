"use client";

import { useEffect, useState } from "react";

type IntakeCoverage = {
  total: number;
  latest_captured_at: string | null;
  providers: Array<{ provider: string; rows: number; latest_captured_at: string | null }>;
  statuses: Array<{ status: string; rows: number }>;
  provider_feeds?: Array<{ provider: string; kind: string; rows: number; latest_captured_at: string | null }>;
  provider_capabilities?: Array<{
    provider: string;
    kinds: string[];
    season_field: string;
    event_date_available: boolean;
    docs_url: string;
    policy: string;
  }>;
  policy: string;
};

const clock = (value: string | null) =>
  value
    ? `${new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value))} UTC`
    : "not captured";

export default function AuthorizedIntake() {
  const [coverage, setCoverage] = useState<IntakeCoverage | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/basketball/research/recruiting-intake?season=2027", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Authorized recruiting intake coverage is unavailable.");
        return response.json() as Promise<IntakeCoverage>;
      })
      .then((value) => { if (!controller.signal.aborted) setCoverage(value); })
      .catch((reason: Error) => { if (reason.name !== "AbortError") setError(reason.message); });
    return () => controller.abort();
  }, []);
  const providerFeeds = coverage?.provider_feeds ?? [];
  const providerCapabilities = coverage?.provider_capabilities ?? [];
  return (
    <section className="section">
      <div className="paper-panel recruiting-intake">
        <div className="section-heading">
          <div>
            <div className="eyebrow">Authorized evidence intake / 2026–27</div>
            <h2>Keep verified provider records separate.</h2>
          </div>
          <div className="button-row">
            <a className="button secondary" href="https://github.com/silvermineai/bball/blob/main/docs/RECRUITING_INTAKE.md" target="_blank" rel="noreferrer">Read import protocol ↗</a>
            <a className="hero-link" href="https://collegebasketballdata.com/terms" target="_blank" rel="noreferrer">CBBD terms ↗</a>
          </div>
        </div>
        <p>
          An approved transfer or eligibility feed can be imported with its license, source clocks and stable provider IDs. The optional CollegeBasketballData connector is ready for a server-side <code>CBBD_API_KEY</code>; its portal, recruiting-player and team-ranking rows stay in a separate private D1 table. Silvermine does not merge provider records into school announcements, roster observations or forecast inputs.
        </p>
        {error ? <p className="status-error" role="alert">{error}</p> : !coverage ? <p className="empty" role="status">Checking authorized intake coverage…</p> : (
          <div className="recruiting-intake-status">
            <div>
              <strong>{coverage.total.toLocaleString()}</strong>
              <span>source-reported rows imported</span>
            </div>
            <div>
              <strong>{(coverage.providers.length + new Set(providerFeeds.map((feed) => feed.provider)).size).toLocaleString()}</strong>
              <span>authorized providers</span>
            </div>
            <div>
              <strong>{clock(coverage.latest_captured_at)}</strong>
              <span>latest capture clock</span>
            </div>
            <div className="recruiting-intake-detail">
              {coverage.total || providerFeeds.length ? <>
                {coverage.providers.map((provider) => <span key={provider.provider}>{provider.provider} · {provider.rows.toLocaleString()} intake rows · {clock(provider.latest_captured_at)}</span>)}
                {providerFeeds.map((feed) => <span key={`${feed.provider}-${feed.kind}`}>{feed.provider} · {feed.kind} · {feed.rows.toLocaleString()} private rows · {clock(feed.latest_captured_at)}</span>)}
              </> : <span>No authorized provider export has been imported for this season. The reviewed school-announcement file remains the visible player-level evidence.</span>}
            </div>
            {providerCapabilities.length > 0 && <div className="recruiting-intake-detail">
              {providerCapabilities.map((capability) => <span key={capability.provider}>
                <strong>{capability.provider}</strong> · {capability.kinds.join(", ")} · {capability.event_date_available ? "event dates available" : "season-level dates only"} · <a href={capability.docs_url} target="_blank" rel="noreferrer">API reference ↗</a>
              </span>)}
            </div>}
          </div>
        )}
        <p className="note">{coverage?.policy || "Rows are never used to infer eligibility or current availability. A missing import is unavailable evidence, not a zero."}</p>
      </div>
    </section>
  );
}
