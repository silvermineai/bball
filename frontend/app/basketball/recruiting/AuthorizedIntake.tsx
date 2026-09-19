"use client";

import { useEffect, useState } from "react";
import { describeRecruitingIntakeCoverage, validateRecruitingIntakeCsv, type RecruitingIntakePreflight } from "../../_lib/recruiting-intake";

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
  source?: string;
  unavailable_reason?: string;
  policy: string;
};

const clock = (value: string | null) =>
  value
    ? `${new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value))} UTC`
    : "not captured";

export default function AuthorizedIntake() {
  const [coverage, setCoverage] = useState<IntakeCoverage | null>(null);
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");
  const [preflight, setPreflight] = useState<RecruitingIntakePreflight | null>(null);
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
  const importedProviders = new Set([
    ...(coverage?.providers ?? []).map((provider) => provider.provider),
    ...providerFeeds.map((feed) => feed.provider),
  ]);
  const coverageDisplay = coverage ? describeRecruitingIntakeCoverage(coverage) : null;
  return (
    <section className="section">
      <div className="paper-panel recruiting-intake">
        <div className="section-heading">
          <div>
            <div className="eyebrow">Authorized evidence intake / 2026–27</div>
            <h2>Keep licensed intake records separate.</h2>
          </div>
          <div className="button-row">
            <a className="button secondary" href="/data/recruiting-intake-template.csv" download>Download CSV template ↓</a>
          </div>
        </div>
        <p>
          An approved transfer or eligibility feed can be imported with its license, capture clocks and stable record IDs. Optional licensed feeds can be enabled with a server-side key; their portal, recruiting-player and team-ranking rows stay in a separate private D1 table. Silvermine does not merge imported records into school announcements, roster observations or forecast inputs.
        </p>
        {error ? <p className="status-error" role="alert">{error}</p> : !coverage ? <p className="empty" role="status">Checking authorized intake coverage…</p> : !coverageDisplay?.available ? (
          <div className="recruiting-intake-preflight-result has-errors" role="status">
            <strong>{coverageDisplay?.headline}</strong>
            <p>{coverageDisplay?.detail} No intake count is shown because this response does not establish whether licensed rows exist.</p>
          </div>
        ) : (
          <div className="recruiting-intake-status">
            <div>
              <strong>{coverageDisplay.headline}</strong>
              <span>{coverageDisplay.detail}</span>
            </div>
            <div>
              <strong>{importedProviders.size.toLocaleString()}</strong>
              <span>licensed feeds with retained rows</span>
            </div>
            <div>
              <strong>{clock(coverage.latest_captured_at)}</strong>
              <span>latest capture clock</span>
            </div>
            <div className="recruiting-intake-detail">
              {coverage.total || providerFeeds.length ? <>
                {coverage.providers.map((provider, index) => <span key={provider.provider}>Licensed feed {index + 1} · {provider.rows.toLocaleString()} intake rows · {clock(provider.latest_captured_at)}</span>)}
                {providerFeeds.map((feed, index) => <span key={`${feed.provider}-${feed.kind}`}>Licensed feed {index + 1} · {feed.kind} · {feed.rows.toLocaleString()} private rows · {clock(feed.latest_captured_at)}</span>)}
              </> : <span>No licensed feed export has been imported for this season. The reviewed school-announcement file remains the visible player-level evidence.</span>}
            </div>
            {providerCapabilities.length > 0 && <div className="recruiting-intake-detail">
              {providerCapabilities.map((capability, index) => <span key={capability.provider}>
                <strong>Authorized feed {index + 1}</strong> · {capability.kinds.join(", ")} · {capability.event_date_available ? "event dates available" : "season-level dates only"}
              </span>)}
            </div>}
          </div>
        )}
        <p className="note">{coverage?.policy || "Rows are never used to infer eligibility or current availability. A missing import is unavailable evidence, not a zero."}</p>
        <div className="recruiting-intake-preflight">
          <div>
            <div className="eyebrow">Operator preflight / stays in this browser</div>
            <h3>Check an authorized CSV before import.</h3>
            <p>Select a licensed feed export to validate its shape, chronology, HTTPS record links and row IDs locally. The file is never uploaded here; a clean preflight still needs the server importer and license details described above.</p>
          </div>
          <label className="button secondary recruiting-intake-file">
            {fileName ? `Check ${fileName}` : "Choose licensed CSV"}
            <input name="authorized-recruiting-csv" type="file" accept=".csv,text/csv" onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              setFileName(file.name);
              file.text().then((text) => setPreflight(validateRecruitingIntakeCsv(text))).catch(() => setPreflight({ headers: [], rows: 0, seasons: [], statusCounts: {}, errors: ["The selected file could not be read in this browser."], warnings: [] }));
            }} />
          </label>
          {preflight && <div className={`recruiting-intake-preflight-result ${preflight.errors.length ? "has-errors" : "is-ready"}`} role="status">
            {preflight.errors.length ? <><strong>Needs fixes before import</strong><ul>{preflight.errors.map((item) => <li key={item}>{item}</li>)}</ul></> : <><strong>Ready for the server importer</strong><p>{preflight.rows.toLocaleString()} rows · seasons {preflight.seasons.join(", ") || "—"} · {Object.entries(preflight.statusCounts).map(([status, count]) => `${count} ${status.replace("reported_", "")}`).join(" · ")}</p></>}
            {preflight.warnings.length > 0 && <p className="note">{preflight.warnings.length} row warning{preflight.warnings.length === 1 ? "" : "s"}: blank record IDs will be derived by the importer.</p>}
          </div>}
        </div>
      </div>
    </section>
  );
}
