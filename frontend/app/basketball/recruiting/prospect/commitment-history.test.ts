import { describe, expect, it } from "vitest";
import { commitmentTransitions, type RecruitingHistoryEntry } from "./commitment-history";

const capture = (overrides: Partial<RecruitingHistoryEntry>): RecruitingHistoryEntry => ({
  edition: "edition-1",
  captured_at: "2026-09-12T00:00:00Z",
  rank: 42,
  grade: 90,
  status: "Undecided",
  committed_team_id: null,
  committed_team_name: null,
  source_url: "",
  ...overrides,
});

describe("commitmentTransitions", () => {
  it("reports a destination only when a later retained capture records one", () => {
    const rows = [
      capture({}),
      capture({ edition: "edition-2", captured_at: "2026-09-14T00:00:00Z", status: "Verbal", committed_team_id: "257", committed_team_name: "Richmond" }),
      capture({ edition: "edition-3", captured_at: "2026-09-15T00:00:00Z", status: "Verbal", committed_team_id: "257", committed_team_name: "Richmond" }),
    ];

    expect(commitmentTransitions(rows)).toEqual([expect.objectContaining({
      kind: "destination_recorded",
      previous_edition: "edition-1",
      edition: "edition-2",
      previous_team_id: null,
      committed_team_id: "257",
      committed_team_name: "Richmond",
    })]);
  });

  it("keeps destination changes and removals distinct", () => {
    const rows = [
      capture({ committed_team_id: "257", committed_team_name: "Richmond", status: "Verbal" }),
      capture({ edition: "edition-2", committed_team_id: "150", committed_team_name: "Duke", status: "Verbal" }),
      capture({ edition: "edition-3", committed_team_id: null, committed_team_name: null, status: "Undecided" }),
    ];

    expect(commitmentTransitions(rows).map((change) => change.kind)).toEqual([
      "destination_changed",
      "destination_cleared",
    ]);
  });

  it("reports status-only changes and never treats the baseline as an event", () => {
    const rows = [
      capture({ committed_team_id: "257", committed_team_name: "Richmond", status: null }),
      capture({ edition: "edition-2", committed_team_id: "257", committed_team_name: "Richmond", status: "Signed" }),
    ];

    expect(commitmentTransitions(rows)).toEqual([expect.objectContaining({
      kind: "status_changed",
      previous_status: null,
      status: "Signed",
    })]);
    expect(commitmentTransitions([rows[1]])).toEqual([]);
  });

  it("fails closed when a changed capture has no edition or timestamp", () => {
    const baseline = capture({});
    expect(commitmentTransitions([baseline, capture({ edition: "", committed_team_id: "257" })])).toEqual([]);
    expect(commitmentTransitions([baseline, capture({ edition: "edition-2", captured_at: "", committed_team_id: "257" })])).toEqual([]);
    expect(commitmentTransitions([baseline, capture({ edition: "edition-2", captured_at: "not-a-date", committed_team_id: "257" })])).toEqual([]);
  });
});
