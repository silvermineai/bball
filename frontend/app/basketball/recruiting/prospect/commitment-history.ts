export type RecruitingHistoryEntry = {
  edition: string;
  captured_at: string;
  rank: number | null;
  /** Source-published position, state, and region ranks when retained. */
  position_rank?: number | null;
  state_rank?: number | null;
  region_rank?: number | null;
  grade: number | null;
  status: string | null;
  committed_team_id: string | null;
  committed_team_name: string | null;
  source_url: string;
};

export type CommitmentTransition = {
  kind: "destination_recorded" | "destination_changed" | "destination_cleared" | "status_changed";
  captured_at: string;
  edition: string;
  previous_edition: string;
  previous_status: string | null;
  status: string | null;
  previous_team_id: string | null;
  previous_team_name: string | null;
  committed_team_id: string | null;
  committed_team_name: string | null;
};

const recorded = (value: string | null) => {
  const normalized = value?.trim();
  return normalized ? normalized : null;
};

const nullableString = (value: unknown): value is string | null => value === null || typeof value === "string";

/**
 * Admit a history only when every retained capture has a usable identity and
 * the array is in the same chronological order promised by the API query.
 * A malformed row invalidates the whole history so a partial timeline cannot
 * be mistaken for the prospect's complete retained record.
 */
export function validateRecruitingHistory(value: unknown): RecruitingHistoryEntry[] | null {
  if (!Array.isArray(value)) return null;
  const editions = new Set<string>();
  let previousTime = -Infinity;
  let previousEdition = "";
  const rows: RecruitingHistoryEntry[] = [];
  for (const candidate of value) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
    const row = candidate as Partial<RecruitingHistoryEntry>;
    if (typeof row.edition !== "string" || !row.edition.trim()
      || typeof row.captured_at !== "string" || !row.captured_at.trim()
      || !Number.isFinite(Date.parse(row.captured_at))
      || editions.has(row.edition)) return null;
    const capturedTime = Date.parse(row.captured_at);
    if (capturedTime < previousTime || (capturedTime === previousTime && row.edition <= previousEdition)) return null;
    const rankValue = row.rank;
    const positionRankValue = row.position_rank;
    const stateRankValue = row.state_rank;
    const regionRankValue = row.region_rank;
    const gradeValue = row.grade;
    if (rankValue === undefined || (rankValue !== null && (!Number.isSafeInteger(rankValue) || rankValue <= 0))) return null;
    if (positionRankValue !== undefined && positionRankValue !== null && (!Number.isSafeInteger(positionRankValue) || positionRankValue <= 0)) return null;
    if (stateRankValue !== undefined && stateRankValue !== null && (!Number.isSafeInteger(stateRankValue) || stateRankValue <= 0)) return null;
    if (regionRankValue !== undefined && regionRankValue !== null && (!Number.isSafeInteger(regionRankValue) || regionRankValue <= 0)) return null;
    if (gradeValue === undefined || (gradeValue !== null && (typeof gradeValue !== "number" || !Number.isFinite(gradeValue) || gradeValue < 0))) return null;
    if (!nullableString(row.status) || !nullableString(row.committed_team_id) || !nullableString(row.committed_team_name) || typeof row.source_url !== "string") return null;
    const normalized: RecruitingHistoryEntry = {
      edition: row.edition,
      captured_at: row.captured_at,
      rank: row.rank ?? null,
      grade: row.grade ?? null,
      status: row.status ?? null,
      committed_team_id: row.committed_team_id ?? null,
      committed_team_name: row.committed_team_name ?? null,
      source_url: row.source_url,
    };
    // Older bundled fixtures predate the dimensional rank fields. Preserve
    // their shape while validating and retaining the fields when a live API
    // response supplies them.
    if (positionRankValue !== undefined) normalized.position_rank = positionRankValue ?? null;
    if (stateRankValue !== undefined) normalized.state_rank = stateRankValue ?? null;
    if (regionRankValue !== undefined) normalized.region_rank = regionRankValue ?? null;
    rows.push(normalized);
    editions.add(row.edition);
    previousTime = capturedTime;
    previousEdition = row.edition;
  }
  return rows;
}

/**
 * Describes only differences between adjacent retained captures. The first
 * capture establishes a baseline, so it can never be reported as an event.
 */
export function commitmentTransitions(history: RecruitingHistoryEntry[]): CommitmentTransition[] {
  const transitions: CommitmentTransition[] = [];

  for (let index = 1; index < history.length; index += 1) {
    const previous = history[index - 1];
    const current = history[index];
    if (!previous.edition.trim() || !current.edition.trim() || !Number.isFinite(Date.parse(current.captured_at))) continue;

    const previousTeamId = recorded(previous.committed_team_id);
    const currentTeamId = recorded(current.committed_team_id);
    const previousStatus = recorded(previous.status);
    const currentStatus = recorded(current.status);
    let kind: CommitmentTransition["kind"] | null = null;

    if (!previousTeamId && currentTeamId) kind = "destination_recorded";
    else if (previousTeamId && !currentTeamId) kind = "destination_cleared";
    else if (previousTeamId && currentTeamId && previousTeamId !== currentTeamId) kind = "destination_changed";
    else if (previousStatus !== currentStatus) kind = "status_changed";

    if (!kind) continue;
    transitions.push({
      kind,
      captured_at: current.captured_at,
      edition: current.edition,
      previous_edition: previous.edition,
      previous_status: previousStatus,
      status: currentStatus,
      previous_team_id: previousTeamId,
      previous_team_name: recorded(previous.committed_team_name),
      committed_team_id: currentTeamId,
      committed_team_name: recorded(current.committed_team_name),
    });
  }

  return transitions;
}
