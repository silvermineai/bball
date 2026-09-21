export type FootballLowerPlayerSourceContract = {
  key: string;
  publisher: string;
  url: string;
  scope: string;
  discovery_status: "candidate_unverified" | "ready" | "blocked";
  expected_fields: string[];
  required_before_import: string[];
  reason: string;
  discovery_url?: string;
};

export type FootballLowerPlayerReadiness = {
  schema_version: 1;
  sport: "football";
  gender: "men";
  season: number;
  generated_at: string;
  status: "blocked" | "needs_review" | "ready";
  source_contracts: FootballLowerPlayerSourceContract[];
  divisions: Record<"2" | "3", {
    status: "blocked" | "needs_review" | "ready";
    candidate_count: number;
    blockers: string[];
    rows_published: number;
    source_labeled_team_rows: number;
    box_rows_mapped_to_source_labeled_teams: number;
    unique_athletes_mapped_to_source_labeled_teams: number;
    reason: string;
  }>;
  classification_policy: string;
  required_before_import: string[];
  limitations: string[];
};

const statuses = new Set(["candidate_unverified", "ready", "blocked"]);
const divisionStatuses = new Set(["blocked", "needs_review", "ready"]);

function sourceContract(value: unknown): value is FootballLowerPlayerSourceContract {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.key === "string"
    && typeof row.publisher === "string"
    && typeof row.url === "string"
    && typeof row.scope === "string"
    && typeof row.discovery_status === "string"
    && statuses.has(row.discovery_status)
    && Array.isArray(row.expected_fields)
    && row.expected_fields.every((item) => typeof item === "string")
    && Array.isArray(row.required_before_import)
    && row.required_before_import.every((item) => typeof item === "string")
    && typeof row.reason === "string"
    && (row.discovery_url == null || typeof row.discovery_url === "string");
}

/** Validate the source ledger before rendering any lower-division claim. */
export function validateFootballLowerPlayerReadiness(value: unknown): FootballLowerPlayerReadiness {
  if (!value || typeof value !== "object") throw new Error("Football lower-division player readiness is malformed.");
  const row = value as Record<string, unknown>;
  if (row.schema_version !== 1 || row.sport !== "football" || row.gender !== "men"
    || typeof row.season !== "number" || !Number.isInteger(row.season)
    || typeof row.generated_at !== "string" || typeof row.status !== "string"
    || !divisionStatuses.has(row.status)
    || !Array.isArray(row.source_contracts)
    || !row.source_contracts.every(sourceContract)
    || typeof row.classification_policy !== "string"
    || !Array.isArray(row.required_before_import)
    || !row.required_before_import.every((item) => typeof item === "string")
    || !Array.isArray(row.limitations)
    || !row.limitations.every((item) => typeof item === "string")) {
    throw new Error("Football lower-division player readiness has an unsupported edition.");
  }
  const rawDivisions = row.divisions;
  if (!rawDivisions || typeof rawDivisions !== "object") throw new Error("Football lower-division player readiness has no division ledger.");
  const divisions = {} as FootballLowerPlayerReadiness["divisions"];
  for (const division of ["2", "3"] as const) {
    const current = (rawDivisions as Record<string, unknown>)[division];
    if (!current || typeof current !== "object") throw new Error(`Football lower-division player readiness is missing D${division}.`);
    const item = current as Record<string, unknown>;
    if (typeof item.status !== "string" || !divisionStatuses.has(item.status)
      || !Number.isInteger(item.candidate_count) || !Array.isArray(item.blockers)
      || !item.blockers.every((blocker) => typeof blocker === "string")
      || typeof item.rows_published !== "number" || !Number.isInteger(item.rows_published) || item.rows_published < 0
      || typeof item.source_labeled_team_rows !== "number" || !Number.isInteger(item.source_labeled_team_rows) || item.source_labeled_team_rows < 0
      || typeof item.box_rows_mapped_to_source_labeled_teams !== "number" || !Number.isInteger(item.box_rows_mapped_to_source_labeled_teams) || item.box_rows_mapped_to_source_labeled_teams < 0
      || typeof item.unique_athletes_mapped_to_source_labeled_teams !== "number" || !Number.isInteger(item.unique_athletes_mapped_to_source_labeled_teams) || item.unique_athletes_mapped_to_source_labeled_teams < 0
      || typeof item.reason !== "string") {
      throw new Error(`Football lower-division player readiness has malformed D${division}.`);
    }
    divisions[division] = {
      status: item.status as "blocked" | "needs_review" | "ready",
      candidate_count: item.candidate_count as number,
      blockers: item.blockers as string[],
      rows_published: Number(item.rows_published),
      source_labeled_team_rows: Number(item.source_labeled_team_rows),
      box_rows_mapped_to_source_labeled_teams: Number(item.box_rows_mapped_to_source_labeled_teams),
      unique_athletes_mapped_to_source_labeled_teams: Number(item.unique_athletes_mapped_to_source_labeled_teams),
      reason: item.reason as string,
    };
  }
  return {
    schema_version: 1,
    sport: "football",
    gender: "men",
    season: row.season,
    generated_at: row.generated_at,
    status: row.status as FootballLowerPlayerReadiness["status"],
    source_contracts: row.source_contracts as FootballLowerPlayerSourceContract[],
    divisions,
    classification_policy: row.classification_policy,
    required_before_import: row.required_before_import as string[],
    limitations: row.limitations as string[],
  };
}
