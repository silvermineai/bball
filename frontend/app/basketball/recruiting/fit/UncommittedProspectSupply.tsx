"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { fmt } from "../../../_lib/format";
import { positionRole, roleLabels, type FitRole } from "../../../_lib/recruiting-fit";

export type UncommittedProspect = {
  athlete_id: string;
  name: string;
  position: string | null;
  rank: number | null;
  grade: number | null;
  committed_team_id: string | null;
  committed_team_name: string | null;
  high_school: string | null;
  hometown: string | null;
  height_inches: number | null;
  weight_pounds: number | null;
};

export type ProspectSupplyCoverage = {
  total: number;
  position: number;
  rank: number;
  grade: number;
  high_school: number;
  hometown: number;
  height: number;
  weight: number;
};

export type ProspectSupplyRankQuality = {
  ranked_rows: number;
  tied_rank_values: number;
  tied_rows: number;
  withheld_placeholder_rows: number;
};

export type UncommittedProspectPage = {
  season: number;
  page: number;
  page_size: number;
  total: number;
  edition: string;
  captured_at: string | null;
  coverage: ProspectSupplyCoverage;
  rank_quality: ProspectSupplyRankQuality;
  rows: UncommittedProspect[];
};

/** Classes retained by the national recruiting release. */
export const prospectSupplySeasons = [2025, 2026, 2027, 2028, 2029, 2030] as const;
export type ProspectSupplySeason = (typeof prospectSupplySeasons)[number];

const isInteger = (value: unknown): value is number => Number.isSafeInteger(value);
const nullableString = (value: unknown): value is string | null => value == null || typeof value === "string";
const nullableFinite = (value: unknown): value is number | null => value == null || (typeof value === "number" && Number.isFinite(value));
const boundedCount = (value: unknown, total: number): value is number => Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= total;

function validProspect(value: unknown): value is UncommittedProspect {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return typeof row.athlete_id === "string"
    && /^\d{1,15}$/.test(row.athlete_id)
    && typeof row.name === "string"
    && row.name.trim().length > 0
    && nullableString(row.position)
    && (row.rank == null || (isInteger(row.rank) && row.rank > 0))
    && (row.grade == null || (typeof row.grade === "number" && Number.isFinite(row.grade) && row.grade > 0))
    && nullableString(row.committed_team_id)
    && nullableString(row.committed_team_name)
    && nullableString(row.high_school)
    && nullableString(row.hometown)
    && nullableFinite(row.height_inches)
    && nullableFinite(row.weight_pounds);
}

/** Fail closed when a page is for another class, edition, or commitment scope. */
export function parseUncommittedProspectPage(payload: unknown, expectedSeason = 2027): UncommittedProspectPage | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const value = payload as Record<string, unknown>;
  if (value.season !== expectedSeason
    || !isInteger(value.page) || value.page < 0
    || value.page_size !== 50
    || !isInteger(value.total) || value.total < 0
    || typeof value.edition !== "string" || !/^[a-f0-9]{64}$/i.test(value.edition)
    || !nullableString(value.captured_at)
    || !Array.isArray(value.rows)
    || !value.rows.every(validProspect)) return null;
  const total = Number(value.total);
  const coverage = value.field_coverage;
  const rankQuality = value.rank_quality;
  if (!coverage || typeof coverage !== "object" || Array.isArray(coverage)
    || !rankQuality || typeof rankQuality !== "object" || Array.isArray(rankQuality)) return null;
  const coverageRecord = coverage as Record<string, unknown>;
  const rankQualityRecord = rankQuality as Record<string, unknown>;
  const coverageKeys = ["total", "position", "rank", "grade", "high_school", "hometown", "height", "weight"];
  if (coverageKeys.some((key) => !boundedCount(coverageRecord[key], total))
    || Number(coverageRecord.total) !== total
    || !boundedCount(rankQualityRecord.ranked_rows, total)
    || !boundedCount(rankQualityRecord.tied_rank_values, total)
    || !boundedCount(rankQualityRecord.tied_rows, total)
    || !boundedCount(rankQualityRecord.withheld_placeholder_rows, total)
    || Number(rankQualityRecord.ranked_rows) !== Number(coverageRecord.rank)
    || Number(rankQualityRecord.ranked_rows) > Number(coverageRecord.total)
    || Number(rankQualityRecord.tied_rows) > Number(rankQualityRecord.ranked_rows)) return null;
  const ids = new Set<string>();
  for (const row of value.rows as UncommittedProspect[]) {
    // The endpoint is explicitly committed=no. A returned destination would
    // make this supply list misleading, so reject the entire page.
    if (row.committed_team_id?.trim() || row.committed_team_name?.trim() || ids.has(row.athlete_id)) return null;
    ids.add(row.athlete_id);
  }
  if (value.rows.length > value.page_size || value.rows.length > value.total) return null;
  return {
    ...(value as unknown as UncommittedProspectPage),
    coverage: {
      total: Number(coverageRecord.total),
      position: Number(coverageRecord.position),
      rank: Number(coverageRecord.rank),
      grade: Number(coverageRecord.grade),
      high_school: Number(coverageRecord.high_school),
      hometown: Number(coverageRecord.hometown),
      height: Number(coverageRecord.height),
      weight: Number(coverageRecord.weight),
    },
    rank_quality: {
      ranked_rows: Number(rankQualityRecord.ranked_rows),
      tied_rank_values: Number(rankQualityRecord.tied_rank_values),
      tied_rows: Number(rankQualityRecord.tied_rows),
      withheld_placeholder_rows: Number(rankQualityRecord.withheld_placeholder_rows),
    },
  };
}

/** Keep the role mapping identical to the roster fit board. */
export function topUncommittedProspects(rows: UncommittedProspect[], role: FitRole, limit = 8): UncommittedProspect[] {
  if (!Number.isSafeInteger(limit) || limit < 1) return [];
  return rows
    .filter((row) => role === "any" || positionRole(row.position) === role)
    .sort((a, b) => (a.rank == null ? Number.MAX_SAFE_INTEGER : a.rank) - (b.rank == null ? Number.MAX_SAFE_INTEGER : b.rank) || a.name.localeCompare(b.name))
    .slice(0, limit);
}

const size = (row: UncommittedProspect) => {
  const height = row.height_inches == null || row.height_inches <= 0 ? null : `${Math.floor(row.height_inches / 12)}'${row.height_inches % 12}"`;
  const weight = row.weight_pounds == null || row.weight_pounds <= 0 ? null : `${fmt(row.weight_pounds, 0)} lb`;
  return [height, weight].filter(Boolean).join(" · ") || "—";
};

export default function UncommittedProspectSupply({ role, season = 2027 }: { role: FitRole; season?: ProspectSupplySeason }) {
  const [release, setRelease] = useState<UncommittedProspectPage | null>(null);
  const [status, setStatus] = useState<"checking" | "ready" | "unavailable">("checking");
  const [selectedSeason, setSelectedSeason] = useState<ProspectSupplySeason>(season);

  useEffect(() => setSelectedSeason(season), [season]);

  useEffect(() => {
    const controller = new AbortController();
    setStatus("checking");
    setRelease(null);
    const load = async () => {
      // Request the complete recorded uncommitted cohort. The prior rank_max
      // bound made the table look like a full supply list while silently
      // excluding unranked prospects from the denominator.
      const firstResponse = await fetch(`/api/basketball/research/recruiting-rankings?season=${selectedSeason}&committed=no&page=0`, { signal: controller.signal });
      if (!firstResponse.ok) throw new Error("Prospect supply unavailable");
      const first = parseUncommittedProspectPage(await firstResponse.json() as unknown, selectedSeason);
      if (!first) throw new Error("Prospect supply failed edition checks");
      const pages = Math.max(1, Math.ceil(first.total / first.page_size));
      if (pages > 20) throw new Error("Prospect supply is outside the bounded view");
      const remaining = await Promise.all(Array.from({ length: pages - 1 }, (_, index) => index + 1).map(async (page) => {
        const response = await fetch(`/api/basketball/research/recruiting-rankings?season=${selectedSeason}&committed=no&page=${page}`, { signal: controller.signal });
        if (!response.ok) throw new Error("Prospect supply page unavailable");
        const parsed = parseUncommittedProspectPage(await response.json() as unknown, selectedSeason);
        if (!parsed || parsed.edition !== first.edition || parsed.total !== first.total || parsed.page !== page
          || parsed.coverage.rank !== first.coverage.rank || parsed.coverage.grade !== first.coverage.grade) throw new Error("Prospect supply changed during load");
        return parsed;
      }));
      const rows = [first, ...remaining].flatMap((page) => page.rows);
      if (rows.length !== first.total || new Set(rows.map((row) => row.athlete_id)).size !== rows.length) throw new Error("Prospect supply is incomplete");
      if (!controller.signal.aborted) {
        setRelease({ ...first, rows });
        setStatus("ready");
      }
    };
    load().catch((error: unknown) => {
      if ((error as { name?: string })?.name !== "AbortError" && !controller.signal.aborted) setStatus("unavailable");
    });
    return () => controller.abort();
  }, [selectedSeason]);

  const rows = useMemo(() => release ? topUncommittedProspects(release.rows, role) : [], [release, role]);
  const position = role === "any" ? "" : role === "guard" ? "PG" : role === "wing" ? "SF" : "C";
  return <section className="paper-panel recruiting-class-table" aria-labelledby="uncommitted-prospect-supply" style={{ marginTop: 24, marginBottom: 24 }}>
    <div className="section-heading" style={{ marginBottom: 10 }}>
      <div><div className="eyebrow">National prospect supply / {selectedSeason} class</div><h3 id="uncommitted-prospect-supply">Recorded {roleLabels[role].toLowerCase()} supply.</h3></div>
      <label className="control"><span>CLASS</span><select value={selectedSeason} onChange={(event) => setSelectedSeason(Number(event.target.value) as ProspectSupplySeason)}>{prospectSupplySeasons.map((value) => <option value={value} key={value}>{value}</option>)}</select></label>
    </div>
    <p className="note">This is the complete retained cohort whose committed-team field is empty in the same class edition. The table leads with the best recorded ranks for the selected role; unranked rows remain in the denominator. “Uncommitted” means no destination was recorded by the source; it does not establish availability, contact, an offer, enrollment or eligibility.</p>
    {status === "ready" && release ? <>
      <div className="strip" aria-label="Prospect supply coverage"><div><strong>{release.total.toLocaleString()}</strong><span>Uncommitted rows</span></div><div><strong>{release.coverage.rank.toLocaleString()} / {release.total.toLocaleString()}</strong><span>Rank recorded</span></div><div><strong>{release.coverage.grade.toLocaleString()} / {release.total.toLocaleString()}</strong><span>Grade recorded</span></div><div><strong>{release.coverage.position.toLocaleString()} / {release.total.toLocaleString()}</strong><span>Position recorded</span></div></div><p className="note" style={{ marginTop: 12 }}>Ranked rows can include tied values ({release.rank_quality.tied_rank_values.toLocaleString()} tied rank values across {release.rank_quality.tied_rows.toLocaleString()} rows). Missing rank or grade remains unavailable and is excluded from the leading order.</p><div className="table-scroll"><table className="data-table"><thead><tr><th>Rank</th><th>Prospect</th><th>Position</th><th>Grade</th><th>Size</th><th>Origin</th><th>Evidence</th></tr></thead><tbody>{rows.map((row) => <tr key={row.athlete_id}>
        <td className="numeric">{row.rank == null ? "—" : `#${row.rank}`}</td>
        <th scope="row"><Link href={`/basketball/recruiting/prospect/?season=${selectedSeason}&id=${encodeURIComponent(row.athlete_id)}`}>{row.name}</Link><small>Exact athlete ID {row.athlete_id}</small></th>
        <td>{row.position || "Unavailable"}</td>
        <td className="numeric">{row.grade == null ? "—" : fmt(row.grade, 1)}</td>
        <td>{size(row)}</td>
        <td>{row.high_school || row.hometown || "Unavailable"}<small>{row.high_school && row.hometown ? row.hometown : "Source field"}</small></td>
        <td><small>No destination recorded</small><Link href={`/basketball/recruiting/?season=${selectedSeason}&committed=no${position ? `&position=${position}` : ""}`}>Open filtered board →</Link></td>
      </tr>)}</tbody></table></div>
      {!rows.length && <p className="empty">No recorded prospects match the selected role.</p>}
      <p className="note" style={{ marginTop: 12 }}>Release {release.edition} · captured {release.captured_at ? new Date(release.captured_at).toLocaleDateString("en-US", { timeZone: "UTC" }) : "date unavailable"} UTC · {release.total.toLocaleString()} rows reconciled. The leading table is capped at eight rows per role; use the filtered board for the complete class.</p>
    </> : <p className="empty">The retained {selectedSeason} prospect release is unavailable right now; no supply claim is shown.</p>}
  </section>;
}
