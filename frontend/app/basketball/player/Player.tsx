"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { date, fmt } from "../../_lib/format";
import {
  careerPoints,
  identityReview,
  historyMetricLabels,
  seasonLabel,
  sourceNames,
  type CareerData,
  type CareerCatalog,
  type StatKey,
} from "../../_lib/careers";
import LegacyRecords from "./LegacyRecords";
import PlayerRecruitingContext from "./PlayerRecruitingContext";
import PlayerValuePanel from "./PlayerValuePanel";
import { comparisonHref } from "../../_lib/player-comparison";
const statLabels: Record<StatKey, string> = {
  min: "Minutes",
  pts: "Points",
  fgm: "Field goals made",
  fga: "Field goals attempted",
  tpm: "Threes made",
  tpa: "Threes attempted",
  ftm: "Free throws made",
  fta: "Free throws attempted",
  orb: "Offensive rebounds",
  drb: "Defensive rebounds",
  reb: "Rebounds",
  ast: "Assists",
  stl: "Steals",
  blk: "Blocks",
  tov: "Turnovers",
  pf: "Fouls",
};
export default function Player({ catalog }: { catalog: CareerCatalog }) {
  const params = useSearchParams(),
    id = params.get("id"),
    requested = params.get("season");
  const [season, setSeason] = useState(requested || ""),
    [data, setData] = useState<CareerData | null>(null),
    [error, setError] = useState(""),
    [missing, setMissing] = useState(false),
    [metric, setMetric] = useState<keyof typeof historyMetricLabels>("ppg"),
    [filter, setFilter] = useState("all"),
    [page, setPage] = useState(0),
    [legacy, setLegacy] = useState(false);
  useEffect(() => {
    setSeason(requested || "");
    setPage(0);
    setFilter("all");
  }, [id, requested]);
  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    setData(null);
    setError("");
    setMissing(false);
    fetch(
      `/api/basketball/research/careers/${encodeURIComponent(id)}${season ? `?season=${encodeURIComponent(season)}` : ""}`,
      { signal: controller.signal },
    )
      .then(async (r) => {
        if (!r.ok) {
          setMissing(r.status === 404);
          throw Error(
            r.status === 404
              ? "No box-score history is available for this source identity in the imported archive."
              : "The historical player file could not be loaded. Please reload.",
          );
        }
        return r.json();
      })
      .then(setData)
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => controller.abort();
  }, [id, season]);
  const selected = data?.profiles.find((p) => p.season === data.season),
    totals = selected?.overall;
  const identityNeedsReview = !!data && identityReview(data.profiles);
  const points =
      data && !identityNeedsReview ? careerPoints(data.profiles, metric) : [],
    max = Math.max(1, ...points.map((p) => p.value ?? 0));
  const rows = (data?.rows || []).filter(
    (r) =>
      filter === "all" ||
      (filter === "played"
        ? r.appearance
        : filter === "dnp"
          ? r.dnp === true
          : !r.appearance),
  );
  const changeSeason = (value: string) => {
    setSeason(value);
    const url = new URL(window.location.href);
    url.searchParams.set("season", value);
    window.history.replaceState(null, "", url);
    setFilter("all");
    setPage(0);
  };
  return (
    <>
      <Link
        className="eyebrow"
        href={`/basketball/players/${season ? `?season=${season}` : ""}`}
      >
        ← Historical player index
      </Link>
      <div className="page-title">
        <div className="eyebrow" style={{ marginTop: 20 }}>
          The player file / Source identity {id || "not selected"}
        </div>
        <h1>{selected?.name || data?.profiles[0]?.name || "Player history"}</h1>
        <p>
          Follow recorded production across seasons and programs. Compare
          workload and shooting, then inspect the games behind every season
          total. A historical appearance is not a current roster or eligibility
          claim.
        </p>
        {data && (
          <div className="hero-actions">
            {data.profiles.some((p) => p.season === 2026) && (
              <Link
                className="button"
                href={`/basketball/shooting/?player=${id}`}
              >
                2025–26 shooting lab ↗
              </Link>
            )}
            {data.profiles.some(
              (p) => p.season >= 2025 && p.overall.games > 0,
            ) && (
              <Link
                className="hero-link"
                href={`/basketball/recruiting/?q=${encodeURIComponent(selected?.name || data.profiles[0].name)}`}
              >
                Search school announcements →
              </Link>
            )}
            <Link
              className="hero-link"
              href={`/basketball/ncaa-rankings/?q=${encodeURIComponent(selected?.name || data.profiles[0].name)}`}
            >
              Search NCAA source records →
            </Link>
            <Link
              className="hero-link"
              href={`/basketball/source-stats/?q=${encodeURIComponent(selected?.name || data.profiles[0].name)}`}
            >
              Search publisher stat fields →
            </Link>
          </div>
        )}
      </div>
      {!id ? (
        <p className="empty">
          Choose a player from the historical index or a program dossier.
        </p>
      ) : error ? (
        <p className="empty" role="alert">
          {error}
        </p>
      ) : !data ? (
        <p className="empty" role="status">
          Loading historical game evidence…
        </p>
      ) : (
        <>
          {sourceNames(data.profiles).length > 1 && (
            <p className="note career-name-note">
              Names reported under this source ID:{" "}
              {sourceNames(data.profiles).join(" · ")}. Each season retains its
              own reported name; identity is joined by source ID.
            </p>
          )}
          <PlayerRecruitingContext id={id} />
          <PlayerValuePanel id={id} season={data.season} />
          <div className="career-toolbar">
            <label className="control">
              <span>STAT SEASON</span>
              <select
                value={data.season}
                onChange={(e) => changeSeason(e.target.value)}
              >
                {catalog.seasons.map((s) => (
                  <option key={s.season} value={s.season}>
                    {seasonLabel(s.season)}
                    {data.profiles.some((p) => p.season === s.season)
                      ? " · source records"
                      : " · no records for this ID"}
                  </option>
                ))}
              </select>
            </label>
            <p className="note">
              {data.coverage.appearance_games.toLocaleString()} games with
              recorded player appearances /{" "}
              {data.coverage.completed_schedule_games.toLocaleString()}{" "}
              completed schedule entries in this season’s source coverage.
            </p>
          </div>
          {data.core && data.core.length > 0 && (
            <section className="section paper-panel">
              <div className="section-heading">
                <div>
                  <div className="eyebrow">ESPN-derived source profile</div>
                  <h2>Identity and roster context.</h2>
                </div>
              </div>
              <p className="note">
                Source profile fields help orient the archive. They do not
                establish current eligibility, a transfer destination, or a
                unique person beyond the publisher&apos;s source ID.
              </p>
              <div className="strip">
                {[
                  ["Position", data.core.find((p) => p.season === data.season)?.profile.position_display_name || data.core.find((p) => p.season === data.season)?.profile.position_name],
                  ["Height", data.core.find((p) => p.season === data.season)?.profile.display_height],
                  ["Weight", data.core.find((p) => p.season === data.season)?.profile.display_weight],
                  ["Jersey", data.core.find((p) => p.season === data.season)?.profile.jersey],
                  ["Experience", data.core.find((p) => p.season === data.season)?.profile.experience_years],
                  ["Status", data.core.find((p) => p.season === data.season)?.profile.status_name],
                ].map(([label, value]) => (
                  <div key={label}>
                    <strong>{value || "—"}</strong>
                    <span>{label}</span>
                  </div>
                ))}
              </div>
              <p className="note">
                Core seasons present: {data.core.map((p) => seasonLabel(p.season)).join(" · ")}
              </p>
            </section>
          )}
          {selected && selected.teams.filter((t) => t.games > 0).length > 0 && (
            <div className="hero-actions">
              {selected.teams
                .filter((t) => t.games > 0)
                .map((t) => (
                  <Link
                    className="button secondary"
                    key={t.team_id}
                    href={comparisonHref({
                      season: selected.season,
                      id: selected.id,
                      team_id: t.team_id,
                    })}
                  >
                    Compare {t.team} · {seasonLabel(selected.season)} →
                  </Link>
                ))}
            </div>
          )}
          <div className="strip">
            <div>
              <strong>{totals?.games ?? 0}</strong>
              <span>Games with recorded playing time</span>
            </div>
            <div>
              <strong>{fmt(totals?.ppg)}</strong>
              <span>Points per recorded game</span>
            </div>
            <div>
              <strong>{fmt(totals?.mpg)}</strong>
              <span>Minutes per recorded game</span>
            </div>
            <div>
              <strong>
                {totals?.ts == null ? "—" : fmt(totals.ts * 100) + "%"}
              </strong>
              <span>Estimated true shooting</span>
            </div>
          </div>
          <section className="section career-development">
            <div className="section-heading">
              <div>
                <div className="eyebrow">Development / Recorded seasons</div>
                <h2>How the workload changed.</h2>
              </div>
              <label className="control">
                <span>CHART MEASURE</span>
                <select
                  value={metric}
                  onChange={(e) => setMetric(e.target.value as typeof metric)}
                >
                  {Object.entries(historyMetricLabels).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {identityNeedsReview && (
              <p className="empty">
                This source ID has differing reported names or a span longer
                than eight years. Identity review is needed before treating
                these records as one player’s development. Inspect the
                separately labeled season records below; the combined chart is
                withheld.
              </p>
            )}
            <div className="career-bars">
              {points.map((p) => (
                <button
                  key={p.season}
                  aria-pressed={data.season === p.season}
                  onClick={() => changeSeason(String(p.season))}
                  className="career-bar"
                  aria-label={`${seasonLabel(p.season)}, ${historyMetricLabels[metric]} ${p.value === null ? "unavailable" : fmt(p.value * (metric === "ts" ? 100 : 1))}, ${p.games} games`}
                >
                  <span className="career-bar-season">
                    {seasonLabel(p.season)}
                  </span>
                  <span className="career-bar-track">
                    <span
                      style={{
                        width: `${p.value == null ? 0 : (p.value / max) * 100}%`,
                      }}
                    />
                  </span>
                  <strong>
                    {p.value === null
                      ? "—"
                      : fmt(p.value * (metric === "ts" ? 100 : 1)) +
                        (metric === "ts" ? "%" : "")}
                  </strong>
                  <small>
                    {p.games} GP · {p.teams || "No recorded playing time"}
                  </small>
                </button>
              ))}
            </div>
            <p className="note">
              Choose a season to inspect its games. Values pool recorded
              appearances, including across multiple programs in a season. Small
              samples and changing opponents can explain apparent development;
              these are descriptive statistics.
            </p>
          </section>
          <section className="section">
            <div className="section-heading">
              <div>
                <div className="eyebrow">
                  All imported seasons / Individual program records
                </div>
                <h2>The production trail.</h2>
              </div>
            </div>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    {[
                      "Season / program",
                      "GP",
                      "MIN/G",
                      "PTS/G",
                      "REB/G",
                      "AST/G",
                      "eFG%",
                      "TS%",
                      "3PM/A",
                    ].map((k) => (
                      <th key={k}>{k}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.profiles.flatMap((p) =>
                    p.teams.map((t) => (
                      <tr
                        key={`${p.season}-${t.team_id}`}
                        className={
                          p.season === data.season ? "career-selected-row" : ""
                        }
                      >
                        <td>
                          <button
                            className="career-season-link"
                            onClick={() => changeSeason(String(p.season))}
                          >
                            {seasonLabel(p.season)} · {t.team} →
                          </button>
                          <small>
                            {p.name}
                            {!t.qualified
                              ? " · below full-sample qualification"
                              : ""}
                          </small>
                        </td>
                        {[
                          t.games,
                          t.mpg,
                          t.ppg,
                          t.rpg,
                          t.apg,
                          t.efg == null ? null : t.efg * 100,
                          t.ts == null ? null : t.ts * 100,
                        ].map((v, i) => (
                          <td className="numeric" key={i}>
                            {fmt(v, i === 0 ? 0 : 1)}
                          </td>
                        ))}
                        <td className="numeric">
                          {fmt(t.totals.tpm, 0)}/{fmt(t.totals.tpa, 0)}
                        </td>
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
            </div>
          </section>
          <section className="section">
            <div className="section-heading">
              <div>
                <div className="eyebrow">
                  {seasonLabel(data.season)} / Game evidence
                </div>
                <h2>Open the box score.</h2>
              </div>
              <label className="control">
                <span>GAME RECORDS</span>
                <select
                  value={filter}
                  onChange={(e) => {
                    setFilter(e.target.value);
                    setPage(0);
                  }}
                >
                  <option value="all">All source records</option>
                  <option value="played">Included playing appearances</option>
                  <option value="dnp">Reported DNP</option>
                  <option value="excluded">
                    Excluded from season averages
                  </option>
                </select>
              </label>
            </div>
            <p className="note">
              {data.rows.length} source rows · {totals?.dnp_records ?? 0}{" "}
              reported DNP · {totals?.excluded_records ?? 0} rows excluded from
              averages. Positive minutes and a completed schedule match are
              required. Missing minutes and DNP flags are preserved.
            </p>
            <div className="table-scroll">
              <table className="data-table career-game-table">
                <thead>
                  <tr>
                    {[
                      "Date / opponent",
                      "Status",
                      "MIN",
                      "PTS",
                      "FG",
                      "3P",
                      "FT",
                      "REB",
                      "AST",
                      "TO",
                      "Full record",
                    ].map((k) => (
                      <th key={k}>{k}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(page * 30, page * 30 + 30).map((r) => (
                    <tr key={`${r.id}-${r.team_id}`}>
                      <td>
                        {r.date ? date(r.date) : "Date unavailable"}
                        <small>
                          {r.team}{" "}
                          {r.venue === "away"
                            ? "at"
                            : r.venue === "neutral"
                              ? "vs (neutral)"
                              : "vs"}{" "}
                          {r.opponent || r.opponent_id || "Unresolved opponent"}
                        </small>
                        {r.score_for != null && r.score_against != null && (
                          <small>
                            Final {r.score_for}–{r.score_against} · game {r.id}{" "}
                            <a
                              href={`https://www.espn.com/mens-college-basketball/game/_/gameId/${encodeURIComponent(r.id)}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              ESPN source ↗
                            </a>
                          </small>
                        )}
                      </td>
                      <td>
                        {r.appearance
                          ? "Played"
                          : r.dnp === true
                            ? "DNP"
                            : !r.schedule_matched
                              ? "Unmatched schedule"
                              : !r.completed
                                ? "Not a confirmed final"
                                : "No positive minutes"}
                      </td>
                      <td>{fmt(r.stats.min, 0)}</td>
                      <td>{fmt(r.stats.pts, 0)}</td>
                      <td>
                        {fmt(r.stats.fgm, 0)}/{fmt(r.stats.fga, 0)}
                      </td>
                      <td>
                        {fmt(r.stats.tpm, 0)}/{fmt(r.stats.tpa, 0)}
                      </td>
                      <td>
                        {fmt(r.stats.ftm, 0)}/{fmt(r.stats.fta, 0)}
                      </td>
                      <td>{fmt(r.stats.reb, 0)}</td>
                      <td>{fmt(r.stats.ast, 0)}</td>
                      <td>{fmt(r.stats.tov, 0)}</td>
                      <td>
                        <details>
                          <summary>All fields</summary>
                          <dl className="career-game-fields">
                            {Object.entries(statLabels).map(([k, label]) => (
                              <div key={k}>
                                <dt>{label}</dt>
                                <dd>{fmt(r.stats[k as StatKey], 0)}</dd>
                              </div>
                            ))}
                          </dl>
                          <p>
                            Starter:{" "}
                            {r.starter === null
                              ? "unreported"
                              : r.starter
                                ? "yes"
                                : "no"}
                          </p>
                          {r.issues.length > 0 && (
                            <p>
                              Source issues: {r.issues.join(", ")}. Invalid
                              fields are withheld from aggregates.
                            </p>
                          )}
                        </details>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!rows.length && (
              <p className="empty">
                No source records match this season and filter. The archive does
                not establish whether the player competed elsewhere.
              </p>
            )}
            <div className="pagination">
              <span>
                {rows.length} records · page {page + 1} of{" "}
                {Math.max(1, Math.ceil(rows.length / 30))}
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
                  disabled={(page + 1) * 30 >= rows.length}
                  onClick={() => setPage(page + 1)}
                >
                  Next →
                </button>
              </div>
            </div>
          </section>
          <section className="section paper-panel">
            <h2>Read the sample before the rate.</h2>
            <p>
              Per-game statistics divide complete observed totals by games with
              recorded minutes. A missing field makes its affected total or rate
              unavailable; unrelated complete statistics remain usable. True
              shooting uses PTS / [2 × (FGA + 0.475 × FTA)]. eFG uses (FGM + 0.5
              × 3PM) / FGA. Zero attempts yield an unavailable percentage.
            </p>
            {totals && (
              <details>
                <summary>Field coverage for {seasonLabel(data.season)}</summary>
                <dl className="raw-stat-grid">
                  {Object.entries(statLabels).map(([k, label]) => (
                    <div key={k}>
                      <dt>{label}</dt>
                      <dd>
                        {totals.samples[k as StatKey]} / {totals.games}{" "}
                        appearances
                      </dd>
                    </div>
                  ))}
                </dl>
              </details>
            )}
            <p>
              The archive is a retrospective source snapshot. It does not update
              current roster status or add historical knowledge to the forecast
              ledger. The earliest and latest records here may not span a full
              college career.
            </p>
            <details>
              <summary>Source receipts and coverage</summary>
              {data.sources.map((s) => (
                <p key={s.dataset}>
                  <a href={s.url}>
                    {s.dataset} / {s.season} · SportsDataverse ↗
                  </a>
                  <br />
                  <small>Retrieved {date(s.fetched_at)}</small>
                  <br />
                  <small className="source-hash">SHA-256 {s.sha256}</small>
                </p>
              ))}
              <p>
                CC BY 4.0, as stated by the publisher. Silvermine normalizes
                fields and calculates the displayed summaries.
              </p>
            </details>
          </section>
        </>
      )}
      {id && (
        <section className="section">
          <button
            className="button secondary"
            aria-expanded={legacy || missing}
            onClick={() => setLegacy(!legacy)}
          >
            Publisher season stats & roster observations {legacy ? "−" : "+"}
          </button>
          {(legacy || missing) && (
            <div className="section">
              <LegacyRecords />
            </div>
          )}
        </section>
      )}
    </>
  );
}
