import type { RecordedSchoolProgram } from "../../_lib/recorded-school-board";

type EvidenceGuideInput = {
  season: number;
  total: number;
  edition: string | null;
  cohort?: {
    committed: number;
    ranked: number;
    graded: number;
  };
  field_coverage?: {
    total: number;
    committed_team: number;
  };
  rank_quality?: {
    ranked_rows: number;
    tied_rank_values: number;
    tied_rows: number;
    withheld_placeholder_rows?: number;
  };
};

export type RecruitingEvidenceGuideRow = {
  key: "rank" | "school-list" | "commitment" | "workload";
  signal: string;
  observed: string;
  establishes: string;
  boundary: string;
  nextHref: string;
  nextLabel: string;
};

const whole = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) >= 0;

/**
 * Build an edition-bound reading guide for the recruiting board. Counts are
 * admitted only when their denominators and relationships are internally
 * consistent. The guide explains existing fields; it does not grade players,
 * infer recruiting activity or merge prospect identities with college stats.
 */
export function recruitingEvidenceGuide(
  result: EvidenceGuideInput,
  schoolPrograms: readonly RecordedSchoolProgram[],
): RecruitingEvidenceGuideRow[] {
  const edition = typeof result.edition === "string" ? result.edition.trim() : "";
  if (
    !edition ||
    !whole(result.season) ||
    result.season < 2000 ||
    !whole(result.total)
  ) {
    return [];
  }

  const rows: RecruitingEvidenceGuideRow[] = [];
  const cohort = result.cohort;
  const quality = result.rank_quality;
  if (
    quality &&
    [
      quality.ranked_rows,
      quality.tied_rank_values,
      quality.tied_rows,
      quality.withheld_placeholder_rows ?? 0,
    ].every(whole) &&
    quality.ranked_rows <= result.total &&
    quality.tied_rows <= quality.ranked_rows &&
    quality.tied_rank_values <= quality.tied_rows &&
    (!cohort || (whole(cohort.ranked) && cohort.ranked === quality.ranked_rows)) &&
    (quality.tied_rank_values === 0
      ? quality.tied_rows === 0
      : quality.tied_rows >= quality.tied_rank_values * 2) &&
    (quality.withheld_placeholder_rows ?? 0) <= result.total
  ) {
    rows.push({
      key: "rank",
      signal: "Recorded national rank",
      observed: `${quality.ranked_rows.toLocaleString()} of ${result.total.toLocaleString()} rows ranked · ${quality.tied_rank_values.toLocaleString()} tied value${quality.tied_rank_values === 1 ? "" : "s"} across ${quality.tied_rows.toLocaleString()} rows`,
      establishes: `Relative order recorded inside the ${result.season} class and this exact edition. Equal rank values remain tied; name order only makes the table stable.`,
      boundary: "It does not establish a Silvermine talent grade, college role, fit or future production.",
      nextHref: "#prospect-board-table",
      nextLabel: "Choose an exact prospect dossier",
    });
  }

  const schoolsValid =
    schoolPrograms.length > 0 &&
    new Set(schoolPrograms.map((program) => program.school_id)).size ===
      schoolPrograms.length &&
    schoolPrograms.every(
      (program) =>
        program.edition === edition &&
        whole(program.prospect_total) &&
        program.prospect_total > 0,
    );
  if (schoolsValid) {
    const appearances = schoolPrograms.reduce(
      (sum, program) => sum + program.prospect_total,
      0,
    );
    rows.push({
      key: "school-list",
      signal: "Recorded school-list ID",
      observed: `${schoolPrograms.length.toLocaleString()} recurring program ID${schoolPrograms.length === 1 ? "" : "s"} shown · ${appearances.toLocaleString()} appearances across those displayed IDs`,
      establishes: "The exact program ID appears in a retained school-list field for a prospect in this edition.",
      boundary: "An appearance does not establish an offer, contact, active interest, visit or commitment.",
      nextHref: "#recorded-school-board-title",
      nextLabel: "Inspect recorded school IDs",
    });
  }

  const coverage = result.field_coverage;
  if (
    cohort &&
    coverage &&
    [cohort.committed, cohort.ranked, cohort.graded, coverage.total, coverage.committed_team].every(whole) &&
    coverage.total === result.total &&
    cohort.committed === coverage.committed_team &&
    cohort.committed <= result.total &&
    cohort.ranked <= result.total &&
    cohort.graded <= result.total
  ) {
    rows.push({
      key: "commitment",
      signal: "Recorded commitment ID",
      observed: `${cohort.committed.toLocaleString()} of ${result.total.toLocaleString()} filtered prospects have a committed-team ID`,
      establishes: "The commitment field names a destination, and program totals require the exact committed-team ID.",
      boundary: "It does not establish signing, enrollment, admission, eligibility, arrival or an eventual roster role.",
      nextHref: `/basketball/recruiting/?season=${result.season}&committed=yes`,
      nextLabel: "Review recorded commitments",
    });
  }

  rows.push({
    key: "workload",
    signal: "College workload",
    observed: "Not a field in this prospect-ranking release",
    establishes: "The prospect board keeps ranking evidence separate from college minutes and production.",
    boundary: "Missing workload here does not mean zero experience, and a rank does not project minutes or usage.",
    nextHref: "/basketball/roster-board/",
    nextLabel: "Open the roster workload board",
  });

  return rows;
}
