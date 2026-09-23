"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { downloadCsv, toCsv } from "../../_lib/csv";
import { fetchJson } from "../../_lib/fetch-json";
import { fetchWithTransientRetry } from "../../_lib/live-basketball-forecasts";
import { parseRecruitingRelease } from "../../_lib/recruiting";
import { buildRecruitingProductionIndex, exactRecruitingProduction, type RecruitingProductionIndex, type RecruitingProductionRow } from "../../_lib/recruiting-production-index";
import { recruitingProductionCoverage } from "../../_lib/recruiting-production-coverage";
import {
  RECRUITING_SHORTLIST_STORAGE_KEY,
  recruitingShortlistEditionLabel,
  recruitingShortlistEditionState,
  recruitingShortlistKey,
  recruitingShortlistRankChangeLabel,
  readRecruitingShortlist,
  toggleRecruitingShortlist,
  type RecruitingShortlistEntry,
} from "../../_lib/recruiting-shortlist";
import { prospectSchools, type ProspectProgram } from "../../_lib/prospect-schools";
import { recordedSchoolPrograms, type RecordedSchoolProgramRow } from "../../_lib/recorded-school-board";
import { recruitingEvidenceGuide } from "./evidence-guide";

export type Prospect = {
  athlete_id: string;
  name: string;
  position: string | null;
  grade: number | null;
  rank: number | null;
  position_rank: number | null;
  state_rank: number | null;
  region_rank: number | null;
  status: string | null;
  committed_team_id: string | null;
  committed_team_name: string | null;
  high_school: string | null;
  hometown: string | null;
  height_inches: number | null;
  weight_pounds: number | null;
  source_url: string;
  school_ids?: string[];
  previous_rank?: number | null;
  previous_captured_at?: string | null;
};
export type RecruitingBoardResult = {
  season: number;
  total: number;
  page: number;
  page_size: number;
  cohort?: { committed: number; ranked: number; graded: number };
  field_coverage?: {
    total: number;
    position: number;
    rank: number;
    grade: number;
    position_rank: number;
    state_rank: number;
    region_rank: number;
    committed_team: number;
    high_school: number;
    hometown: number;
    height: number;
    weight: number;
  };
  identity_quality?: {
    blank_name_rows: number;
    invalid_athlete_id_rows: number;
    committed_id_without_name: number;
    committed_name_without_id: number;
    duplicate_name_groups: number;
    duplicate_name_rows: number;
    malformed_school_list_rows: number;
    non_array_school_list_rows: number;
    duplicate_school_id_rows: number;
  };
  position_breakdown?: Array<{ position: string; total: number }>;
  position_opportunity?: RecruitingPositionOpportunity[];
  commitment_destinations?: Array<{ team_id: string | null; team: string; total: number; ranked_total: number; top100_total: number; source_rank_points: number; best_rank: number | null; average_rank: number | null; position_breakdown?: Array<{ position: string; total: number }> }>;
  destination_coverage?: { returned: number; total: number; limit: number; complete: boolean };
  recorded_school_programs?: RecordedSchoolProgramRow[];
  rank_movement?: { total: number; new_to_release: number; moved_up: number; moved_down: number; unchanged: number; rank_unavailable: number };
  rank_quality?: { ranked_rows: number; tied_rank_values: number; tied_rows: number; withheld_placeholder_rows?: number };
  rank_distribution?: RecruitingRankDistributionBand[];
  edition: string | null;
  captured_at: string | null;
  source_receipt?: { dataset: string; captured_at: string; source_rows: number; sha256: string | null; sha256_scope: "release_edition" | "unavailable"; integrity: "verified" | "unavailable" } | null;
  rows: Prospect[];
  source?: { provider: string; methodology: string; url?: string };
  unavailable_reason?: string;
};
export type RecruitingRankDistributionBand = {
  key: "top_10" | "ranks_11_25" | "ranks_26_50" | "ranks_51_100" | "ranks_101_plus" | "unranked";
  label: string;
  min_rank: number | null;
  max_rank: number | null;
  total: number;
};

const recruitingRankDistributionShape: Array<Pick<RecruitingRankDistributionBand, "key" | "label" | "min_rank" | "max_rank">> = [
  { key: "top_10", label: "Top 10", min_rank: 1, max_rank: 10 },
  { key: "ranks_11_25", label: "11–25", min_rank: 11, max_rank: 25 },
  { key: "ranks_26_50", label: "26–50", min_rank: 26, max_rank: 50 },
  { key: "ranks_51_100", label: "51–100", min_rank: 51, max_rank: 100 },
  { key: "ranks_101_plus", label: "101+", min_rank: 101, max_rank: null },
  { key: "unranked", label: "Rank unavailable", min_rank: null, max_rank: null },
];

const nonNegativeInteger = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;

/** Admit a rank landscape only when it reconciles to the same edition-bound cohort. */
export function validRecruitingRankDistribution(result: RecruitingBoardResult): RecruitingRankDistributionBand[] | null {
  if (!result.edition?.trim() || !nonNegativeInteger(result.total) || !Array.isArray(result.rank_distribution) || result.rank_distribution.length !== recruitingRankDistributionShape.length) {
    return null;
  }
  const valid = result.rank_distribution.every((band, index) => {
    const expected = recruitingRankDistributionShape[index];
    return band.key === expected.key
      && band.label === expected.label
      && band.min_rank === expected.min_rank
      && band.max_rank === expected.max_rank
      && nonNegativeInteger(band.total);
  });
  if (!valid || result.rank_distribution.reduce((sum, band) => sum + band.total, 0) !== result.total) return null;
  return result.rank_distribution;
}
type Result = RecruitingBoardResult;
export type RecruitingSort = "rank" | "grade";
export type RecruitingProductionFilter = "all" | "linked" | "unavailable";
type CommitmentDestination = NonNullable<Result["commitment_destinations"]>[number];
type ClassSnapshot = Pick<Result, "total" | "cohort" | "captured_at" | "position_breakdown" | "commitment_destinations" | "destination_coverage" | "edition" | "source_receipt" | "rank_movement" | "rank_distribution"> & { season: string };
export type RecruitingBoardLoad = { request: string; result: RecruitingBoardResult };

export type RecruitingClassDestinationRow = CommitmentDestination & {
  season: string;
  committedTotal: number | null;
  positionLabels: string[];
};

export type RecruitingClassSnapshotReceipt = {
  sourceRows: number;
  sha256: string;
};

export type RecruitingClassPositionMix = {
  season: string;
  total: number;
  positions: Array<{ position: string; total: number; share: number }>;
};

export type RecruitingPositionOpportunity = {
  position: string;
  total: number;
  committed_total: number;
  uncommitted_total: number;
  ranked_total: number;
  top100_total: number;
  uncommitted_ranked_total: number;
  uncommitted_top100_total: number;
  best_uncommitted_rank: number | null;
  average_uncommitted_grade: number | null;
};

export type RecruitingClassMovement = {
  season: string;
  total: number;
  movedUp: number;
  movedDown: number;
  unchanged: number;
  rankUnavailable: number;
  newToRelease: number;
  measurable: number;
  changed: number;
  changedShare: number | null;
};

export type RecruitingClassRankConcentration = {
  season: string;
  total: number;
  ranked: number;
  top25: number;
  top100: number;
  unranked: number;
  rankedShare: number;
  top25Share: number;
  top100Share: number;
};

export type RecruitingClassCommitmentTrend = {
  season: string;
  total: number;
  recordedCommitments: number;
  noRecordedDestination: number;
  recordedCommitmentShare: number;
  ranked: number;
  rankedShare: number;
  priorSeason: string | null;
  commitmentDelta: number | null;
  commitmentShareDelta: number | null;
  receipt: RecruitingClassSnapshotReceipt;
};

export type RecruitingClassDestinationCoverage = {
  season: string;
  returned: number;
  total: number;
  limit: number;
  complete: boolean;
  retainedCommitments: number;
  recordedCommitments: number;
  retainedCommitmentShare: number | null;
  receipt: RecruitingClassSnapshotReceipt;
};

export type RecruitingDestinationIdentityCoverage = {
  season: string;
  retainedDestinations: number;
  exactIdDestinations: number;
  nameOnlyDestinations: number;
  retainedCommitments: number;
  exactIdCommitments: number;
  exactIdCommitmentShare: number | null;
};

export type RecruitingDestinationRecurrence = {
  teamId: string;
  team: string;
  recordedNames: string[];
  seasons: string[];
  classCount: number;
  eligibleClasses: number;
  commitments: number;
  ranked: number;
  top100: number;
  sourceRankPoints: number;
};

/**
 * Keep cross-class movement tied to a complete, receipt-verified exact-ID
 * release. The API's movement buckets must reconcile to both its reported
 * total and the class denominator before they can be shown as a trend.
 */
export function classMovementRows(snapshots: ClassSnapshot[]): RecruitingClassMovement[] {
  return snapshots.flatMap((snapshot) => {
    const movement = snapshot.rank_movement;
    const total = snapshot.total;
    if (!classSnapshotReceipt(snapshot) || !movement || !Number.isSafeInteger(total) || total <= 0 || movement.total !== total) return [];
    const values = [movement.moved_up, movement.moved_down, movement.unchanged, movement.rank_unavailable, movement.new_to_release];
    if (values.some((value) => !Number.isSafeInteger(value) || value < 0) || values.reduce((sum, value) => sum + value, 0) !== total) return [];
    const measurable = movement.moved_up + movement.moved_down + movement.unchanged;
    const changed = movement.moved_up + movement.moved_down;
    return [{
      season: snapshot.season,
      total,
      movedUp: movement.moved_up,
      movedDown: movement.moved_down,
      unchanged: movement.unchanged,
      rankUnavailable: movement.rank_unavailable,
      newToRelease: movement.new_to_release,
      measurable,
      changed,
      changedShare: measurable > 0 ? changed / measurable : null,
    }];
  });
}

/** Only call a class release verified when its digest covers its full table. */
export function classSnapshotReceipt(snapshot: ClassSnapshot): RecruitingClassSnapshotReceipt | null {
  const receipt = snapshot.source_receipt;
  const sha256 = receipt?.sha256?.trim().toLowerCase() || "";
  const total = snapshot.total;
  if (
    !receipt
    || receipt.dataset !== "recruiting_rankings"
    || receipt.integrity !== "verified"
    || receipt.sha256_scope !== "release_edition"
    || !/^[a-f0-9]{64}$/.test(sha256)
    || !snapshot.edition?.trim()
    || snapshot.edition.trim().toLowerCase() !== sha256
    || !Number.isSafeInteger(receipt.source_rows)
    || receipt.source_rows <= 0
    || !Number.isSafeInteger(total)
    || total <= 0
    || receipt.source_rows !== total
  ) return null;
  return { sourceRows: receipt.source_rows, sha256 };
}

/**
 * Keep position supply comparisons bound to complete, release-verified class
 * rows. A malformed duplicate, negative count, or partial position aggregate
 * is withheld instead of being presented as a recruiting trend.
 */
export function classPositionMix(snapshots: ClassSnapshot[]): RecruitingClassPositionMix[] {
  return snapshots.flatMap((snapshot) => {
    const receipt = classSnapshotReceipt(snapshot);
    if (!receipt || !Number.isSafeInteger(snapshot.total) || snapshot.total <= 0 || !Array.isArray(snapshot.position_breakdown)) return [];
    const positions = snapshot.position_breakdown.map((row) => ({
      position: typeof row.position === "string" ? row.position.trim().toUpperCase() : "",
      total: row.total,
    }));
    if (
      positions.length === 0
      || positions.some((row) => !row.position || !Number.isSafeInteger(row.total) || row.total < 0 || row.total > snapshot.total)
      || new Set(positions.map((row) => row.position)).size !== positions.length
      || positions.reduce((sum, row) => sum + row.total, 0) !== snapshot.total
    ) return [];
    return [{
      season: snapshot.season,
      total: snapshot.total,
      positions: positions
        .sort((a, b) => a.position.localeCompare(b.position))
        .map((row) => ({ ...row, share: row.total / snapshot.total })),
    }];
  });
}

/**
 * Admit the position opportunity board only when its mutually exclusive
 * commitment counts reconcile to the exact active cohort. This keeps missing
 * or partial aggregates from becoming a false claim about available talent.
 */
export function recruitingPositionOpportunityRows(result: RecruitingBoardResult): RecruitingPositionOpportunity[] {
  if (!result.edition?.trim() || !nonNegativeInteger(result.total) || result.total <= 0 || !Array.isArray(result.position_opportunity)) return [];
  const rows = result.position_opportunity.map((row) => ({
    ...row,
    position: typeof row.position === "string" ? row.position.trim().toUpperCase() : "",
  }));
  const valid = rows.length > 0
    && new Set(rows.map((row) => row.position)).size === rows.length
    && rows.every((row) => {
      const counts = [row.total, row.committed_total, row.uncommitted_total, row.ranked_total, row.top100_total, row.uncommitted_ranked_total, row.uncommitted_top100_total];
      return Boolean(row.position)
        && counts.every(nonNegativeInteger)
        && row.committed_total + row.uncommitted_total === row.total
        && row.ranked_total <= row.total
        && row.top100_total <= row.ranked_total
        && row.uncommitted_ranked_total <= row.uncommitted_total
        && row.uncommitted_top100_total <= row.uncommitted_ranked_total
        && row.uncommitted_top100_total <= row.top100_total
        && (row.uncommitted_ranked_total === 0
          ? row.best_uncommitted_rank == null
          : Number.isSafeInteger(row.best_uncommitted_rank) && Number(row.best_uncommitted_rank) > 0)
        && (row.average_uncommitted_grade == null || (Number.isFinite(row.average_uncommitted_grade) && row.average_uncommitted_grade > 0));
    })
    && rows.reduce((sum, row) => sum + row.total, 0) === result.total;
  if (!valid) return [];
  return rows.sort((left, right) =>
    right.uncommitted_top100_total - left.uncommitted_top100_total
    || (left.best_uncommitted_rank ?? Number.MAX_SAFE_INTEGER) - (right.best_uncommitted_rank ?? Number.MAX_SAFE_INTEGER)
    || right.uncommitted_ranked_total - left.uncommitted_ranked_total
    || left.position.localeCompare(right.position));
}

/**
 * Keep the cross-class destination comparison tied to validated aggregates.
 * The API returns only the top twelve destinations for each exact release;
 * this helper takes a bounded prefix and drops impossible count relationships
 * instead of presenting a partial or malformed destination as fact.
 */
export function classDestinationRows(
  snapshots: ClassSnapshot[],
  limit = 5,
): RecruitingClassDestinationRow[] {
  if (!Number.isSafeInteger(limit) || limit < 1) return [];
  return snapshots.flatMap((snapshot) => {
    const committedTotal = typeof snapshot.cohort?.committed === "number"
      && Number.isSafeInteger(snapshot.cohort.committed)
      && snapshot.cohort.committed >= 0
      ? snapshot.cohort.committed
      : null;
    const destinations = (snapshot.commitment_destinations || [])
      .filter((destination) => {
        const total = destination.total;
        const ranked = destination.ranked_total;
        const top100 = destination.top100_total;
        return destination.team.trim().length > 0
          && Number.isSafeInteger(total) && total > 0
          && Number.isSafeInteger(ranked) && ranked >= 0 && ranked <= total
          && Number.isSafeInteger(top100) && top100 >= 0 && top100 <= ranked
          && (committedTotal == null || total <= committedTotal);
      })
      .sort((a, b) => b.source_rank_points - a.source_rank_points
        || b.top100_total - a.top100_total
        || b.ranked_total - a.ranked_total
        || b.total - a.total
        || a.team.localeCompare(b.team))
      .slice(0, limit);
    return destinations.map((destination) => ({
      ...destination,
      season: snapshot.season,
      committedTotal,
      positionLabels: (destination.position_breakdown || [])
        .filter((position) => Number.isSafeInteger(position.total) && position.total > 0 && position.position.trim())
        .sort((a, b) => b.total - a.total || a.position.localeCompare(b.position))
        .slice(0, 3)
        .map((position) => `${position.position} ${position.total}`),
    }));
  });
}

/**
 * Summarize exact program IDs that recur in the bounded destination rows of
 * verified class releases. The source response retains only its top
 * destinations, so this is a recurrence view of observed top rows, never a
 * claim that an omitted program had no commitments. Names stay attached to
 * their source rows; they are not used to join programs across releases.
 */
export function classDestinationRecurrence(
  snapshots: ClassSnapshot[],
  limit = 12,
): RecruitingDestinationRecurrence[] {
  if (!Number.isSafeInteger(limit) || limit < 1) return [];
  const verified = snapshots.filter((snapshot) => Boolean(classSnapshotReceipt(snapshot)));
  const seasons = new Set(verified.map((snapshot) => snapshot.season));
  if (verified.length === 0 || seasons.size !== verified.length) return [];
  const eligibleClasses = verified.length;
  const byTeam = new Map<string, {
    team: string;
    names: Set<string>;
    seasons: Set<string>;
    commitments: number;
    ranked: number;
    top100: number;
    sourceRankPoints: number;
  }>();
  classDestinationRows(verified, limit).forEach((row) => {
    const teamId = row.team_id?.trim();
    const team = row.team.trim();
    if (!teamId || !team
      || !Number.isSafeInteger(row.total) || row.total < 1
      || !Number.isSafeInteger(row.ranked_total) || row.ranked_total < 0 || row.ranked_total > row.total
      || !Number.isSafeInteger(row.top100_total) || row.top100_total < 0 || row.top100_total > row.ranked_total
      || !Number.isFinite(row.source_rank_points) || row.source_rank_points < 0) return;
    const current = byTeam.get(teamId) || {
      team,
      names: new Set<string>(),
      seasons: new Set<string>(),
      commitments: 0,
      ranked: 0,
      top100: 0,
      sourceRankPoints: 0,
    };
    current.names.add(team);
    current.seasons.add(row.season);
    current.commitments += row.total;
    current.ranked += row.ranked_total;
    current.top100 += row.top100_total;
    current.sourceRankPoints += row.source_rank_points;
    byTeam.set(teamId, current);
  });
  return Array.from(byTeam.entries())
    .map(([teamId, value]) => ({
      teamId,
      team: value.team,
      recordedNames: Array.from(value.names).sort((a, b) => a.localeCompare(b)),
      seasons: Array.from(value.seasons).sort((a, b) => a.localeCompare(b)),
      classCount: value.seasons.size,
      eligibleClasses,
      commitments: value.commitments,
      ranked: value.ranked,
      top100: value.top100,
      sourceRankPoints: value.sourceRankPoints,
    }))
    .sort((a, b) => b.classCount - a.classCount
      || b.top100 - a.top100
      || b.ranked - a.ranked
      || b.commitments - a.commitments
      || a.teamId.localeCompare(b.teamId));
}

/**
 * Report how much of each bounded destination response can be joined to an
 * exact source team ID. Name-only rows stay visible in the denominator but
 * are excluded from exact-ID joins; this is an evidence coverage metric, not
 * a claim about destinations omitted from the source response.
 */
export function classDestinationIdentityCoverage(
  snapshots: ClassSnapshot[],
): RecruitingDestinationIdentityCoverage[] {
  return snapshots.flatMap((snapshot) => {
    if (!classSnapshotReceipt(snapshot) || !Array.isArray(snapshot.commitment_destinations)) return [];
    const destinations = snapshot.commitment_destinations;
    const exactIds = new Set<string>();
    let retainedCommitments = 0;
    let exactIdCommitments = 0;
    let exactIdDestinations = 0;
    for (const destination of destinations) {
      const team = typeof destination.team === "string" ? destination.team.trim() : "";
      const total = destination.total;
      const ranked = destination.ranked_total;
      const top100 = destination.top100_total;
      if (!team
        || !Number.isSafeInteger(total) || total <= 0
        || !Number.isSafeInteger(ranked) || ranked < 0 || ranked > total
        || !Number.isSafeInteger(top100) || top100 < 0 || top100 > ranked
        || !Number.isFinite(destination.source_rank_points) || destination.source_rank_points < 0) return [];
      const teamId = destination.team_id?.trim() || null;
      if (teamId && exactIds.has(teamId)) return [];
      if (teamId) exactIds.add(teamId);
      retainedCommitments += total;
      if (teamId) {
        exactIdDestinations += 1;
        exactIdCommitments += total;
      }
    }
    const committed = snapshot.cohort?.committed;
    if (committed != null && (!Number.isSafeInteger(committed) || committed < 0 || retainedCommitments > committed)) return [];
    return [{
      season: snapshot.season,
      retainedDestinations: destinations.length,
      exactIdDestinations,
      nameOnlyDestinations: destinations.length - exactIdDestinations,
      retainedCommitments,
      exactIdCommitments,
      exactIdCommitmentShare: retainedCommitments > 0 ? exactIdCommitments / retainedCommitments : null,
    }];
  });
}

/**
 * Keep the cross-class table tied to the same denominator as each board
 * response. Missing coverage stays unavailable instead of being treated as
 * zero, so the comparison remains useful when a class release is partial.
 */
export function classSnapshotCoverage(snapshot: ClassSnapshot) {
  const total = Number.isSafeInteger(snapshot.total) && snapshot.total > 0 ? snapshot.total : null;
  const share = (value: number | undefined) => total != null && typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= total
    ? value / total
    : null;
  return {
    total,
    ranked: share(snapshot.cohort?.ranked),
    graded: share(snapshot.cohort?.graded),
    committed: share(snapshot.cohort?.committed),
  };
}

/**
 * Track the national recorded commitment pipeline only across complete class
 * releases. A missing destination remains a missing field, and the prior
 * class delta is retained as context rather than a projection of unsigned
 * players or future roster movement.
 */
export function classCommitmentTrend(snapshots: ClassSnapshot[]): RecruitingClassCommitmentTrend[] {
  const verified = snapshots.flatMap((snapshot) => {
    const receipt = classSnapshotReceipt(snapshot);
    const total = snapshot.total;
    const committed = snapshot.cohort?.committed;
    const ranked = snapshot.cohort?.ranked;
    if (
      !receipt
      || !Number.isSafeInteger(total) || total <= 0
      || typeof committed !== "number" || !Number.isSafeInteger(committed) || committed < 0 || committed > total
      || typeof ranked !== "number" || !Number.isSafeInteger(ranked) || ranked < 0 || ranked > total
      || !/^\d{4}$/.test(snapshot.season)
    ) return [];
    return [{
      season: snapshot.season,
      total,
      recordedCommitments: committed,
      noRecordedDestination: total - committed,
      recordedCommitmentShare: committed / total,
      ranked,
      rankedShare: ranked / total,
      receipt,
    }];
  }).sort((a, b) => Number(a.season) - Number(b.season));

  const seasons = new Set(verified.map((row) => row.season));
  if (seasons.size !== verified.length) return [];
  return verified.map((row, index) => {
    const prior = verified[index - 1];
    return {
      ...row,
      priorSeason: prior?.season || null,
      commitmentDelta: prior ? row.recordedCommitments - prior.recordedCommitments : null,
      commitmentShareDelta: prior ? row.recordedCommitmentShare - prior.recordedCommitmentShare : null,
    };
  });
}

/**
 * Make the bounded destination response visible across class releases. The
 * response is useful only when its row count, coverage metadata, commitment
 * totals and release receipt agree; omitted destinations remain unknown.
 */
export function classDestinationCoverageRows(snapshots: ClassSnapshot[]): RecruitingClassDestinationCoverage[] {
  return snapshots.flatMap((snapshot) => {
    const receipt = classSnapshotReceipt(snapshot);
    const coverage = snapshot.destination_coverage;
    const committed = snapshot.cohort?.committed;
    const destinations = snapshot.commitment_destinations;
    if (
      !receipt
      || !coverage
      || !Array.isArray(destinations)
      || typeof committed !== "number"
      || !Number.isSafeInteger(committed)
      || committed < 0
      || !Number.isSafeInteger(coverage.returned)
      || coverage.returned < 0
      || coverage.returned !== destinations.length
      || !Number.isSafeInteger(coverage.total)
      || coverage.total < coverage.returned
      || !Number.isSafeInteger(coverage.limit)
      || coverage.limit < 1
      || typeof coverage.complete !== "boolean"
      || coverage.complete !== (coverage.returned === coverage.total)
    ) return [];
    const identity = classDestinationIdentityCoverage([snapshot])[0];
    if (!identity || identity.retainedCommitments > committed || (coverage.complete && identity.retainedCommitments !== committed)) return [];
    return [{
      season: snapshot.season,
      returned: coverage.returned,
      total: coverage.total,
      limit: coverage.limit,
      complete: coverage.complete,
      retainedCommitments: identity.retainedCommitments,
      recordedCommitments: committed,
      retainedCommitmentShare: committed > 0 ? identity.retainedCommitments / committed : null,
      receipt,
    }];
  });
}

/**
 * Summarize the recorded rank bins only when the complete class release and
 * its aggregate denominator reconcile. This is a source concentration view,
 * not a Silvermine talent score, and it never treats an unavailable rank as
 * a low rank.
 */
export function classRankConcentration(snapshots: ClassSnapshot[]): RecruitingClassRankConcentration[] {
  return snapshots.flatMap((snapshot) => {
    const receipt = classSnapshotReceipt(snapshot);
    const distribution = validRecruitingRankDistribution({
      season: Number(snapshot.season),
      page: 0,
      page_size: 0,
      total: snapshot.total,
      edition: snapshot.edition,
      captured_at: snapshot.captured_at,
      rows: [],
      rank_distribution: snapshot.rank_distribution,
    });
    const cohortRanked = snapshot.cohort?.ranked;
    if (!receipt || !distribution || !Number.isSafeInteger(cohortRanked)) return [];
    const byKey = new Map(distribution.map((band) => [band.key, band.total]));
    const unranked = byKey.get("unranked") || 0;
    const ranked = snapshot.total - unranked;
    if (cohortRanked !== ranked) return [];
    const top25 = (byKey.get("top_10") || 0) + (byKey.get("ranks_11_25") || 0);
    const top100 = top25 + (byKey.get("ranks_26_50") || 0) + (byKey.get("ranks_51_100") || 0);
    return [{
      season: snapshot.season,
      total: snapshot.total,
      ranked,
      top25,
      top100,
      unranked,
      rankedShare: ranked / snapshot.total,
      top25Share: top25 / snapshot.total,
      top100Share: top100 / snapshot.total,
    }];
  });
}

export function recruitingBoardRequestSearch(filters: {
  season: string;
  page: number;
  committed: string;
  movement: string;
  query: string;
  position: string;
  rankMax: string;
  sort?: RecruitingSort;
  destinationLimit?: string;
}) {
  const params = new URLSearchParams({
    season: filters.season,
    page: String(filters.page),
    committed: filters.committed,
    movement: filters.movement,
  });
  if (filters.query.trim()) params.set("q", filters.query.trim());
  if (filters.position) params.set("position", filters.position);
  if (filters.rankMax) params.set("rank_max", filters.rankMax);
  if (filters.sort && filters.sort !== "rank") params.set("sort", filters.sort);
  if (filters.destinationLimit && filters.destinationLimit !== "12") params.set("destination_limit", filters.destinationLimit);
  return params.toString();
}

/** Never show or export a response under a different class or filter set. */
export function currentRecruitingBoardResult(load: RecruitingBoardLoad | null, request: string) {
  return load?.request === request ? load.result : null;
}

export function validateRecruitingExportPage(
  payload: RecruitingBoardResult,
  expectedSeason: number,
  expectedTotal: number,
  expectedPageSize: number,
  expectedEdition: string | null | undefined,
  page: number,
  totalPages: number,
) {
  const pageSeason = Number(payload.season);
  const pageTotal = Number(payload.total);
  const pageSize = Number(payload.page_size);
  if (
    pageSeason !== expectedSeason
    || Number(payload.page) !== page
    || !Number.isInteger(pageTotal)
    || pageTotal !== expectedTotal
    || !Number.isInteger(pageSize)
    || pageSize !== expectedPageSize
    || (payload.edition ?? null) !== (expectedEdition ?? null)
    || !Array.isArray(payload.rows)
    || payload.rows.length > pageSize
  ) {
    throw new Error("The recruiting edition changed during export.");
  }
  if (page < totalPages - 1 && payload.rows.length === 0) {
    throw new Error("The recruiting edition returned an incomplete page.");
  }
  return payload.rows;
}

const number = (value: number | null, digits = 0) => value == null ? "—" : value.toFixed(digits);
const grade = (value: number | null) => value == null || value <= 0 ? "—" : number(value);
const size = (height: number | null, weight: number | null) => {
  const heightLabel = height == null || height <= 0
    ? null
    : `${Math.floor(height / 12)}'${Math.round(height % 12)}"`;
  const weightLabel = weight == null || weight <= 0 ? null : `${Math.round(weight)} lb`;
  return [heightLabel, weightLabel].filter(Boolean).join(" · ") || "—";
};
const rate = (part: number, total: number) => total > 0 ? `${((part / total) * 100).toFixed(0)}%` : "—";
export type RecruitingCoverageGap = { present: number; total: number; missing: number; share: number };

/** Keep field coverage tied to a valid source denominator; never coerce bad counts into coverage. */
export function recruitingCoverageGap(part: number | undefined, total: number | undefined): RecruitingCoverageGap | null {
  if (typeof part !== "number" || typeof total !== "number" || !Number.isSafeInteger(part) || !Number.isSafeInteger(total) || total <= 0 || part < 0 || part > total) return null;
  return { present: part, total, missing: total - part, share: part / total };
}

export const coverageRate = (part: number | undefined, total: number | undefined) => {
  const coverage = recruitingCoverageGap(part, total);
  return coverage ? `${Math.round(coverage.share * 100)}% · ${coverage.missing.toLocaleString()} missing` : "Unavailable";
};
const captureLabel = (value: string | null) => value
  ? new Date(value).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })
  : "capture date unavailable";

/** Filter only after the exact-ID production release is live. An unavailable
 * release cannot prove that a prospect lacks production, so it returns no
 * evidence-filtered rows rather than turning an outage into a claim. */
export function filterRecruitingProductionRows(
  rows: Prospect[],
  productionIndex: RecruitingProductionIndex | null,
  productionStatus: "checking" | "live" | "unavailable",
  filter: RecruitingProductionFilter,
) {
  if (filter === "all") return rows;
  if (productionStatus !== "live" || !productionIndex) return [];
  return rows.filter((row) => (exactRecruitingProduction(productionIndex, row.athlete_id) != null) === (filter === "linked"));
}

export type RecruitingShortlistProductionEvidence = {
  state: "checking" | "linked" | "unavailable" | "different_class" | "missing";
  production: RecruitingProductionRow | null;
};

/** Keep saved prospects comparable while labeling the release state and exact-ID join. */
export function shortlistProductionEvidence(
  athleteId: string,
  shortlistSeason: number,
  productionIndex: RecruitingProductionIndex | null,
  productionStatus: "checking" | "live" | "unavailable",
): RecruitingShortlistProductionEvidence {
  if (productionStatus === "checking") return { state: "checking", production: null };
  if (productionStatus === "unavailable" || !productionIndex) return { state: "unavailable", production: null };
  if (productionIndex.season !== shortlistSeason) return { state: "different_class", production: null };
  const production = exactRecruitingProduction(productionIndex, athleteId);
  return production ? { state: "linked", production } : { state: "missing", production: null };
}

export const recruitingExportHeaders = ["season", "rank", "previous_rank", "rank_change", "previous_captured_at", "name", "position", "grade", "position_rank", "state_rank", "region_rank", "height_inches", "weight_pounds", "committed_team", "committed_team_id", "recorded_school_count", "recorded_schools", "recorded_school_ids", "status", "high_school", "hometown", "athlete_id", "source_edition", "source_captured_at"];

export function recruitingExportCsv(
  rows: Prospect[],
  options: { season: string | number; edition: string | null | undefined; capturedAt: string | null | undefined; programs: ProspectProgram[] },
) {
  const season = Number(options.season);
  if (!Number.isInteger(season) || season < 1900 || season > 2200) {
    throw new Error("The recruiting export returned an invalid class season.");
  }
  const identities = new Set<string>();
  const values = rows.map((row) => {
    if (!/^\d{1,15}$/.test(row.athlete_id) || identities.has(row.athlete_id)) {
      throw new Error("The recruiting edition returned duplicate or invalid prospect IDs.");
    }
    identities.add(row.athlete_id);
    const schools = prospectSchools(row.school_ids, options.programs, row.committed_team_id);
    return [season, row.rank, row.previous_rank, row.rank == null || row.previous_rank == null ? null : row.previous_rank - row.rank, row.previous_captured_at, row.name, row.position, row.grade, row.position_rank, row.state_rank, row.region_rank, row.height_inches, row.weight_pounds, row.committed_team_name, row.committed_team_id, schools.length, schools.map((school) => school.name).join("; "), schools.map((school) => school.id).join("; "), row.status, row.high_school, row.hometown, row.athlete_id, options.edition || null, options.capturedAt || null];
  });
  return toCsv(recruitingExportHeaders, values);
}

const fitHref = (teamId: string | null | undefined) => teamId
  ? `/basketball/recruiting/fit/?team=${encodeURIComponent(teamId)}`
  : null;

export default function RecruitingBoard({ programs }: { programs: ProspectProgram[] }) {
  const [season, setSeason] = useState("2027");
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState("");
  const [rankMax, setRankMax] = useState("");
  const [committed, setCommitted] = useState("all");
  const [movement, setMovement] = useState("all");
  const [sort, setSort] = useState<RecruitingSort>("rank");
  const [productionFilter, setProductionFilter] = useState<RecruitingProductionFilter>("all");
  const [destinationLimit, setDestinationLimit] = useState("12");
  const [page, setPage] = useState(0);
  const [loadedResult, setLoadedResult] = useState<RecruitingBoardLoad | null>(null);
  const [loadError, setLoadError] = useState<{ request: string; message: string } | null>(null);
  const [copied, setCopied] = useState("");
  const [classSnapshots, setClassSnapshots] = useState<ClassSnapshot[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState("");
  const [shortlist, setShortlist] = useState<RecruitingShortlistEntry[]>([]);
  const [shortlistHydrated, setShortlistHydrated] = useState(false);
  const [productionIndex, setProductionIndex] = useState<RecruitingProductionIndex | null>(null);
  const [productionStatus, setProductionStatus] = useState<"checking" | "live" | "unavailable">("checking");
  const boardRequest = recruitingBoardRequestSearch({ season, page, committed, movement, query, position, rankMax, sort, destinationLimit });
  const result = currentRecruitingBoardResult(loadedResult, boardRequest);
  const schoolPrograms = recordedSchoolPrograms(result?.recorded_school_programs, result?.edition, programs);
  const evidenceGuide = result ? recruitingEvidenceGuide(result, schoolPrograms) : [];
  const rankDistribution = result ? validRecruitingRankDistribution(result) : null;
  const positionOpportunity = result ? recruitingPositionOpportunityRows(result) : [];
  const error = loadError?.request === boardRequest ? loadError.message : "";
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requested = params.get("q");
    const requestedSeason = params.get("season");
    if (["2025", "2026", "2027", "2028", "2029", "2030"].includes(requestedSeason || "")) setSeason(requestedSeason!);
    if (requested) setQuery(requested);
    const requestedPosition = params.get("position");
    const normalizedPosition = requestedPosition?.toUpperCase();
    if (normalizedPosition && ["PG", "SG", "SF", "PF", "C"].includes(normalizedPosition)) setPosition(normalizedPosition);
    const requestedRank = params.get("rank");
    if (requestedRank && ["25", "50", "100", "250"].includes(requestedRank)) setRankMax(requestedRank);
    const requestedCommitted = params.get("committed");
    if (requestedCommitted === "yes" || requestedCommitted === "no") setCommitted(requestedCommitted);
    const requestedMovement = params.get("movement");
    if (requestedMovement && ["up", "down", "unchanged", "new", "unavailable"].includes(requestedMovement)) setMovement(requestedMovement);
    const requestedSort = params.get("sort");
    if (requestedSort === "grade") setSort(requestedSort);
    const requestedProduction = params.get("production");
    if (requestedProduction === "linked" || requestedProduction === "unavailable") setProductionFilter(requestedProduction);
    const requestedDestinationLimit = params.get("destination_limit");
    if (requestedDestinationLimit && ["12", "50", "200"].includes(requestedDestinationLimit)) setDestinationLimit(requestedDestinationLimit);
    const requestedPage = Number(params.get("page"));
    if (Number.isInteger(requestedPage) && requestedPage >= 0) setPage(Math.min(requestedPage, 1000));
    setHydrated(true);
  }, []);
  useEffect(() => {
    setShortlist(readRecruitingShortlist(window.localStorage.getItem(RECRUITING_SHORTLIST_STORAGE_KEY)));
    setShortlistHydrated(true);
  }, []);
  useEffect(() => {
    if (!shortlistHydrated) return;
    try {
      window.localStorage.setItem(RECRUITING_SHORTLIST_STORAGE_KEY, JSON.stringify(shortlist));
    } catch {
      // A private browsing context may reject local storage; the in-memory board remains usable.
    }
  }, [shortlist, shortlistHydrated]);
  useEffect(() => {
    if (!hydrated) return;
    const params = new URLSearchParams();
    if (season !== "2027") params.set("season", season);
    if (query.trim()) params.set("q", query.trim());
    if (position) params.set("position", position);
    if (rankMax) params.set("rank", rankMax);
    if (committed !== "all") params.set("committed", committed);
    if (movement !== "all") params.set("movement", movement);
    if (sort !== "rank") params.set("sort", sort);
    if (productionFilter !== "all") params.set("production", productionFilter);
    if (destinationLimit !== "12") params.set("destination_limit", destinationLimit);
    if (page > 0) params.set("page", String(page));
    const search = params.toString();
    window.history.replaceState(window.history.state, "", search ? `${window.location.pathname}?${search}` : window.location.pathname);
    setCopied("");
  }, [committed, destinationLimit, hydrated, movement, page, position, productionFilter, query, rankMax, season, sort]);
  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied("Recruiting board link copied.");
    } catch {
      setCopied("Copy the filtered URL from your address bar.");
    }
  };
  const exportHeaders = recruitingExportHeaders;
  const shortlistExportHeaders = exportHeaders;
  const exportRow = (row: Prospect) => {
    const schools = prospectSchools(row.school_ids, programs, row.committed_team_id);
    return [season, row.rank, row.previous_rank, row.rank == null || row.previous_rank == null ? null : row.previous_rank - row.rank, row.previous_captured_at, row.name, row.position, row.grade, row.position_rank, row.state_rank, row.region_rank, row.height_inches, row.weight_pounds, row.committed_team_name, row.committed_team_id, schools.length, schools.map((school) => school.name).join("; "), schools.map((school) => school.id).join("; "), row.status, row.high_school, row.hometown, row.athlete_id, result?.edition || null, result?.captured_at || null];
  };
  const downloadPage = () => {
    if (!result) return;
    const csv = recruitingExportCsv(result.rows, { season, edition: result.edition, capturedAt: result.captured_at, programs });
    downloadCsv(`prospect-board-${season}-page-${page + 1}.csv`, csv);
    setExportMessage(`Downloaded ${result.rows.length.toLocaleString()} prospects from this page.`);
  };
  const downloadAll = async () => {
    if (!result || exporting) return;
    setExporting(true);
    setExportMessage(`Preparing 0 of ${result.total.toLocaleString()} prospects…`);
    try {
      const all: Prospect[] = [];
      const totalRows = Number(result.total);
      const pageSize = Number(result.page_size);
      if (!Number.isInteger(totalRows) || totalRows < 0 || !Number.isInteger(pageSize) || pageSize < 1) {
        throw new Error("The recruiting board returned invalid pagination metadata.");
      }
      const pages = Math.max(1, Math.ceil(totalRows / pageSize));
      if (pages > 1001) throw new Error("This filtered cohort is larger than the bounded export window. Narrow the filters first.");
      const cohort = `recruiting-export-${Date.now()}`;
      for (let requestedPage = 0; requestedPage < pages; requestedPage += 1) {
        const params = new URLSearchParams({ season, page: String(requestedPage), committed, movement });
        params.set("cohort", cohort);
        if (query.trim()) params.set("q", query.trim());
        if (position) params.set("position", position);
        if (rankMax) params.set("rank_max", rankMax);
        if (sort !== "rank") params.set("sort", sort);
        const response = await fetchWithTransientRetry(`/api/basketball/research/recruiting-rankings?${params.toString()}`);
        if (!response.ok) throw new Error("The complete recruiting export could not be loaded.");
        const payload = await response.json() as RecruitingBoardResult;
        all.push(...validateRecruitingExportPage(payload, Number(season), totalRows, pageSize, result.edition, requestedPage, pages));
        setExportMessage(`Preparing ${all.length.toLocaleString()} of ${totalRows.toLocaleString()} prospects…`);
      }
      if (all.length !== totalRows) throw new Error("The recruiting edition returned an incomplete export.");
      const csv = recruitingExportCsv(all, { season, edition: result.edition, capturedAt: result.captured_at, programs });
      downloadCsv(`prospect-board-${season}-all.csv`, csv);
      setExportMessage(`Downloaded ${all.length.toLocaleString()} filtered prospects.`);
    } catch (reason) {
      setExportMessage(reason instanceof Error ? reason.message : "The complete recruiting export could not be loaded.");
    } finally {
      setExporting(false);
    }
  };
  const shortlistEntry = (row: Prospect): RecruitingShortlistEntry => ({
    key: recruitingShortlistKey(season, row.athlete_id),
    season,
    athlete_id: row.athlete_id,
    name: row.name,
    position: row.position,
    rank: row.rank,
    previous_rank: row.previous_rank ?? null,
    previous_captured_at: row.previous_captured_at ?? null,
    grade: row.grade,
    committed_team_id: row.committed_team_id,
    committed_team_name: row.committed_team_name,
    high_school: row.high_school,
    source_url: row.source_url,
    edition: result?.edition || null,
    captured_at: result?.captured_at || null,
  });
  const toggleShortlist = (row: Prospect) => setShortlist((current) => toggleRecruitingShortlist(current, shortlistEntry(row)));
  const removeShortlist = (key: string) => setShortlist((current) => current.filter((entry) => entry.key !== key));
  const downloadShortlist = () => {
    if (!shortlist.length) return;
    const rows = shortlist.map((row) => [row.season, row.rank, row.previous_rank ?? null, row.rank == null || row.previous_rank == null ? null : row.previous_rank - row.rank, row.previous_captured_at ?? null, row.name, row.position, row.grade, null, null, null, null, null, row.committed_team_name, row.committed_team_id, null, null, null, null, row.high_school, null, row.athlete_id, row.edition, row.captured_at]);
    downloadCsv("prospect-board-shortlist.csv", toCsv(shortlistExportHeaders, rows));
    setExportMessage(`Downloaded ${shortlist.length.toLocaleString()} shortlisted prospects.`);
  };
  useEffect(() => {
    const controller = new AbortController();
    fetchJson<Result>(`/api/basketball/research/recruiting-rankings?${boardRequest}`, { signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted) {
          setLoadedResult({ request: boardRequest, result: value });
          setLoadError(null);
        }
      })
      .catch((reason: unknown) => {
        if ((reason as { name?: string })?.name !== "AbortError" && !controller.signal.aborted) {
          setLoadError({
            request: boardRequest,
            message: reason instanceof Error ? reason.message : "The prospect release is unavailable.",
          });
        }
      });
    return () => controller.abort();
  }, [boardRequest]);
  useEffect(() => {
    const controller = new AbortController();
    setProductionIndex(null);
    setProductionStatus("checking");
    fetch(`/api/basketball/research/recruiting?season=${season}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("The reviewed production release is unavailable.");
        return response.json() as Promise<unknown>;
      })
      .then((payload) => {
        if (controller.signal.aborted) return;
        const release = parseRecruitingRelease(payload, Number(season));
        const index = release ? buildRecruitingProductionIndex(release) : null;
        if (!index) throw new Error("The reviewed production release failed exact-ID integrity checks.");
        setProductionIndex(index);
        setProductionStatus("live");
      })
      .catch((reason: unknown) => {
        if ((reason as { name?: string })?.name !== "AbortError" && !controller.signal.aborted) {
          setProductionStatus("unavailable");
        }
      });
    return () => controller.abort();
  }, [season]);
  useEffect(() => {
    const controller = new AbortController();
    Promise.allSettled(["2025", "2026", "2027", "2028", "2029", "2030"].map(async (classYear) => {
      const value = await fetchJson<Result>(`/api/basketball/research/recruiting-rankings?season=${classYear}&page=0&committed=all&destination_limit=200`, { signal: controller.signal });
      if (value.unavailable_reason) throw new Error(value.unavailable_reason);
      return { season: classYear, total: value.total, cohort: value.cohort, captured_at: value.captured_at, position_breakdown: value.position_breakdown, commitment_destinations: value.commitment_destinations, destination_coverage: value.destination_coverage, edition: value.edition, source_receipt: value.source_receipt, rank_movement: value.rank_movement, rank_distribution: value.rank_distribution } satisfies ClassSnapshot;
    })).then((settled) => {
      if (controller.signal.aborted) return;
      setClassSnapshots(settled.flatMap((item) => item.status === "fulfilled" ? [item.value] : []).sort((a, b) => a.season.localeCompare(b.season)));
    });
    return () => controller.abort();
  }, []);
  const totalPages = result ? Math.max(1, Math.ceil(result.total / result.page_size)) : 1;
  const visibleRows = result ? filterRecruitingProductionRows(result.rows, productionIndex, productionStatus, productionFilter) : [];
  const pageProductionRows = visibleRows.flatMap((row) => {
    const production = exactRecruitingProduction(productionIndex, row.athlete_id);
    return production ? [{ prospect: row, production }] : [];
  }) || [];
  const pageProductionCoverage = productionStatus === "live" && productionIndex && result
    ? recruitingProductionCoverage(visibleRows, productionIndex)
    : null;
  const movementEvidence = result?.rank_movement
    ? result.rank_movement.moved_up + result.rank_movement.moved_down + result.rank_movement.unchanged + result.rank_movement.rank_unavailable
    : 0;
  const shortlistRanked = shortlist.filter((entry) => entry.rank != null);
  const shortlistAverageRank = shortlistRanked.length
    ? shortlistRanked.reduce((sum, entry) => sum + (entry.rank || 0), 0) / shortlistRanked.length
    : null;
  const shortlistBestRankBySeason = new Map<string, number>();
  shortlistRanked.forEach((entry) => {
    const rank = entry.rank as number;
    const best = shortlistBestRankBySeason.get(entry.season);
    if (best == null || rank < best) shortlistBestRankBySeason.set(entry.season, rank);
  });
  const shortlistGraded = shortlist.filter((entry) => entry.grade != null);
  const shortlistBestGradeBySeason = new Map<string, number>();
  shortlistGraded.forEach((entry) => {
    const grade = entry.grade as number;
    const best = shortlistBestGradeBySeason.get(entry.season);
    if (best == null || grade > best) shortlistBestGradeBySeason.set(entry.season, grade);
  });
  const shortlistCommitted = shortlist.filter((entry) => Boolean(entry.committed_team_name)).length;
  const shortlistPositions = Array.from(new Set(shortlist.map((entry) => entry.position).filter(Boolean))).join(" · ");
  const destinationRows = classDestinationRows(classSnapshots, 5);
  const destinationRecurrenceRows = classDestinationRecurrence(classSnapshots, 12);
  const destinationIdentityRows = classDestinationIdentityCoverage(classSnapshots);
  const positionMixRows = classPositionMix(classSnapshots);
  const movementRows = classMovementRows(classSnapshots);
  const rankConcentrationRows = classRankConcentration(classSnapshots);
  const commitmentTrendRows = classCommitmentTrend(classSnapshots);
  const destinationCoverageRows = classDestinationCoverageRows(classSnapshots);
  const positionColumns = Array.from(new Set(positionMixRows.flatMap((row) => row.positions.map((position) => position.position)))).sort((a, b) => {
    const order = ["PG", "SG", "SF", "PF", "C", "G", "F", "W", "UNKNOWN"];
    return (order.indexOf(a) < 0 ? order.length : order.indexOf(a)) - (order.indexOf(b) < 0 ? order.length : order.indexOf(b)) || a.localeCompare(b);
  });
  return (
    <section className="section">
      <div className="section-heading">
        <div>
          <div className="eyebrow">National prospect board / recorded class</div>
          <h2>{season} recruiting rankings.</h2>
        </div>
        <p>Search the recorded class, inspect commitment status and open the prospect record. Ranking and grade are retained fields, not eligibility or a Silvermine scouting grade.</p>
      </div>
      <div className="toolbar">
        <label className="control"><span>CLASS</span><select value={season} onChange={(event) => { setSeason(event.target.value); setPage(0); }}><option value="2025">2025</option><option value="2026">2026</option><option value="2027">2027</option><option value="2028">2028</option><option value="2029">2029</option><option value="2030">2030</option></select></label>
        <label className="control"><span>SEARCH</span><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} placeholder="Prospect, school or hometown" /></label>
        <label className="control"><span>POSITION</span><select value={position} onChange={(event) => { setPosition(event.target.value); setPage(0); }}><option value="">All positions</option><option value="PG">PG</option><option value="SG">SG</option><option value="SF">SF</option><option value="PF">PF</option><option value="C">C</option></select></label>
        <label className="control"><span>RANK</span><select value={rankMax} onChange={(event) => { setRankMax(event.target.value); setPage(0); }}><option value="">All recorded ranks</option><option value="25">Top 25</option><option value="50">Top 50</option><option value="100">Top 100</option><option value="250">Top 250</option></select></label>
        <label className="control"><span>ORDER</span><select value={sort} onChange={(event) => { setSort(event.target.value as RecruitingSort); setPage(0); }}><option value="rank">Recorded rank</option><option value="grade">Recorded grade · high to low</option></select></label>
        <label className="control"><span>STATUS</span><select value={committed} onChange={(event) => { setCommitted(event.target.value); setPage(0); }}><option value="all">All statuses</option><option value="yes">Committed</option><option value="no">Undecided / other</option></select></label>
        <label className="control"><span>RANK MOVEMENT</span><select value={movement} onChange={(event) => { setMovement(event.target.value); setPage(0); }}><option value="all">All movement</option><option value="up">Moved up</option><option value="down">Moved down</option><option value="unchanged">Unchanged</option><option value="new">New to archive</option><option value="unavailable">Rank unavailable</option></select></label>
        <label className="control"><span>PRODUCTION EVIDENCE</span><select value={productionFilter} disabled={productionStatus !== "live"} onChange={(event) => { setProductionFilter(event.target.value as RecruitingProductionFilter); setPage(0); }}><option value="all">All rows</option><option value="linked">Exact-ID production linked</option><option value="unavailable">No exact-ID link</option></select></label>
        <label className="control"><span>DESTINATIONS</span><select value={destinationLimit} onChange={(event) => { setDestinationLimit(event.target.value); setPage(0); }}><option value="12">Top 12</option><option value="50">Top 50</option><option value="200">All (up to 200)</option></select></label>
        <button className="button secondary" type="button" onClick={downloadShortlist} disabled={!shortlist.length}>Download shortlist ({shortlist.length}) ↓</button>
        <button className="button secondary" type="button" onClick={share}>Copy board link</button>
      </div>
      {shortlist.length > 0 && <section className="paper-panel recruiting-shortlist-panel" aria-label="Saved recruiting prospects" style={{ marginTop: 20, marginBottom: 24 }}>
        <div className="section-heading" style={{ marginBottom: 12 }}>
          <div><div className="eyebrow">Local staff board / browser saved</div><h3>Your prospect shortlist.</h3></div>
          <span className="note">{shortlist.length} saved · available on this browser</span>
        </div>
        <p className="note">Shortlist entries preserve the class, exact athlete ID and record link. Prior production appears beside each saved prospect only when the reviewed release contains the same exact ID; missing joins stay labeled and are never treated as zero. They stay in this browser and do not merge identities across datasets.</p>
        <div className="strip" aria-label="Shortlist summary" style={{ marginBottom: 16 }}>
          <div><strong>{shortlist.length.toLocaleString()}</strong><span>Saved prospects</span></div>
          <div><strong>{shortlistRanked.length.toLocaleString()}</strong><span>With recorded rank</span></div>
          <div><strong>{shortlistAverageRank == null ? "—" : `#${shortlistAverageRank.toFixed(0)}`}</strong><span>Average rank</span></div>
          <div><strong>{shortlistCommitted.toLocaleString()}</strong><span>Recorded commitments</span></div>
        </div>
        {shortlistPositions && <p className="note" style={{ marginBottom: 12 }}>Position mix: {shortlistPositions}. Use the prospect dossiers to verify each entry after a later release.</p>}
        <div className="table-scroll"><table className="data-table"><thead><tr><th>Class</th><th>Prospect</th><th className="numeric">Rank</th><th className="numeric">Movement</th><th className="numeric">Rank gap</th><th className="numeric">Grade</th><th className="numeric">Grade gap</th><th>Commitment</th><th>Prior production</th><th>Capture / edition</th><th>Remove</th></tr></thead><tbody>{shortlist.map((row) => {
          const rankGap = row.rank != null && shortlistBestRankBySeason.has(row.season) ? row.rank - shortlistBestRankBySeason.get(row.season)! : null;
          const gradeGap = row.grade != null && shortlistBestGradeBySeason.has(row.season) ? row.grade - shortlistBestGradeBySeason.get(row.season)! : null;
          const destinationFit = fitHref(row.committed_team_id);
          const editionState = recruitingShortlistEditionState(row, { season, edition: result?.edition });
          const productionEvidence = shortlistProductionEvidence(row.athlete_id, Number(row.season), productionIndex, productionStatus);
          return <tr key={row.key}><td>{row.season}</td><th scope="row"><Link href={`/basketball/recruiting/prospect/?season=${row.season}&id=${row.athlete_id}`}>{row.name}</Link><small>{row.position || "Position unavailable"}{row.high_school ? ` · ${row.high_school}` : ""}</small></th><td className="numeric">{number(row.rank)}</td><td className="numeric">{recruitingShortlistRankChangeLabel(row)}<small>{row.previous_captured_at ? `prior ${captureLabel(row.previous_captured_at)}` : "Prior rank unavailable"}</small></td><td className="numeric">{rankGap == null ? "—" : rankGap === 0 ? "Best" : `+${rankGap}`}</td><td className="numeric">{grade(row.grade)}</td><td className="numeric">{gradeGap == null ? "—" : gradeGap === 0 ? "Best" : gradeGap.toFixed(1)}</td><td>{row.committed_team_name || "Not recorded"}{destinationFit && <small><Link href={destinationFit}>Open destination fit →</Link></small>}</td><td>{productionEvidence.state === "linked" && productionEvidence.production ? <><strong>{productionEvidence.production.ppg == null ? "PTS/G unavailable" : `${productionEvidence.production.ppg.toFixed(1)} PTS/G`}</strong><small>{productionEvidence.production.mpg.toFixed(1)} MIN/G · {productionEvidence.production.games.toLocaleString()} GP</small><small><Link href={`/basketball/recruiting/prospect/?season=${row.season}&id=${row.athlete_id}#production`}>Open exact-ID stats →</Link></small></> : productionEvidence.state === "checking" ? <span className="note">Checking reviewed stats…</span> : productionEvidence.state === "unavailable" ? <span className="note">Stats release unavailable</span> : productionEvidence.state === "different_class" ? <span className="note">Different class release<small>Open the matching class to compare</small></span> : <span className="note">No exact-ID link<small>Not a zero</small></span>}</td><td><small>{row.captured_at ? `${captureLabel(row.captured_at)} UTC` : "Capture date unavailable"}</small><small className={`shortlist-edition-state is-${editionState}`}>{recruitingShortlistEditionLabel(editionState)}</small><small className="source-hash">{row.edition || "Edition unavailable"}</small></td><td><button className="button secondary" type="button" onClick={() => removeShortlist(row.key)} aria-label={`Remove ${row.name} from shortlist`}>Remove</button></td></tr>;
        })}</tbody></table></div>
        <p className="note" style={{ marginTop: 12 }}>Rank and grade gaps are measured against the best observed row in the same recruiting class. These are comparison aids within the saved class rows, not Silvermine evaluations.</p>
        <p className="note" style={{ marginTop: 12 }}><button className="text-link" type="button" onClick={() => setShortlist([])}>Clear shortlist</button> · local browser storage only; use the CSV for a portable staff handoff.</p>
      </section>}
      {classSnapshots.length > 0 && <div className="recruiting-class-strip" aria-label="Recruiting class comparison">
        <div className="eyebrow">Class comparison / same release</div>
        <div className="recruiting-class-grid">
          {classSnapshots.map((snapshot) => <button
            className={`recruiting-class-card${snapshot.season === season ? " is-active" : ""}`}
            type="button"
            key={snapshot.season}
            aria-pressed={snapshot.season === season}
            onClick={() => { setSeason(snapshot.season); setPage(0); }}
          >
            <strong>{snapshot.season}</strong>
            <span>{snapshot.total.toLocaleString()} prospects · {(snapshot.cohort?.committed ?? 0).toLocaleString()} committed ({rate(snapshot.cohort?.committed ?? 0, snapshot.total)})</span>
            <small>{(snapshot.cohort?.ranked ?? 0).toLocaleString()} ranked · {(snapshot.cohort?.graded ?? 0).toLocaleString()} graded</small>
            <small>{(snapshot.position_breakdown || []).map((item) => `${item.position} ${item.total}`).join(" · ") || "Position unavailable"}</small>
            <small>{(snapshot.commitment_destinations || []).slice(0, 3).map((item) => `${item.team} ${item.total}`).join(" · ") || "No recorded destinations"}</small>
            <small>{classSnapshotReceipt(snapshot) ? "Verified release digest" : "Release digest unavailable"}</small>
            <small>{snapshot.captured_at ? `Captured ${captureLabel(snapshot.captured_at)} UTC` : "Capture date unavailable"}</small>
          </button>)}
        </div>
      </div>}
      {classSnapshots.length > 0 && <section className="paper-panel recruiting-class-table" aria-labelledby="recruiting-class-table-title" style={{ marginTop: 20, marginBottom: 24 }}>
        <div className="section-heading" style={{ marginBottom: 10 }}>
          <div><div className="eyebrow">Class audit / retained editions</div><h3 id="recruiting-class-table-title">Compare the recruiting pipeline before opening a name.</h3></div>
          <span className="note">{classSnapshots.length} retained classes</span>
        </div>
        <p className="note">Each row uses the complete unfiltered denominator returned for that class. Coverage percentages describe recorded fields in that edition; they do not turn rank, grade or commitment into a Silvermine evaluation.</p>
        <div className="table-scroll"><table className="data-table">
          <thead><tr><th>Class</th><th className="numeric">Prospects</th><th className="numeric">Rank coverage</th><th className="numeric">Grade coverage</th><th className="numeric">Commitment coverage</th><th>Top recorded destination</th><th>Edition receipt</th><th>Captured</th><th>Open</th></tr></thead>
          <tbody>{classSnapshots.map((snapshot) => {
            const coverage = classSnapshotCoverage(snapshot);
            const destination = snapshot.commitment_destinations?.[0];
            const receipt = classSnapshotReceipt(snapshot);
            const coverageCell = (count: number | undefined, share: number | null) => count == null || share == null ? "Unavailable" : <><strong>{count.toLocaleString()}</strong><small>{(share * 100).toFixed(0)}% of class</small></>;
            return <tr key={`class-table-${snapshot.season}`}>
              <th scope="row"><button className="text-link" type="button" onClick={() => { setSeason(snapshot.season); setPage(0); }}>{snapshot.season}</button></th>
              <td className="numeric">{coverage.total == null ? "Unavailable" : coverage.total.toLocaleString()}</td>
              <td className="numeric">{coverageCell(snapshot.cohort?.ranked, coverage.ranked)}</td>
              <td className="numeric">{coverageCell(snapshot.cohort?.graded, coverage.graded)}</td>
              <td className="numeric">{coverageCell(snapshot.cohort?.committed, coverage.committed)}</td>
              <td>{destination ? destination.team_id ? <Link href={`/basketball/programs/${encodeURIComponent(destination.team_id)}/`}>{destination.team}</Link> : destination.team : "Unavailable"}{destination && <small>{destination.total.toLocaleString()} recorded commitment{destination.total === 1 ? "" : "s"}{destination.best_rank == null ? "" : ` · best #${destination.best_rank}`}</small>}</td>
              <td><small>{receipt ? "Verified" : "Unavailable"}</small><small>{receipt ? `${receipt.sourceRows.toLocaleString()} source rows` : "Full release receipt unavailable"}</small>{receipt ? <small><code title={receipt.sha256}>{receipt.sha256.slice(0, 12)}…</code></small> : null}</td>
              <td><small>{snapshot.captured_at ? `${captureLabel(snapshot.captured_at)} UTC` : "Capture date unavailable"}</small></td>
              <td><Link href={`/basketball/recruiting/?season=${encodeURIComponent(snapshot.season)}`}>Open class →</Link></td>
            </tr>;
          })}</tbody>
        </table></div>
      </section>}
      {commitmentTrendRows.length > 0 && <section className="paper-panel recruiting-class-table" aria-labelledby="recruiting-commitment-trend-title" style={{ marginBottom: 24 }}>
        <div className="section-heading" style={{ marginBottom: 10 }}>
          <div><div className="eyebrow">Commitment pipeline / verified national class releases</div><h3 id="recruiting-commitment-trend-title">Track where the recorded class pipeline stands.</h3></div>
          <span className="note">{commitmentTrendRows.length} verified classes</span>
        </div>
        <p className="note">Every row reconciles to the full prospect denominator and a verified release digest. “No destination recorded” is a missing source field, not evidence that a prospect is unsigned or available. Deltas compare the prior retained class release.</p>
        <div className="table-scroll"><table className="data-table">
          <thead><tr><th>Class</th><th className="numeric">Prospects</th><th className="numeric">Recorded commitments</th><th className="numeric">No destination recorded</th><th className="numeric">Commitment rate</th><th className="numeric">Vs prior class</th><th>Evidence</th></tr></thead>
          <tbody>{commitmentTrendRows.map((row) => <tr key={`commitment-trend-${row.season}`}>
            <th scope="row"><button className="text-link" type="button" onClick={() => { setSeason(row.season); setPage(0); }}>{row.season}</button><small>{row.ranked.toLocaleString()} ranked · {(row.rankedShare * 100).toFixed(1)}%</small></th>
            <td className="numeric">{row.total.toLocaleString()}</td>
            <td className="numeric"><strong>{row.recordedCommitments.toLocaleString()}</strong></td>
            <td className="numeric">{row.noRecordedDestination.toLocaleString()}</td>
            <td className="numeric">{(row.recordedCommitmentShare * 100).toFixed(1)}%</td>
            <td className="numeric">{row.commitmentDelta == null ? "—" : <><strong>{row.commitmentDelta > 0 ? "+" : ""}{row.commitmentDelta.toLocaleString()}</strong><small>{row.commitmentShareDelta == null ? "" : `${row.commitmentShareDelta > 0 ? "+" : ""}${(row.commitmentShareDelta * 100).toFixed(1)} pts vs ${row.priorSeason}`}</small></>}</td>
            <td><small>Verified digest · {row.receipt.sourceRows.toLocaleString()} rows</small><small className="source-hash">{row.receipt.sha256.slice(0, 12)}…</small></td>
          </tr>)}</tbody>
        </table></div>
      </section>}
      {destinationCoverageRows.length > 0 && <section className="paper-panel recruiting-class-table" aria-labelledby="recruiting-destination-coverage-title" style={{ marginBottom: 24 }}>
        <div className="section-heading" style={{ marginBottom: 10 }}>
          <div><div className="eyebrow">Destination coverage / verified national class releases</div><h3 id="recruiting-destination-coverage-title">See how much of each class can be joined to destinations.</h3></div>
          <span className="note">{destinationCoverageRows.filter((row) => row.complete).length} complete · {destinationCoverageRows.length} verified</span>
        </div>
        <p className="note">The class snapshots request up to 200 destinations. “Partial” means the source returned fewer rows than its destination total; omitted programs are unknown and are never treated as zero. Retained commitment share is measured only against the recorded commitment denominator.</p>
        <div className="table-scroll"><table className="data-table">
          <thead><tr><th>Class</th><th className="numeric">Destinations returned</th><th className="numeric">Recorded commitments retained</th><th className="numeric">Retained share</th><th>Coverage</th><th>Evidence</th></tr></thead>
          <tbody>{destinationCoverageRows.map((row) => <tr key={`destination-coverage-${row.season}`}>
            <th scope="row"><button className="text-link" type="button" onClick={() => { setSeason(row.season); setPage(0); }}>{row.season}</button><small>{row.recordedCommitments.toLocaleString()} recorded commitments</small></th>
            <td className="numeric"><strong>{row.returned.toLocaleString()}</strong><small>of {row.total.toLocaleString()} destinations</small></td>
            <td className="numeric">{row.retainedCommitments.toLocaleString()}<small>of {row.recordedCommitments.toLocaleString()}</small></td>
            <td className="numeric">{row.retainedCommitmentShare == null ? "—" : `${(row.retainedCommitmentShare * 100).toFixed(1)}%`}</td>
            <td>{row.complete ? <><strong>Complete</strong><small>All recorded destination rows returned</small></> : <><strong>Partial</strong><small>Request limit {row.limit.toLocaleString()}</small></>}</td>
            <td><small>Verified digest · {row.receipt.sourceRows.toLocaleString()} rows</small><small className="source-hash">{row.receipt.sha256.slice(0, 12)}…</small></td>
          </tr>)}</tbody>
        </table></div>
      </section>}
      {rankConcentrationRows.length > 0 && <section className="paper-panel recruiting-class-table" aria-labelledby="recruiting-rank-concentration-title" style={{ marginBottom: 24 }}>
        <div className="section-heading" style={{ marginBottom: 10 }}>
          <div><div className="eyebrow">Recorded rank concentration / verified class editions</div><h3 id="recruiting-rank-concentration-title">Learn how much of each class has a recorded rank.</h3></div>
          <span className="note">{rankConcentrationRows.length} complete classes</span>
        </div>
        <p className="note">These counts come from mutually exclusive rank bins in the complete source release. Top 25 and top 100 are descriptive concentration measures, not a talent score; rank-unavailable rows remain visible and are excluded from those bins.</p>
        <div className="table-scroll"><table className="data-table">
          <thead><tr><th>Class</th><th className="numeric">Ranked</th><th className="numeric">Top 25</th><th className="numeric">Top 100</th><th className="numeric">Rank unavailable</th><th>Evidence</th></tr></thead>
          <tbody>{rankConcentrationRows.map((row) => <tr key={`rank-concentration-${row.season}`}>
            <th scope="row"><button className="text-link" type="button" onClick={() => { setSeason(row.season); setPage(0); }}>{row.season}</button><small>{row.total.toLocaleString()} exact release rows</small></th>
            <td className="numeric"><strong>{row.ranked.toLocaleString()}</strong><small>{(row.rankedShare * 100).toFixed(1)}% of class</small></td>
            <td className="numeric"><strong>{row.top25.toLocaleString()}</strong><small>{(row.top25Share * 100).toFixed(1)}% of class</small></td>
            <td className="numeric"><strong>{row.top100.toLocaleString()}</strong><small>{(row.top100Share * 100).toFixed(1)}% of class</small></td>
            <td className="numeric"><strong>{row.unranked.toLocaleString()}</strong><small>{((row.unranked / row.total) * 100).toFixed(1)}% of class</small></td>
            <td><small>Verified release digest</small><small>Edition-bound aggregate</small></td>
          </tr>)}</tbody>
        </table></div>
        <p className="note" style={{ marginTop: 12 }}>The comparison is withheld for any class whose release receipt, rank bins or ranked-row count does not reconcile. No athlete identity is inferred from these aggregates.</p>
      </section>}
      {destinationRecurrenceRows.length > 0 && <section className="paper-panel recruiting-class-table" aria-labelledby="recruiting-destination-recurrence-title" style={{ marginBottom: 24 }}>
        <div className="section-heading" style={{ marginBottom: 10 }}>
          <div><div className="eyebrow">Program destination recurrence / exact IDs</div><h3 id="recruiting-destination-recurrence-title">Which programs keep appearing in the retained destination leaders?</h3></div>
          <span className="note">{destinationRecurrenceRows[0].eligibleClasses} verified classes</span>
        </div>
        <p className="note">These are derived totals across the top 12 destination rows returned for each complete, receipt-verified class release. A program is counted only when its exact source team ID is present. Because each release is bounded to its top destination rows, an absent program is not evidence of zero commitments.</p>
        <div className="table-scroll"><table className="data-table">
          <thead><tr><th>Program</th><th className="numeric">Classes observed</th><th className="numeric">Recorded commitments</th><th className="numeric">Ranked</th><th className="numeric">Top 100</th><th className="numeric">Source rank points</th><th>Retained class rows</th></tr></thead>
          <tbody>{destinationRecurrenceRows.map((row) => <tr key={`destination-recurrence-${row.teamId}`}>
            <th scope="row"><Link href={`/basketball/programs/${encodeURIComponent(row.teamId)}/`}>{row.team}</Link><small>Exact team ID {row.teamId}</small>{row.recordedNames.length > 1 && <small>Source names: {row.recordedNames.join(" · ")}</small>}</th>
            <td className="numeric"><strong>{row.classCount.toLocaleString()}</strong><small>of {row.eligibleClasses.toLocaleString()} verified</small></td>
            <td className="numeric">{row.commitments.toLocaleString()}</td>
            <td className="numeric">{row.ranked.toLocaleString()}</td>
            <td className="numeric">{row.top100.toLocaleString()}</td>
            <td className="numeric">{row.sourceRankPoints.toLocaleString()}</td>
            <td>{row.seasons.join(" · ")}</td>
          </tr>)}</tbody>
        </table></div>
      </section>}
      {destinationIdentityRows.length > 0 && <section className="paper-panel recruiting-class-table" aria-labelledby="recruiting-destination-identity-title" style={{ marginBottom: 24 }}>
        <div className="section-heading" style={{ marginBottom: 10 }}>
          <div><div className="eyebrow">Destination identity / verified class editions</div><h3 id="recruiting-destination-identity-title">See how much destination evidence is joinable.</h3></div>
          <span className="note">Bounded source rows</span>
        </div>
        <p className="note">This audit covers only destination rows retained by the source response. Exact source team IDs can open a program dossier; name-only rows remain in the commitment denominator but cannot be safely joined. The response is bounded, so omitted destinations are not treated as zero.</p>
        <div className="table-scroll"><table className="data-table">
          <thead><tr><th>Class</th><th className="numeric">Retained destinations</th><th className="numeric">Exact-ID destinations</th><th className="numeric">Name-only destinations</th><th className="numeric">Retained commitments</th><th className="numeric">Exact-ID commitments</th><th className="numeric">ID join share</th></tr></thead>
          <tbody>{destinationIdentityRows.map((row) => <tr key={`destination-identity-${row.season}`}>
            <th scope="row"><button className="text-link" type="button" onClick={() => { setSeason(row.season); setPage(0); }}>{row.season}</button><small>Verified release digest</small></th>
            <td className="numeric">{row.retainedDestinations.toLocaleString()}</td>
            <td className="numeric"><strong>{row.exactIdDestinations.toLocaleString()}</strong></td>
            <td className="numeric">{row.nameOnlyDestinations.toLocaleString()}</td>
            <td className="numeric">{row.retainedCommitments.toLocaleString()}</td>
            <td className="numeric">{row.exactIdCommitments.toLocaleString()}</td>
            <td className="numeric">{row.exactIdCommitmentShare == null ? "—" : `${(row.exactIdCommitmentShare * 100).toFixed(1)}%`}<small>of retained commitment rows</small></td>
          </tr>)}</tbody>
        </table></div>
      </section>}
      {movementRows.length > 0 && <section className="paper-panel recruiting-class-table" aria-labelledby="recruiting-movement-comparison-title" style={{ marginBottom: 24 }}>
        <div className="section-heading" style={{ marginBottom: 10 }}>
          <div><div className="eyebrow">Rank movement / verified class editions</div><h3 id="recruiting-movement-comparison-title">Which classes are actually changing?</h3></div>
          <span className="note">{movementRows.length} verified classes</span>
        </div>
        <p className="note">Movement is calculated from the retained prior capture for the same athlete ID. “Measurable” excludes new rows and unavailable ranks; the changed rate is moved up plus moved down divided by measurable rows. A class is withheld unless its source receipt and movement buckets reconcile to the full release.</p>
        <div className="table-scroll"><table className="data-table">
          <thead><tr><th>Class</th><th className="numeric">Moved up</th><th className="numeric">Moved down</th><th className="numeric">Unchanged</th><th className="numeric">Rank unavailable</th><th className="numeric">New to archive</th><th className="numeric">Measurable</th><th className="numeric">Changed rate</th><th>Open</th></tr></thead>
          <tbody>{movementRows.map((row) => <tr key={`movement-comparison-${row.season}`}>
            <th scope="row"><button className="text-link" type="button" onClick={() => { setSeason(row.season); setPage(0); }}>{row.season}</button><small>{row.total.toLocaleString()} exact prospect rows</small></th>
            <td className="numeric">{row.movedUp.toLocaleString()}</td>
            <td className="numeric">{row.movedDown.toLocaleString()}</td>
            <td className="numeric">{row.unchanged.toLocaleString()}</td>
            <td className="numeric">{row.rankUnavailable.toLocaleString()}</td>
            <td className="numeric">{row.newToRelease.toLocaleString()}</td>
            <td className="numeric"><strong>{row.measurable.toLocaleString()}</strong></td>
            <td className="numeric">{row.changedShare == null ? "—" : `${(row.changedShare * 100).toFixed(1)}%`}<small>{row.changed.toLocaleString()} changed</small></td>
            <td><Link href={`/basketball/recruiting/?season=${encodeURIComponent(row.season)}`}>Open class →</Link></td>
          </tr>)}</tbody>
        </table></div>
      </section>}
      {positionMixRows.length > 0 && <section className="paper-panel recruiting-class-table" aria-labelledby="recruiting-position-mix-title" style={{ marginBottom: 24 }}>
        <div className="section-heading" style={{ marginBottom: 10 }}>
          <div><div className="eyebrow">Position supply / verified class editions</div><h3 id="recruiting-position-mix-title">See what each class actually contains.</h3></div>
          <span className="note">{positionMixRows.length} complete classes</span>
        </div>
        <p className="note">Counts and shares come from each class&apos;s complete, release-verified position aggregate. They describe the recorded prospect pool; they do not project roster need, player role or talent.</p>
        <div className="table-scroll"><table className="data-table">
          <thead><tr><th>Class</th><th className="numeric">Prospects</th>{positionColumns.map((position) => <th className="numeric" key={position}>{position}</th>)}</tr></thead>
          <tbody>{positionMixRows.map((row) => {
            const byPosition = new Map(row.positions.map((position) => [position.position, position]));
            return <tr key={`position-mix-${row.season}`}>
              <th scope="row"><button className="text-link" type="button" onClick={() => { setSeason(row.season); setPage(0); }}>{row.season}</button></th>
              <td className="numeric">{row.total.toLocaleString()}</td>
              {positionColumns.map((position) => {
                const value = byPosition.get(position);
                return <td className="numeric" key={`${row.season}-${position}`}>{value ? <><strong>{value.total.toLocaleString()}</strong><small>{(value.share * 100).toFixed(1)}%</small></> : "—"}</td>;
              })}
            </tr>;
          })}</tbody>
        </table></div>
      </section>}
      {destinationRows.length > 0 && <section className="paper-panel recruiting-class-table" aria-labelledby="recruiting-destination-table-title" style={{ marginBottom: 24 }}>
        <div className="section-heading" style={{ marginBottom: 10 }}>
          <div><div className="eyebrow">Destination audit / retained editions</div><h3 id="recruiting-destination-table-title">Where the ranked classes are landing.</h3></div>
          <span className="note">Top five per class</span>
        </div>
        <p className="note">These rows use the top five recorded commitment destinations from each class&apos;s complete current edition. Top-100 counts, rank summaries and position mixes remain source aggregates; a destination row does not confirm enrollment, eligibility or an offer.</p>
        <div className="table-scroll"><table className="data-table">
          <thead><tr><th>Class</th><th>Destination</th><th className="numeric">Recorded commitments</th><th className="numeric">Top 100</th><th className="numeric">Best rank</th><th className="numeric">Average rank</th><th>Position mix</th></tr></thead>
          <tbody>{destinationRows.map((destination) => {
            const share = destination.committedTotal && destination.committedTotal > 0
              ? `${((destination.total / destination.committedTotal) * 100).toFixed(1)}% of class commitments`
              : "Commitment denominator unavailable";
            return <tr key={`${destination.season}-${destination.team_id || "unknown"}-${destination.team}`}>
              <th scope="row"><button className="text-link" type="button" onClick={() => { setSeason(destination.season); setPage(0); }}>{destination.season}</button></th>
              <td>{destination.team_id ? <Link href={`/basketball/programs/${encodeURIComponent(destination.team_id)}/`}>{destination.team}</Link> : destination.team}</td>
              <td className="numeric"><strong>{destination.total.toLocaleString()}</strong><small>{share}</small></td>
              <td className="numeric">{destination.top100_total.toLocaleString()}<small>{destination.ranked_total.toLocaleString()} ranked</small></td>
              <td className="numeric">{destination.best_rank == null ? "—" : `#${destination.best_rank}`}</td>
              <td className="numeric">{destination.average_rank == null ? "—" : `#${destination.average_rank.toFixed(0)}`}</td>
              <td>{destination.positionLabels.length ? destination.positionLabels.join(" · ") : "Position mix unavailable"}</td>
            </tr>;
          })}</tbody>
        </table></div>
      </section>}
      {copied && <p className="note" role="status">{copied}</p>}
      {error ? <p className="status-error" role="alert">{error}</p> : !result ? <p className="empty" role="status">Loading recorded prospects…</p> : result.unavailable_reason ? <p className="empty">{result.unavailable_reason}</p> : (
        <>
          <div className="strip" style={{ marginBottom: 24 }}>
            <div><strong>{result.total.toLocaleString()}</strong><span>Matching prospects</span></div>
            <div><strong>{(result.cohort?.committed ?? 0).toLocaleString()}</strong><span>Committed in cohort</span></div>
            <div><strong>{(result.cohort?.ranked ?? 0).toLocaleString()}</strong><span>With recorded rank</span></div>
            <div><strong>{(result.cohort?.graded ?? 0).toLocaleString()}</strong><span>With recorded grade</span></div>
          </div>
          {result.field_coverage && <section className="paper-panel recruiting-field-coverage" aria-label="Recruiting field coverage" style={{ marginBottom: 24 }}>
            <div className="section-heading" style={{ marginBottom: 10 }}>
              <div><div className="eyebrow">Field audit / active cohort</div><h3>Know what the board actually supplies.</h3></div>
              <span className="note">{result.field_coverage.total.toLocaleString()} rows checked</span>
            </div>
            <p className="note">Percentages use the current class, search, position, rank, commitment and movement filters. A missing field stays unavailable; it is never treated as a negative scouting signal.</p>
            <div className="raw-stat-grid">
              <div><dt>Position</dt><dd>{coverageRate(result.field_coverage.position, result.field_coverage.total)}</dd></div>
              <div><dt>National rank</dt><dd>{coverageRate(result.field_coverage.rank, result.field_coverage.total)}</dd></div>
              <div><dt>Recorded grade</dt><dd>{coverageRate(result.field_coverage.grade, result.field_coverage.total)}</dd></div>
              <div><dt>Commitment destination</dt><dd>{coverageRate(result.field_coverage.committed_team, result.field_coverage.total)}</dd></div>
              <div><dt>High school</dt><dd>{coverageRate(result.field_coverage.high_school, result.field_coverage.total)}</dd></div>
              <div><dt>Hometown</dt><dd>{coverageRate(result.field_coverage.hometown, result.field_coverage.total)}</dd></div>
              <div><dt>Listed size</dt><dd>{coverageRate(Math.min(result.field_coverage.height, result.field_coverage.weight), result.field_coverage.total)}</dd></div>
              <div><dt>Position / state / region rank</dt><dd>{coverageRate(Math.min(result.field_coverage.position_rank, result.field_coverage.state_rank, result.field_coverage.region_rank), result.field_coverage.total)}</dd></div>
            </div>
          </section>}
          {result.identity_quality && <section className="paper-panel recruiting-field-coverage" aria-label="Recruiting identity integrity" style={{ marginBottom: 24 }}>
            <div className="section-heading" style={{ marginBottom: 10 }}>
              <div><div className="eyebrow">Identity audit / active cohort</div><h3>Know which joins need an exact ID.</h3></div>
              <span className="note">Shape checks only</span>
            </div>
            <p className="note">These checks describe retained row shape in the active edition. They do not merge prospects by name, repair source values or change the source ranking. Duplicate names require the athlete ID before comparing records.</p>
            <div className="raw-stat-grid">
              <div><dt>Duplicate-name groups</dt><dd>{result.identity_quality.duplicate_name_groups.toLocaleString()}</dd></div>
              <div><dt>Rows in those groups</dt><dd>{result.identity_quality.duplicate_name_rows.toLocaleString()}</dd></div>
              <div><dt>Commitment ID without name</dt><dd>{result.identity_quality.committed_id_without_name.toLocaleString()}</dd></div>
              <div><dt>Commitment name without ID</dt><dd>{result.identity_quality.committed_name_without_id.toLocaleString()}</dd></div>
              <div><dt>Malformed school lists</dt><dd>{result.identity_quality.malformed_school_list_rows.toLocaleString()}</dd></div>
              <div><dt>Non-array school lists</dt><dd>{result.identity_quality.non_array_school_list_rows.toLocaleString()}</dd></div>
              <div><dt>Duplicate school IDs</dt><dd>{result.identity_quality.duplicate_school_id_rows.toLocaleString()}</dd></div>
              <div><dt>Blank / invalid identity rows</dt><dd>{(result.identity_quality.blank_name_rows + result.identity_quality.invalid_athlete_id_rows).toLocaleString()}</dd></div>
            </div>
            {(result.identity_quality.duplicate_name_groups > 0 || result.identity_quality.committed_id_without_name > 0 || result.identity_quality.committed_name_without_id > 0 || result.identity_quality.malformed_school_list_rows > 0 || result.identity_quality.non_array_school_list_rows > 0 || result.identity_quality.duplicate_school_id_rows > 0) && <p className="note" role="status">One or more identity-shape flags are present. Use the prospect dossier and exact athlete ID before making a cross-source comparison.</p>}
          </section>}
          <p className="note" role="status">
            Active class edition <span className="source-hash">{result.edition || "unavailable"}</span>
            {result.captured_at ? <> · captured {captureLabel(result.captured_at)} UTC</> : " · capture date unavailable"}.
            {" "}The edition identifier lets a staff member reproduce this exact board after a later refresh.
          </p>
          {result.source_receipt && <p className="note">Release edition digest {result.source_receipt.sha256 ? <code>{result.source_receipt.sha256}</code> : "unavailable"} · {result.source_receipt.source_rows.toLocaleString()} retained rows · hash scope {result.source_receipt.sha256_scope} · integrity {result.source_receipt.integrity}.</p>}
          {result.rank_quality && <p className="note" role="status">Rank quality: {result.rank_quality.tied_rank_values.toLocaleString()} recorded rank value{result.rank_quality.tied_rank_values === 1 ? "" : "s"} are tied across {result.rank_quality.tied_rows.toLocaleString()} prospect rows. Ties retain the recorded rank and the board&apos;s name ordering.{result.rank_quality.withheld_placeholder_rows ? ` ${result.rank_quality.withheld_placeholder_rows.toLocaleString()} ungraded source placeholder rank${result.rank_quality.withheld_placeholder_rows === 1 ? " was" : "s were"} withheld.` : ""}</p>}
          {rankDistribution && <section className="paper-panel recruiting-rank-distribution" aria-labelledby="recruiting-rank-distribution-title" style={{ marginBottom: 24 }}>
            <div className="section-heading" style={{ marginBottom: 10 }}>
              <div><div className="eyebrow">Rank landscape / active cohort</div><h3 id="recruiting-rank-distribution-title">Learn where this class sits before you compare names.</h3></div>
              <span className="note">{result.total.toLocaleString()} rows reconciled</span>
            </div>
            <p className="note">These mutually exclusive bands use the recorded national rank in the exact edition <span className="source-hash">{result.edition}</span> and the active filters above. They describe the cohort distribution; they do not create a talent grade or adjust a prospect&apos;s source rank.</p>
            <div className="table-scroll"><table className="data-table">
              <thead><tr><th>Recorded rank band</th><th className="numeric">Prospects</th><th className="numeric">Share</th><th>Distribution</th></tr></thead>
              <tbody>{rankDistribution.map((band) => {
                const share = result.total > 0 ? band.total / result.total : 0;
                return <tr key={band.key}>
                  <th scope="row">{band.label}</th>
                  <td className="numeric"><strong>{band.total.toLocaleString()}</strong></td>
                  <td className="numeric">{(share * 100).toFixed(1)}%</td>
                  <td><progress max={result.total} value={band.total} aria-label={`${band.label}: ${band.total.toLocaleString()} of ${result.total.toLocaleString()} prospects`} /></td>
                </tr>;
              })}</tbody>
            </table></div>
            <p className="note" style={{ marginTop: 12 }}>An unavailable rank remains in its own band. A filtered view changes the denominator, so compare landscapes only when the season, filters and edition match.</p>
          </section>}
          {committed !== "yes" && positionOpportunity.length > 0 && <section className="paper-panel recruiting-class-table" aria-labelledby="recruiting-position-opportunity-title" style={{ marginBottom: 24 }}>
            <div className="section-heading" style={{ marginBottom: 10 }}>
              <div><div className="eyebrow">Position availability / active cohort</div><h3 id="recruiting-position-opportunity-title">Find the remaining ranked supply.</h3></div>
              <span className="note">{result.total.toLocaleString()} rows reconciled</span>
            </div>
            <p className="note">“Uncommitted” means the committed-team field is empty in this exact edition and filter set. Top-100 and best-rank values preserve the recorded national rank. They do not establish availability, contact, an offer, enrollment or eligibility.</p>
            <div className="table-scroll"><table className="data-table">
              <thead><tr><th>Position</th><th className="numeric">Prospects</th><th className="numeric">Uncommitted</th><th className="numeric">Uncommitted ranked</th><th className="numeric">Uncommitted top 100</th><th className="numeric">Best uncommitted rank</th><th className="numeric">Average uncommitted grade</th><th className="numeric">Committed</th></tr></thead>
              <tbody>{positionOpportunity.map((row) => <tr key={`position-opportunity-${row.position}`}>
                <th scope="row">{["PG", "SG", "SF", "PF", "C"].includes(row.position) ? <button className="text-link" type="button" onClick={() => { setPosition(row.position); setPage(0); }}>{row.position}</button> : row.position}</th>
                <td className="numeric">{row.total.toLocaleString()}</td>
                <td className="numeric"><strong>{row.uncommitted_total.toLocaleString()}</strong></td>
                <td className="numeric">{row.uncommitted_ranked_total.toLocaleString()}</td>
                <td className="numeric"><strong>{row.uncommitted_top100_total.toLocaleString()}</strong></td>
                <td className="numeric">{row.best_uncommitted_rank == null ? "—" : `#${row.best_uncommitted_rank}`}</td>
                <td className="numeric">{row.average_uncommitted_grade == null ? "—" : row.average_uncommitted_grade.toFixed(1)}</td>
                <td className="numeric">{row.committed_total.toLocaleString()}</td>
              </tr>)}</tbody>
            </table></div>
          </section>}
          {evidenceGuide.length > 0 && <section className="paper-panel" aria-labelledby="recruiting-evidence-guide-title" style={{ marginBottom: 24 }}>
            <div className="section-heading" style={{ marginBottom: 10 }}>
              <div><div className="eyebrow">Board method / exact edition</div><h3 id="recruiting-evidence-guide-title">Read each signal at its evidence boundary.</h3></div>
              <Link href="/basketball/learn/">Open the learning desk →</Link>
            </div>
            <p className="note">Use this sequence before adding a prospect or program to a study list. Counts refer to the active filters in edition <span className="source-hash">{result.edition}</span>; invalid or mixed-edition aggregates are withheld.</p>
            <div className="table-scroll"><table className="data-table">
              <thead><tr><th>Signal</th><th>Observed here</th><th>What it establishes</th><th>Evidence boundary</th><th>Next check</th></tr></thead>
              <tbody>{evidenceGuide.map((row) => <tr key={row.key}>
                <th scope="row">{row.signal}</th>
                <td><strong>{row.observed}</strong></td>
                <td>{row.establishes}</td>
                <td>{row.boundary}</td>
                <td><Link href={row.nextHref}>{row.nextLabel} →</Link></td>
              </tr>)}</tbody>
            </table></div>
            <p className="note" style={{ marginTop: 12 }}>The guide describes retained fields and joins. It does not create a composite recruiting score or infer a player relationship from a name.</p>
          </section>}
          {result.rank_movement && <section className="paper-panel recruiting-movement-panel" aria-label="Rank movement">
            <div className="section-heading" style={{ marginBottom: 12 }}>
              <div><div className="eyebrow">{movementEvidence ? "Edition-to-edition movement" : "Baseline edition"}</div><h3>{movementEvidence ? "See what changed in the board." : "Establish the board before tracking change."}</h3></div><span className="note">{movementEvidence ? "Compared with the latest earlier capture for each athlete" : "No earlier capture is retained for these exact athlete IDs"}</span>
            </div>
            <div className="strip">
              <div><strong>{result.rank_movement.moved_up.toLocaleString()}</strong><span>Moved up</span></div>
              <div><strong>{result.rank_movement.moved_down.toLocaleString()}</strong><span>Moved down</span></div>
              <div><strong>{result.rank_movement.unchanged.toLocaleString()}</strong><span>Unchanged</span></div>
              <div><strong>{result.rank_movement.new_to_release.toLocaleString()}</strong><span>New to archive</span></div>
            </div>
            <p className="note">A positive change means the national rank number improved (for example, 80 to 55). “New to archive” means no earlier release is retained for that exact athlete ID. {result.rank_movement.new_to_release === result.rank_movement.total ? "This is the first retained release for the current cohort, so movement is not yet measurable." : "Missing ranks stay unavailable."}</p>
          </section>}
          <div className="button-row" style={{ marginBottom: 16 }}>
            <button className="button secondary" type="button" onClick={downloadPage}>Download page CSV ↓</button>
            <button className="button secondary" type="button" onClick={downloadAll} disabled={exporting}>{exporting ? "Preparing full CSV…" : "Download all matching CSV ↓"}</button>
          </div>
          {exportMessage && <p className="note" role="status">{exportMessage}</p>}
          {committed !== "no" && (result.commitment_destinations || []).length > 0 && <section className="paper-panel" aria-label="Recruiting commitment destinations" style={{ marginBottom: 24 }}>
            <div className="section-heading" style={{ marginBottom: 12 }}>
              <div><div className="eyebrow">Destination board / active cohort</div><h3>Where the commitments are landing.</h3></div>
              <span className="note">{result.destination_coverage?.complete ? `${result.destination_coverage.total} destinations` : `Top ${result.destination_coverage?.returned ?? result.commitment_destinations?.length ?? 0} of ${result.destination_coverage?.total ?? "—"} destinations`}</span>
            </div>
            <div className="article-grid">
              {(result.commitment_destinations || []).map((destination) => <article className="article-card" key={`${destination.team_id || "unknown"}-${destination.team}`}>
                <div className="eyebrow">{destination.total === 1 ? "One commitment" : `${destination.total} commitments`}</div>
                <h3>{destination.team_id ? <Link href={`/basketball/programs/${encodeURIComponent(destination.team_id)}/`}>{destination.team} →</Link> : destination.team}</h3>
                <p>{destination.source_rank_points.toLocaleString()} rank points · {destination.ranked_total} ranked · {destination.top100_total} top 100{destination.best_rank == null ? "" : ` · best #${destination.best_rank}`}{destination.average_rank == null ? "" : ` · avg #${destination.average_rank.toFixed(0)}`}</p>
                <small>{(destination.position_breakdown || []).map((item) => `${item.position} ${item.total}`).join(" · ") || "Position mix unavailable"}</small>
                <small>{destination.team_id ? <><Link href={`/basketball/programs/${encodeURIComponent(destination.team_id)}/`}>Open program dossier →</Link>{fitHref(destination.team_id) && <> · <Link href={fitHref(destination.team_id)!}>Open roster fit →</Link></>}</> : "Program dossier unavailable for this row."} · Recorded {season} commitment{destination.total === 1 ? "" : "s"} in the active board filters.</small>
              </article>)}
            </div>
            <p className="note" style={{ marginTop: 12 }}>Counts use the recorded committed-team field and the same season, rank, position, search and status filters as the table. Use the destination control above to inspect the retained long tail; the response reports whether the list is complete. Rank points award max(1, 101 − national rank) for each ranked prospect, with unranked prospects contributing zero; they are a transparent Silvermine comparison aid, not an official class ranking or confirmation of enrollment or eligibility.</p>
          </section>}
          {schoolPrograms.length > 0 && <section className="paper-panel" aria-labelledby="recorded-school-board-title" style={{ marginBottom: 24 }}>
            <div className="section-heading" style={{ marginBottom: 12 }}>
              <div><div className="eyebrow">Recorded school lists / active cohort</div><h3 id="recorded-school-board-title">See which program IDs recur across the class.</h3></div>
              <span className="note">Top {schoolPrograms.length} exact IDs</span>
            </div>
            <p className="note">Every count comes from the prospect rows in edition <span className="source-hash">{result.edition}</span> under the active filters. A school-list appearance is only a retained field on that row; it does not establish an offer, active interest or contact.</p>
            <div className="table-scroll"><table className="data-table">
              <thead><tr><th>Program ID</th><th className="numeric">Listed prospects</th><th className="numeric">Uncommitted</th><th className="numeric">Committed here</th><th className="numeric">Ranked</th><th className="numeric">Top 100</th><th>Rank range</th><th>Position mix</th></tr></thead>
              <tbody>{schoolPrograms.map((program) => <tr key={program.school_id}>
                <th scope="row">{program.resolved ? <Link href={`/basketball/programs/${encodeURIComponent(program.school_id)}/`}>{program.name}</Link> : program.name}<small>ID {program.school_id}</small></th>
                <td className="numeric"><strong>{program.prospect_total}</strong></td>
                <td className="numeric">{program.uncommitted_total}</td>
                <td className="numeric">{program.committed_here_total}</td>
                <td className="numeric">{program.ranked_total}</td>
                <td className="numeric">{program.top100_total}</td>
                <td>{program.best_rank == null ? "—" : `Best #${program.best_rank}`}<small>{program.average_rank == null ? "Average unavailable" : `Average #${program.average_rank.toFixed(0)}`}</small></td>
                <td>{program.position_breakdown.map((item) => `${item.position} ${item.total}`).join(" · ")}</td>
              </tr>)}</tbody>
            </table></div>
            <p className="note" style={{ marginTop: 12 }}>“Committed here” requires the prospect’s exact committed-team ID to equal the recorded school ID. “Uncommitted” means the committed-team field is empty in this edition. Neither count predicts enrollment or eligibility.</p>
          </section>}
          {productionStatus === "live" && productionIndex && <section className="paper-panel" aria-labelledby="recruiting-production-links-title" style={{ marginBottom: 24 }}>
            <div className="section-heading" style={{ marginBottom: 10 }}>
              <div><div className="eyebrow">College production bridge / exact athlete IDs</div><h3 id="recruiting-production-links-title">Prior production beside the recorded class.</h3></div>
              <span className="note">{pageProductionRows.length} links on this page</span>
            </div>
            <p className="note">This table joins the active prospect page to the separately reviewed production release only through the exact publisher athlete ID. The release carries {productionIndex.linkedRows.toLocaleString()} unique production links among {productionIndex.sourceRows.toLocaleString()} retained people; an absent row remains unavailable and is not a zero. It describes prior production and does not establish eligibility, transfer status or a future role.</p>
            <p className="note">Production release edition <code>{productionIndex.edition}</code> · reviewed {new Date(productionIndex.reviewedAt).toLocaleString("en-US", { dateStyle: "medium", timeZone: "UTC" })} UTC.</p>
            {pageProductionCoverage && <div className="strip" aria-label="Current prospect page production coverage" style={{ marginBottom: 16 }}>
              <div><strong>{pageProductionCoverage.linkedRows.toLocaleString()}</strong><span>Exact-ID links on page</span></div>
              <div><strong>{pageProductionCoverage.unavailableRows.toLocaleString()}</strong><span>Page rows without link</span></div>
              <div><strong>{pageProductionCoverage.linkedShare == null ? "—" : `${(pageProductionCoverage.linkedShare * 100).toFixed(1)}%`}</strong><span>Page coverage</span></div>
              <div><strong>{pageProductionCoverage.totalRows.toLocaleString()}</strong><span>Prospect rows shown</span></div>
            </div>}
            {pageProductionRows.length ? <div className="table-scroll"><table className="data-table">
              <thead><tr><th>Prospect / exact ID</th><th>Prior team</th><th className="numeric">Season</th><th className="numeric">Games</th><th className="numeric">MIN/G</th><th className="numeric">PTS/G</th><th className="numeric">REB/G</th><th className="numeric">AST/G</th><th className="numeric">TS%</th><th className="numeric">eFG%</th></tr></thead>
              <tbody>{pageProductionRows.map(({ prospect, production }) => <tr key={`production-link-${prospect.athlete_id}`}>
                <th scope="row"><Link href={`/basketball/recruiting/prospect/?season=${season}&id=${prospect.athlete_id}`}>{prospect.name}</Link><small>Prospect ID {prospect.athlete_id} · rank {prospect.rank == null ? "unavailable" : `#${prospect.rank}`}</small></th>
                <td>{production.team}<small>Production ID {production.id}</small></td>
                <td className="numeric">{production.season}</td>
                <td className="numeric">{production.games.toLocaleString()}</td>
                <td className="numeric">{number(production.mpg, 1)}</td>
                <td className="numeric">{number(production.ppg, 1)}</td>
                <td className="numeric">{number(production.rpg, 1)}</td>
                <td className="numeric">{number(production.apg, 1)}</td>
                <td className="numeric">{production.ts == null ? "—" : `${number(production.ts * 100, 1)}%`}</td>
                <td className="numeric">{production.efg == null ? "—" : `${number(production.efg * 100, 1)}%`}</td>
              </tr>)}</tbody>
            </table></div> : <p className="empty">No exact-ID production rows are linked on this page. Open a prospect dossier for its individual bridge check.</p>}
          </section>}
          {productionFilter !== "all" && productionStatus !== "live" && <p className="note" role="status">The reviewed production release is {productionStatus === "checking" ? "still loading" : "unavailable"}; the evidence filter is withholding rows until an exact-ID comparison is available.</p>}
          {productionFilter !== "all" && productionStatus === "live" && !visibleRows.length && <p className="empty" role="status">No prospects on this fetched page match the selected production evidence filter. The filter applies to the current ranked page; use the page controls or full export to inspect another cohort.</p>}
          <div className="table-wrap" id="prospect-board-table">
            <table className="data-table">
              <caption className="sr-only">{season} basketball recruiting prospects</caption>
              <thead><tr><th>Rank</th><th>Movement</th><th>Prospect</th><th>Position ranks</th><th>Grade</th><th>Size</th><th>Commitment</th><th>Recorded schools</th><th>Prior college production</th><th>Origin</th><th>Capture</th><th>Shortlist</th></tr></thead>
              <tbody>{visibleRows.map((row) => {
                const schools = prospectSchools(row.school_ids, programs, row.committed_team_id);
                const production = exactRecruitingProduction(productionIndex, row.athlete_id);
                return <tr key={row.athlete_id}>
                <td>{number(row.rank)}</td>
                <td>{!row.previous_captured_at ? <span className="note">New / —</span> : row.previous_rank == null || row.rank == null ? <span className="note">Rank unavailable<small>prior capture retained</small></span> : <span className={row.previous_rank - row.rank > 0 ? "movement-up" : row.previous_rank - row.rank < 0 ? "movement-down" : "note"}>{row.previous_rank - row.rank > 0 ? "▲" : row.previous_rank - row.rank < 0 ? "▼" : "="} {Math.abs(row.previous_rank - row.rank)} <small>from #{row.previous_rank}</small></span>}</td>
                <td><Link href={`/basketball/recruiting/prospect/?season=${season}&id=${row.athlete_id}`}><strong>{row.name}</strong></Link><br /><span className="note">{row.high_school || "High school not listed"}</span></td>
                <td>{row.position || "—"}<br /><span className="note">Pos #{number(row.position_rank)}</span><br /><span className="note">State #{number(row.state_rank)} · Region #{number(row.region_rank)}</span></td>
                <td>{grade(row.grade)}</td>
                <td>{size(row.height_inches, row.weight_pounds)}</td>
                <td>{row.committed_team_name ? row.committed_team_id ? <><Link href={`/basketball/programs/${encodeURIComponent(row.committed_team_id)}/`}>{row.committed_team_name} →</Link>{fitHref(row.committed_team_id) && <small><Link href={fitHref(row.committed_team_id)!}>Open roster fit →</Link></small>}</> : row.committed_team_name : row.status || "—"}</td>
                <td>{schools.length ? <><strong>{schools.length}</strong><small>{schools.slice(0, 3).map((school) => school.name).join(" · ")}{schools.length > 3 ? ` · +${schools.length - 3}` : ""}</small><small><Link href={`/basketball/recruiting/prospect/?season=${season}&id=${row.athlete_id}#recorded-schools`}>Open school list →</Link></small></> : <span className="note">Not recorded</span>}</td>
                <td>{productionStatus === "checking" ? <span className="note">Checking reviewed stats…</span> : production ? <><strong>{production.ppg == null ? "PTS/G unavailable" : `${number(production.ppg, 1)} PTS/G`}</strong><small>{production.mpg == null ? "MIN/G unavailable" : `${number(production.mpg, 1)} MIN/G`} · {production.games.toLocaleString()} GP</small><small><Link href={`/basketball/recruiting/prospect/?season=${season}&id=${row.athlete_id}#production`}>Open exact-ID stats →</Link></small></> : productionStatus === "unavailable" ? <span className="note">Stats release unavailable</span> : <span className="note">No exact-ID link<small>Not a zero</small></span>}</td>
                <td>{row.hometown || "—"}</td>
                <td><small>{result.captured_at ? `${captureLabel(result.captured_at)} UTC` : "Capture date unavailable"}</small><small className="source-hash">{result.edition || "Edition unavailable"}</small></td>
                <td><button className="button secondary" type="button" onClick={() => toggleShortlist(row)} aria-pressed={shortlist.some((entry) => entry.key === recruitingShortlistKey(season, row.athlete_id))}>{shortlist.some((entry) => entry.key === recruitingShortlistKey(season, row.athlete_id)) ? "Saved" : "Save"}</button></td>
              </tr>})}</tbody>
            </table>
          </div>
          <div className="pagination" aria-label="Prospect board pages">
            <span className="note">{result.total.toLocaleString()} matching prospects · page {page + 1} of {totalPages}{productionFilter !== "all" ? ` · ${visibleRows.length} match the production filter on this page` : ""}</span>
            <button className="button secondary" disabled={page === 0} onClick={() => setPage((value) => Math.max(0, value - 1))}>Previous</button>
            <button className="button secondary" disabled={page + 1 >= totalPages} onClick={() => setPage((value) => Math.min(totalPages - 1, value + 1))}>Next</button>
          </div>
          <p className="section-note">Class edition captured {result.captured_at ? `${captureLabel(result.captured_at)} UTC` : "—"}. Recorded school lists reproduce the schools attached to the prospect row; they do not establish an offer, active interest, a commitment, roster spot, transfer date or eligibility.</p>
        </>
      )}
    </section>
  );
}
