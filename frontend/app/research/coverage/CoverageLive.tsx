"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { date } from "../../_lib/format";
import {
  auditSourceClocks,
  summarizePossessionReadiness,
  type SourceReceipt,
} from "../../_lib/coverage-health";
import { ncaaStatLabels, type NCAAStatKey } from "../../_lib/ncaa-individual";

type CoverageResponse = {
  coverage: Array<{ dataset: string; rows: number }>;
  source_receipts: SourceReceipt[];
  location_validation?: {
    total: number;
    neutral: number;
    missing_venue: number;
    unconfirmed_start: number;
    missing_participant?: number;
    same_participant: number;
    invalid_periods: number;
    completed_missing_score: number;
    negative_score?: number;
    unfinished_with_score?: number;
    duplicate_contest_ids?: number;
    neutral_missing_venue?: number;
  } | null;
  possession_validation?: {
    total: number;
    paired_box_games: number;
    missing_box_games: number;
    missing_team_box_rows?: number;
    duplicate_team_box_keys?: number;
    negative_field_games: number;
    impossible_shooting_games?: number;
    nonpositive_possession_games: number;
    invalid_period_games: number;
    outlier_pace_games: number;
    score_mismatch_games: number;
    valid_estimate_games: number;
  } | null;
};

type CareerArchiveResponse = {
  seasons?: Array<{
    season: number;
    identified_rows: number | null;
    player_team_entries: number | null;
    appearance_games: number | null;
    completed_schedule_games: number | null;
    latest_receipt: string | null;
  }>;
  latest_receipt?: string | null;
};

type ForecastMeta = {
  seasons?: number[];
  models?: Array<{
    model_id?: string;
    forecasts?: number;
    target_season?: number | null;
    last_created_at?: string | null;
  }>;
};

type RecruitingMeta = {
  edition?: string;
  coverage?: {
    events?: number;
    players?: number;
    programs?: number;
    sources?: number;
    complete_national_coverage?: boolean;
  };
};

type NewsMeta = {
  summary?: {
    total?: number;
    latest_published?: string | null;
    latest_seen_at?: string | null;
  };
  releases?: Array<{
    edition?: string;
    generated_at?: string;
    article_count?: number;
    feeds?: Array<{ name?: string; division?: string; url?: string }>;
  }>;
};

type BriefArchiveMeta = {
  total?: number;
  rows?: Array<{
    sport?: string;
    revision?: string;
    game_id?: string;
  }>;
};

type MarketMeta = {
  total?: number;
  pregame?: number;
  seasons?: number[];
  source?: "partial" | "unavailable";
  unavailable_reason?: string;
  unavailable_sources?: string[];
};

type NCAALeaderMeta = {
  season: number;
  coverage: {
    players: number;
    divisions: Record<"1" | "2" | "3", { players: number } & Partial<Record<NCAAStatKey, number>>>;
  };
};

type Freshness = {
  label: string;
  detail: string;
  tone: "fresh" | "recent" | "stale" | "missing";
};

function freshness(receipts: CoverageResponse["source_receipts"]): Freshness {
  const timestamps = receipts
    .map((receipt) => receipt.latest_source_at ? Date.parse(receipt.latest_source_at) : Number.NaN)
    .filter((value) => Number.isFinite(value));
  if (!timestamps.length) return { label: "No source clock", detail: "No dated receipt is available.", tone: "missing" };
  const latest = Math.max(...timestamps);
  const ageHours = Math.max(0, (Date.now() - latest) / 3_600_000);
  const age = ageHours < 1
    ? "less than an hour ago"
    : ageHours < 24
      ? `${Math.floor(ageHours)} hours ago`
      : `${Math.floor(ageHours / 24)} days ago`;
  if (ageHours <= 48) return { label: "Fresh source clock", detail: `Latest receipt ${age}.`, tone: "fresh" };
  if (ageHours <= 168) return { label: "Recent source clock", detail: `Latest receipt ${age}.`, tone: "recent" };
  return { label: "Stale source clock", detail: `Latest receipt ${age}; review before relying on current context.`, tone: "stale" };
}

const labels: Record<string, string> = {
  games: "Games",
  player_box: "Player box rows",
  ncaa_player_box: "NCAA player-game rows",
  ncaa_player_shooting: "NCAA shooting profiles",
  forecasts: "Forecast registrations",
  unresolved: "Identity-review rows",
};

export default function CoverageLive() {
  const [data, setData] = useState<CoverageResponse | null>(null);
  const [football, setFootball] = useState<CoverageResponse | null>(null);
  const [career, setCareer] = useState<CareerArchiveResponse | null>(null);
  const [basketballForecast, setBasketballForecast] = useState<ForecastMeta | null>(null);
  const [footballForecast, setFootballForecast] = useState<ForecastMeta | null>(null);
  const [recruiting, setRecruiting] = useState<RecruitingMeta | null>(null);
  const [news, setNews] = useState<NewsMeta | null>(null);
  const [briefArchive, setBriefArchive] = useState<BriefArchiveMeta | null>(null);
  const [basketballMarkets, setBasketballMarkets] = useState<MarketMeta | null>(null);
  const [footballMarkets, setFootballMarkets] = useState<MarketMeta | null>(null);
  const [ncaaLeaders, setNcaaLeaders] = useState<NCAALeaderMeta | null>(null);
  const [ncaaLeadersError, setNcaaLeadersError] = useState("");
  const [error, setError] = useState("");
  const [footballError, setFootballError] = useState("");
  const [careerError, setCareerError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    const load = async <T,>(url: string, onValue: (value: T) => void, onError: (value: string) => void) => {
      let failure: unknown;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const response = await fetch(url, { signal: controller.signal });
          if (response.ok) {
            const value = await response.json() as T;
            if (!controller.signal.aborted) onValue(value);
            return;
          }
          failure = new Error("The live D1 coverage check is unavailable.");
          if (response.status !== 429 && response.status < 500) break;
        } catch (reason: unknown) {
          if ((reason as { name?: string })?.name === "AbortError") return;
          failure = reason;
        }
        if (attempt === 0 && !controller.signal.aborted) {
          await new Promise((resolve) => window.setTimeout(resolve, 350));
        }
      }
      if (!controller.signal.aborted) onError(failure instanceof Error ? failure.message : "The live D1 coverage check is unavailable.");
    };
    void load("/api/basketball/research/coverage", setData, setError);
    void load("/api/football/coverage", setFootball, setFootballError);
    void load<ForecastMeta>("/api/basketball/research/forecasts?season=2027&meta=1", setBasketballForecast, () => undefined);
    void load<ForecastMeta>("/api/football/research/forecasts?season=2026&meta=1", setFootballForecast, () => undefined);
    void load<RecruitingMeta>("/api/basketball/research/recruiting?season=2027", setRecruiting, () => undefined);
    void load<NewsMeta>("/api/basketball/research/news?meta=1&limit=1", setNews, () => undefined);
    void load<BriefArchiveMeta>("/api/research/briefs?sport=all&page=0", setBriefArchive, () => undefined);
    void load<MarketMeta>("/api/research/markets?meta=1&sport=basketball", setBasketballMarkets, () => undefined);
    void load<MarketMeta>("/api/research/markets?meta=1&sport=football", setFootballMarkets, () => undefined);
    void load<NCAALeaderMeta>("/api/basketball/research/ncaa-leaders?meta=1", setNcaaLeaders, setNcaaLeadersError);
    void fetch("/api/basketball/research/careers/meta", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("The live career archive check is unavailable.");
        return response.json() as Promise<CareerArchiveResponse>;
      })
      .then((value) => { if (!controller.signal.aborted) setCareer(value); })
      .catch((reason: unknown) => {
        if ((reason as { name?: string })?.name !== "AbortError") setCareerError(reason instanceof Error ? reason.message : "The live career archive check is unavailable.");
      });
    return () => controller.abort();
  }, []);

  const rows = data?.coverage.filter((row) => labels[row.dataset]) || [];
  const footballRows = football?.coverage || [];
  const footballLabel = (dataset: string) => dataset === "games" ? "Games" : `${dataset.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())} rows`;
  const basketballFreshness = data ? freshness(data.source_receipts) : null;
  const footballFreshness = football ? freshness(football.source_receipts) : null;
  const basketballClockAudit = data ? auditSourceClocks(data.source_receipts) : null;
  const footballClockAudit = football ? auditSourceClocks(football.source_receipts) : null;
  const basketballReadiness = data?.possession_validation
    ? summarizePossessionReadiness(data.possession_validation)
    : null;
  const basketballModel = basketballForecast?.models?.[0];
  const footballModel = footballForecast?.models?.[0];
  return (
    <section className="section" aria-live="polite">
      <div className="section-heading">
        <div>
          <div className="eyebrow">Live Cloudflare check</div>
          <h2>Confirm the warehouse behind the page.</h2>
        </div>
        <span className="note">{data && football ? "Football + basketball reads successful" : error || footballError ? "One D1 read unavailable" : "Checking D1…"}</span>
      </div>
      <p className="note">This read-only check queries the deployed Cloudflare D1 database, rather than the bundled static files. It gives the current remote row counts and the latest source receipt clocks used by the research publisher.</p>
      {error && <p className="status-error" role="alert">Basketball: {error}</p>}
      {footballError && <p className="status-error" role="alert">Football: {footballError}</p>}
      {(basketballModel || footballModel || recruiting?.coverage || news?.summary || briefArchive || basketballMarkets || footballMarkets) && <div className="strip" style={{ marginTop: 20 }}>
        <div>
          <strong>{basketballModel?.forecasts?.toLocaleString() ?? "—"}</strong>
          <span>Basketball forecasts · {basketballModel?.target_season ?? 2027}</span>
          <small>{basketballModel?.model_id || "Model metadata unavailable"}</small>
        </div>
        <div>
          <strong>{footballModel?.forecasts?.toLocaleString() ?? "—"}</strong>
          <span>Football forecasts · {footballModel?.target_season ?? 2026}</span>
          <small>{footballModel?.model_id || "Model metadata unavailable"}</small>
        </div>
        <div>
          <strong>{recruiting?.coverage?.players?.toLocaleString() ?? "—"}</strong>
          <span>Reviewed recruiting players</span>
          <small>{recruiting?.coverage?.programs?.toLocaleString() ?? "—"} programs · {recruiting?.coverage?.events?.toLocaleString() ?? "—"} dated statements</small>
        </div>
        <div>
          <strong>{footballMarkets?.pregame?.toLocaleString() ?? "—"}</strong>
          <span>Football pregame market rows</span>
          <small>{footballMarkets?.total?.toLocaleString() ?? "—"} retained observations · {footballMarkets?.seasons?.length?.toLocaleString() ?? "—"} seasons</small>
        </div>
        <div>
          <strong>{basketballMarkets?.pregame?.toLocaleString() ?? "—"}</strong>
          <span>Basketball pregame market rows</span>
          <small>{basketballMarkets?.total?.toLocaleString() ?? "—"} retained observations · {basketballMarkets?.seasons?.length?.toLocaleString() ?? "—"} seasons</small>
        </div>
        <div>
          <strong>{news?.summary?.total?.toLocaleString() ?? "—"}</strong>
          <span>Publisher-wire headlines</span>
          <small>{news?.summary?.latest_published ? `latest ${date(news.summary.latest_published)}` : "publication clock unavailable"}</small>
        </div>
        <div>
          <strong>{briefArchive?.total?.toLocaleString() ?? "—"}</strong>
          <span>Archived game notebooks</span>
          <small><Link href="/research/briefs/">Open the reading archive →</Link></small>
        </div>
      </div>}
      {!data && !football ? <p className="empty" role="status">Loading remote coverage…</p> : (
        <>
          {(basketballMarkets?.source === "unavailable" || footballMarkets?.source === "unavailable") && <p className="status-error" role="alert">
            Market archive read unavailable for {[basketballMarkets?.source === "unavailable" ? "basketball" : null, footballMarkets?.source === "unavailable" ? "football" : null].filter((value): value is string => value !== null).join(" and ")}. The bundled ledger remains available; retry this page after the D1 read window clears.
          </p>}
          {(basketballMarkets?.source === "partial" || footballMarkets?.source === "partial") && <p className="note" role="status">
            Market metadata is partial while one archive binding is busy. Counts shown above reflect the binding that answered, and the missing source is kept out of any inference.
          </p>}
          {data && <><div className="eyebrow" style={{ marginTop: 20 }}>Basketball D1</div><div className="strip">
            {rows.map((row) => <div key={row.dataset}><strong>{Number(row.rows || 0).toLocaleString()}</strong><span>{labels[row.dataset]}</span></div>)}
          </div><div className="table-scroll" style={{ marginTop: 20 }}>
            <table className="data-table">
              <thead><tr><th>Source dataset</th><th className="numeric">D1 receipts</th><th>Latest source clock</th><th>Status</th></tr></thead>
              <tbody>{data.source_receipts.map((receipt) => {
                const ageHours = receipt.latest_source_at ? Math.max(0, (Date.now() - Date.parse(receipt.latest_source_at)) / 3_600_000) : null;
                const status = ageHours == null || !Number.isFinite(ageHours) ? "Missing clock" : ageHours > 168 ? "Stale" : "Within 7 days";
                return <tr key={receipt.dataset}><td><strong>{receipt.dataset}</strong></td><td className="numeric">{Number(receipt.source_count || 0).toLocaleString()}</td><td>{receipt.latest_source_at ? date(receipt.latest_source_at) : "—"}</td><td><span className="status-pill">{status}</span></td></tr>;
              })}</tbody>
            </table>
          </div>{(basketballClockAudit?.stale.length || basketballClockAudit?.missing.length) ? <p className="note" role="status">Dataset clocks needing review: {[...(basketballClockAudit.stale.map((dataset) => `${dataset} stale`)), ...(basketballClockAudit.missing.map((dataset) => `${dataset} missing`))].join(", ")}.</p> : null}{news?.summary && <div className="paper-panel" style={{ marginTop: 20 }}>
            <div className="eyebrow">Publisher wire / RSS receipt</div>
            <h3>{news.summary.total?.toLocaleString() ?? "—"} retained basketball headlines.</h3>
            <p className="note">The wire keeps each supplied headline, summary and source URL. It does not fetch or rewrite linked article pages, and it never turns a headline into a recruiting transaction, eligibility ruling or availability claim.</p>
            <div className="raw-stat-grid">
              <div><dt>{news.summary.latest_published ? date(news.summary.latest_published) : "—"}</dt><dd>Latest source publication</dd></div>
              <div><dt>{news.summary.latest_seen_at ? date(news.summary.latest_seen_at) : "—"}</dt><dd>Latest D1 capture</dd></div>
              <div><dt>{news.releases?.[0]?.article_count?.toLocaleString() ?? "—"}</dt><dd>Latest release rows</dd></div>
              <div><dt>{news.releases?.[0]?.feeds?.length?.toLocaleString() ?? "—"}</dt><dd>Permitted feeds</dd></div>
            </div>
            {news.releases?.[0]?.feeds?.length ? <details className="note" style={{ marginTop: 14 }}><summary>Open feed scope</summary><ul>{news.releases[0].feeds.map((feed) => <li key={`${feed.url || feed.name}-${feed.division || "all"}`}>{feed.name || feed.url || "Publisher feed"}{feed.division ? ` · ${feed.division}` : " · division-neutral"}</li>)}</ul></details> : null}
          </div>}{ncaaLeaders && <details className="paper-panel" style={{ marginTop: 20 }}>
            <summary><strong>NCAA national leader coverage · {ncaaLeaders.season - 1}–{String(ncaaLeaders.season).slice(-2)}</strong></summary>
            <p className="note" style={{ marginTop: 12 }}>Live D1 counts of finite values in the retained final national-ranking snapshot. The player total is the row count; a lower measure count means that the publisher did not supply that field for every row. Missing source values remain unavailable.</p>
            <div className="table-scroll" style={{ marginTop: 12 }}>
              <table className="data-table">
                <thead><tr><th>Measure</th><th className="numeric">Division I</th><th className="numeric">Division II</th><th className="numeric">Division III</th></tr></thead>
                <tbody>{(Object.keys(ncaaStatLabels) as NCAAStatKey[]).map((stat) => <tr key={stat}>
                  <th scope="row">{ncaaStatLabels[stat]}</th>
                  <td className="numeric">{(ncaaLeaders.coverage.divisions["1"][stat] ?? 0).toLocaleString()}</td>
                  <td className="numeric">{(ncaaLeaders.coverage.divisions["2"][stat] ?? 0).toLocaleString()}</td>
                  <td className="numeric">{(ncaaLeaders.coverage.divisions["3"][stat] ?? 0).toLocaleString()}</td>
                </tr>)}</tbody>
              </table>
            </div>
            <p className="note" style={{ marginTop: 12 }}><Link href="/basketball/ncaa/">Open the national leaderboards →</Link> · {ncaaLeaders.coverage.players.toLocaleString()} total source rows checked.</p>
          </details>}{ncaaLeadersError && <p className="note">NCAA national leader coverage: {ncaaLeadersError} The bundled coverage inventory remains available.</p>}{career && <div className="paper-panel" style={{ marginTop: 20 }}>
            <div className="eyebrow">Historical player archive / D1</div>
            <h3>{career.seasons?.length?.toLocaleString() ?? "—"} source seasons connected.</h3>
            <div className="raw-stat-grid">
              <div><dt>{career.seasons?.reduce((sum, row) => sum + (row.identified_rows || 0), 0).toLocaleString() ?? "—"}</dt><dd>Identified player box rows</dd></div>
              <div><dt>{career.seasons?.reduce((sum, row) => sum + (row.player_team_entries || 0), 0).toLocaleString() ?? "—"}</dt><dd>Player / program records</dd></div>
              <div><dt>{career.seasons?.[0]?.season ?? "—"}</dt><dd>Newest season ending year</dd></div>
              <div><dt>{career.latest_receipt ? date(career.latest_receipt) : "—"}</dt><dd>Latest source receipt</dd></div>
            </div>
            <p className="note">This bounded read confirms the active D1 archive pointer without returning player rows. Open the player statistics desk to search the verified bundled release and follow exact source IDs into game logs.</p>
            <Link href="/basketball/players/">Open player statistics →</Link>
          </div>}{careerError && <p className="note">Historical player archive: {careerError} The bundled coverage inventory remains available.</p>}<div className="paper-panel" style={{ marginTop: 20 }}>
            <div className="eyebrow">Source clock</div>
            <h3>{basketballFreshness?.label}</h3>
            <p className="note">{basketballFreshness?.detail} This describes the newest retained source receipt, not statistical completeness or game availability.</p>
            <span className="status-pill">{basketballFreshness?.tone === "fresh" ? "Within 48 hours" : basketballFreshness?.tone === "recent" ? "Within 7 days" : basketballFreshness?.tone === "stale" ? "Older than 7 days" : "Clock unavailable"}</span>
          </div>{data.location_validation && <div className="paper-panel" style={{ marginTop: 20 }}>
            <div className="eyebrow">Schedule integrity / location fields</div>
            <h3>Know which game context is usable.</h3>
            <div className="raw-stat-grid">
              <div><dt>{data.location_validation.total.toLocaleString()}</dt><dd>Schedule records checked</dd></div>
              <div><dt>{data.location_validation.neutral.toLocaleString()}</dt><dd>Neutral-site records</dd></div>
              <div><dt>{data.location_validation.unconfirmed_start.toLocaleString()}</dt><dd>Unconfirmed start times</dd></div>
              <div><dt>{data.location_validation.missing_venue.toLocaleString()}</dt><dd>Missing venue labels</dd></div>
              <div><dt>{data.location_validation.missing_participant?.toLocaleString() ?? "—"}</dt><dd>Missing participant IDs</dd></div>
              <div><dt>{data.location_validation.same_participant.toLocaleString()}</dt><dd>Same-side participant IDs</dd></div>
              <div><dt>{data.location_validation.invalid_periods.toLocaleString()}</dt><dd>Missing/invalid period fields</dd></div>
              <div><dt>{data.location_validation.completed_missing_score.toLocaleString()}</dt><dd>Completed rows missing a score</dd></div>
              <div><dt>{data.location_validation.negative_score?.toLocaleString() ?? "—"}</dt><dd>Completed rows with negative score</dd></div>
              <div><dt>{data.location_validation.unfinished_with_score?.toLocaleString() ?? "—"}</dt><dd>Unfinished rows carrying scores</dd></div>
              <div><dt>{data.location_validation.duplicate_contest_ids?.toLocaleString() ?? "—"}</dt><dd>Duplicate source contest IDs captured at ingest</dd></div>
              <div><dt>{data.location_validation.neutral_missing_venue?.toLocaleString() ?? "—"}</dt><dd>Neutral rows missing venue</dd></div>
            </div>
            <p className="note">Neutral-site flags, venue labels, participant IDs, period counts and final scores stay separate from player identity joins. Forecast and efficiency calculations continue to exclude records that fail their own paired-data checks.</p>
          </div>}{basketballReadiness && <div className="coverage-readiness" role="status">
            <div>
              <div className="eyebrow">Model readiness</div>
              <strong>{basketballReadiness.usableShare == null ? "—" : `${(basketballReadiness.usableShare * 100).toFixed(1)}%`}</strong>
              <span>of completed games have valid possession estimates</span>
            </div>
            <div>
              <strong>{basketballReadiness.usable.toLocaleString()}</strong>
              <span>usable games</span>
            </div>
            <div>
              <strong>{basketballReadiness.withheld.toLocaleString()}</strong>
              <span>withheld from efficiency features</span>
            </div>
            <div>
              <strong>{basketballReadiness.reviewFlags.toLocaleString()}</strong>
              <span>diagnostic flags across checks</span>
            </div>
          </div>}{data.possession_validation && <div className="paper-panel" style={{ marginTop: 20 }}>
            <div className="eyebrow">Possession estimate integrity</div>
            <h3>See how much of the completed schedule is model-ready.</h3>
            <div className="raw-stat-grid">
              <div><dt>{data.possession_validation.total.toLocaleString()}</dt><dd>Completed games checked</dd></div>
              <div><dt>{data.possession_validation.paired_box_games.toLocaleString()}</dt><dd>Games with all four team fields</dd></div>
              <div><dt>{data.possession_validation.valid_estimate_games.toLocaleString()}</dt><dd>Valid possession estimates</dd></div>
              <div><dt>{data.possession_validation.missing_box_games.toLocaleString()}</dt><dd>Missing required team box fields</dd></div>
              <div><dt>{data.possession_validation.missing_team_box_rows?.toLocaleString() ?? "—"}</dt><dd>Games missing a team box row</dd></div>
              <div><dt>{data.possession_validation.duplicate_team_box_keys?.toLocaleString() ?? "—"}</dt><dd>Duplicate team-box keys</dd></div>
              <div><dt>{data.possession_validation.negative_field_games.toLocaleString()}</dt><dd>Negative box-score fields</dd></div>
              <div><dt>{data.possession_validation.impossible_shooting_games?.toLocaleString() ?? "—"}</dt><dd>Impossible shooting totals</dd></div>
              <div><dt>{data.possession_validation.nonpositive_possession_games.toLocaleString()}</dt><dd>Nonpositive estimates</dd></div>
              <div><dt>{data.possession_validation.outlier_pace_games.toLocaleString()}</dt><dd>Outlier pace estimates</dd></div>
              <div><dt>{data.possession_validation.score_mismatch_games.toLocaleString()}</dt><dd>Box score / schedule mismatches</dd></div>
            </div>
            <p className="note">The diagnostic mirrors the model’s required FGA, FTA, offensive-rebound, turnover, shooting-total and period guards. Only games with valid estimates enter efficiency features; mismatch counts remain visible for review.</p>
          </div>}</>}
          {football && <><div className="eyebrow" style={{ marginTop: 28 }}>Football D1</div><div className="strip">
            {footballRows.map((row) => <div key={row.dataset}><strong>{Number(row.rows || 0).toLocaleString()}</strong><span>{footballLabel(row.dataset)}</span></div>)}
          </div><div className="table-scroll" style={{ marginTop: 20 }}>
            <table className="data-table">
              <thead><tr><th>Source dataset</th><th className="numeric">D1 receipts</th><th>Latest source clock</th><th>Status</th></tr></thead>
              <tbody>{football.source_receipts.map((receipt) => {
                const ageHours = receipt.latest_source_at ? Math.max(0, (Date.now() - Date.parse(receipt.latest_source_at)) / 3_600_000) : null;
                const status = ageHours == null || !Number.isFinite(ageHours) ? "Missing clock" : ageHours > 168 ? "Stale" : "Within 7 days";
                return <tr key={receipt.dataset}><td><strong>{receipt.dataset}</strong></td><td className="numeric">{Number(receipt.source_count || 0).toLocaleString()}</td><td>{receipt.latest_source_at ? date(receipt.latest_source_at) : "—"}</td><td><span className="status-pill">{status}</span></td></tr>;
              })}</tbody>
            </table>
          </div><div className="paper-panel" style={{ marginTop: 20 }}>
            <div className="eyebrow">Source clock</div>
            <h3>{footballFreshness?.label}</h3>
            <p className="note">{footballFreshness?.detail} This describes the newest retained source receipt, not statistical completeness or game availability.</p>
            <span className="status-pill">{footballFreshness?.tone === "fresh" ? "Within 48 hours" : footballFreshness?.tone === "recent" ? "Within 7 days" : footballFreshness?.tone === "stale" ? "Older than 7 days" : "Clock unavailable"}</span>
          </div>{footballClockAudit && (footballClockAudit.stale.length || footballClockAudit.missing.length) ? <p className="note" role="status">Football dataset clocks needing review: {[...(footballClockAudit.stale.map((dataset) => `${dataset} stale`)), ...(footballClockAudit.missing.map((dataset) => `${dataset} missing`))].join(", ")}.</p> : null}</>}
          <p className="note">Counts are remote table rows, not deduplicated people. Source receipts identify the publisher edition; unresolved rows and name-attributed event records remain visible for review.</p>
        </>
      )}
    </section>
  );
}
