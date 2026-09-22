"use client";

import { useEffect, useState } from "react";
import { describeRecruitingIntakeCoverage, recruitingIntakeRequiredColumns, validateRecruitingIntakeCsv, type RecruitingIntakePreflight } from "../../_lib/recruiting-intake";

type ReviewedCoverage = {
  coverage?: {
    players?: number;
    programs?: number;
    events?: number;
    historical_links?: number;
    complete_national_coverage?: boolean;
  };
  edition?: string;
  reviewed_at?: string;
};

type IntakeCoverage = {
  total: number;
  authorized_rows?: number | null;
  intake_status?: "rows_available" | "confirmed_empty" | "unavailable";
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
  public_rankings?: {
    rows: number;
    ranked_rows: number;
    committed_rows: number;
    edition: string | null;
    latest_captured_at: string | null;
    source_receipt?: {
      dataset: string;
      captured_at: string | null;
      source_rows: number;
      sha256: string | null;
      sha256_scope: "release_edition" | "unavailable";
      integrity: "verified" | "unavailable";
    } | null;
    policy: string;
  };
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
  const [reviewedCoverage, setReviewedCoverage] = useState<ReviewedCoverage | null>(null);
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
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/basketball/research/recruiting?season=2027", { signal: controller.signal })
      .then((response) => response.ok ? response.json() as Promise<ReviewedCoverage> : null)
      .then((value) => { if (!controller.signal.aborted && value) setReviewedCoverage(value); })
      .catch(() => { /* Reviewed coverage remains explicitly unavailable. */ });
    return () => controller.abort();
  }, []);
  const providerFeeds = coverage?.provider_feeds ?? [];
  const providerCapabilities = coverage?.provider_capabilities ?? [];
  const authorizedRows = coverage?.authorized_rows ?? coverage?.total ?? 0;
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
            {coverage.public_rankings && <div>
              <strong>{coverage.public_rankings.rows.toLocaleString()}</strong>
              <span>public prospect rows · {coverage.public_rankings.ranked_rows.toLocaleString()} ranked</span>
            </div>}
            <div className="recruiting-intake-detail">
              {authorizedRows > 0 ? <>
                {coverage.providers.map((provider, index) => <span key={provider.provider}>Licensed feed {index + 1} · {provider.rows.toLocaleString()} intake rows · {clock(provider.latest_captured_at)}</span>)}
                {providerFeeds.map((feed, index) => <span key={`${feed.provider}-${feed.kind}`}>Licensed feed {index + 1} · {feed.kind} · {feed.rows.toLocaleString()} private rows · {clock(feed.latest_captured_at)}</span>)}
                {coverage.public_rankings?.source_receipt ? <span>
                  Public prospect receipt · {coverage.public_rankings.source_receipt.integrity === "verified" ? "verified" : "unavailable"}
                  {coverage.public_rankings.source_receipt.sha256 ? ` · ${coverage.public_rankings.source_receipt.sha256.slice(0, 12)}… · ${coverage.public_rankings.source_receipt.source_rows.toLocaleString()} rows` : " · no verified release digest"}
                </span> : null}
              </> : <>
                <span>No authorized transfer or eligibility export has been imported for this season. The public prospect board and reviewed school-announcement file remain separate evidence.</span>
                {coverage.public_rankings?.source_receipt ? <span>
                  Public prospect receipt · {coverage.public_rankings.source_receipt.integrity === "verified" ? "verified" : "unavailable"}
                  {coverage.public_rankings.source_receipt.sha256 ? ` · ${coverage.public_rankings.source_receipt.sha256.slice(0, 12)}… · ${coverage.public_rankings.source_receipt.source_rows.toLocaleString()} rows` : " · no verified release digest"}
                </span> : null}
              </>}
            </div>
            {providerCapabilities.length > 0 && <div className="recruiting-intake-detail">
              {providerCapabilities.map((capability, index) => <span key={capability.provider}>
                <strong>Authorized feed {index + 1}</strong> · {capability.kinds.join(", ")} · {capability.event_date_available ? "event dates available" : "season-level dates only"}
              </span>)}
            </div>}
          </div>
        )}
        {coverageDisplay?.available && coverage ? (
          <section className="recruiting-intake-compare" aria-label="Recruiting evidence coverage comparison">
            <div>
              <div className="eyebrow">Coverage comparison / 2027</div>
              <h3>Keep the evidence layers separate.</h3>
              <p className="note">Reviewed school announcements, public prospect rankings and licensed intake answer different questions. A zero in one layer does not erase the others.</p>
            </div>
            <div className="recruiting-intake-compare-grid">
              <div><strong>{reviewedCoverage?.coverage?.players == null ? "—" : reviewedCoverage.coverage.players.toLocaleString()}</strong><span>Reviewed additions</span><small>{reviewedCoverage?.coverage?.events == null ? "Coverage unavailable" : `${reviewedCoverage.coverage.events.toLocaleString()} dated events`}</small></div>
              <div><strong>{coverage.public_rankings?.rows == null ? "—" : coverage.public_rankings.rows.toLocaleString()}</strong><span>Public prospect rows</span><small>{coverage.public_rankings?.ranked_rows == null ? "Coverage unavailable" : `${coverage.public_rankings.ranked_rows.toLocaleString()} ranked`}</small></div>
              <div><strong>{authorizedRows.toLocaleString()}</strong><span>Authorized intake rows</span><small>{authorizedRows ? `${importedProviders.size} retained feed${importedProviders.size === 1 ? "" : "s"}` : "No licensed export loaded"}</small></div>
            </div>
          </section>
        ) : null}
        {coverageDisplay?.available && coverage?.intake_status === "confirmed_empty" ? (
          <section className="recruiting-intake-next" aria-label="Next authorized import fields">
            <div>
              <div className="eyebrow">Next required import / no rows loaded</div>
              <h3>What a licensed export must carry.</h3>
              <p className="note">Download the template, fill these fields from an approved feed, then run the local preflight. A clean preflight still requires the server importer and license record.</p>
            </div>
            <div className="recruiting-intake-field-list">
              {recruitingIntakeRequiredColumns.map((field) => <code key={field}>{field}</code>)}
            </div>
          </section>
        ) : null}
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
