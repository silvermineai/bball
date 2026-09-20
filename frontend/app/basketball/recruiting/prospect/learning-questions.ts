export type ProspectLearningInput = {
  rank: number | null;
  previousRank: number | null;
  previousCapturedAt?: string | null;
  committedTeamId: string | null;
  committedTeamName: string | null;
  recordedSchoolCount: number;
  resolvedSchoolCount: number;
  hasPeerContext: boolean;
};

export type ProspectLearningCheck = {
  key: "movement" | "destination" | "fit" | "school-list" | "peers";
  label: string;
  status: "recorded" | "unavailable";
  detail: string;
};

const validRank = (value: number | null) => Number.isInteger(value) && value != null && value > 0;

/**
 * Turn retained prospect fields into a small review queue. Every prompt stays
 * inside the exact prospect edition and reports missing evidence explicitly.
 */
export function prospectLearningChecks(input: ProspectLearningInput): ProspectLearningCheck[] {
  const hasMovement = validRank(input.rank) && validRank(input.previousRank);
  const movement = hasMovement ? (input.previousRank! - input.rank!) : null;
  return [
    {
      key: "movement",
      label: "Rank movement",
      status: hasMovement ? "recorded" : "unavailable",
      detail: hasMovement
        ? `${movement! > 0 ? "Up" : movement! < 0 ? "Down" : "Unchanged"} ${Math.abs(movement!)} place${Math.abs(movement!) === 1 ? "" : "s"} from the prior capture`
        : input.previousCapturedAt ? "Prior capture exists, but rank is unavailable" : "No prior retained rank capture",
    },
    {
      key: "destination",
      label: "Recorded destination",
      status: input.committedTeamId && input.committedTeamName ? "recorded" : "unavailable",
      detail: input.committedTeamId && input.committedTeamName
        ? `${input.committedTeamName} · exact program ID retained`
        : "No exact destination is recorded",
    },
    {
      key: "fit",
      label: "Destination fit",
      status: input.committedTeamId ? "recorded" : "unavailable",
      detail: input.committedTeamId
        ? "Roster workload can be reviewed by exact team ID"
        : "Requires a recorded destination team ID",
    },
    {
      key: "school-list",
      label: "Recorded school list",
      status: input.recordedSchoolCount > 0 ? "recorded" : "unavailable",
      detail: input.recordedSchoolCount > 0
        ? `${input.recordedSchoolCount} retained school ID${input.recordedSchoolCount === 1 ? "" : "s"} · ${input.resolvedSchoolCount} directory match${input.resolvedSchoolCount === 1 ? "" : "es"}`
        : "No school IDs attached to this capture",
    },
    {
      key: "peers",
      label: "Position peer context",
      status: input.hasPeerContext ? "recorded" : "unavailable",
      detail: input.hasPeerContext
        ? "Exact-position size context is available"
        : "No validated same-edition peer cohort",
    },
  ];
}
