export type RecruitingHistoryEntry = {
  edition: string;
  captured_at: string;
  rank: number | null;
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
