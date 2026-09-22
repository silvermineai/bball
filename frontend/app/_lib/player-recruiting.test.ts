import { describe, expect, it } from "vitest";
import recruiting from "../../public/data/basketball/recruiting.json";
import rosters from "../../public/data/basketball/rosters.json";
import {
  parseLivePlayerRecruitingPayload,
  parsePlayerNationalProspectPayload,
  playerRecruitingStatRows,
  playerRecruitingContext,
  playerNationalProspectRequests,
  playerRecruitingContextRequests,
  playerRecruitingReadiness,
} from "./player-recruiting";
import type { RecruitingRelease } from "./recruiting";
import type { BBRosters } from "./basketball-types";

const recruitingRelease = recruiting as unknown as RecruitingRelease;
const rosterRelease = rosters as unknown as BBRosters;

describe("player recruiting context", () => {
  it("builds national prospect requests only for numeric exact source IDs", () => {
    expect(playerNationalProspectRequests("abc")).toEqual([]);
    expect(playerNationalProspectRequests("123")).toHaveLength(6);
    expect(playerNationalProspectRequests("123")[0]).toEqual({
      season: 2025,
      url: "/api/basketball/research/recruiting-rankings?season=2025&athlete_id=123&page=0",
    });
  });

  it("parses one national prospect row by exact ID and withholds duplicates", () => {
    const payload = {
      season: 2027,
      edition: "a".repeat(64),
      captured_at: "2026-09-21T12:00:00Z",
      rows: [{ athlete_id: "123", name: "Exact Prospect", position: "G", rank: 42, position_rank: 7, state_rank: null, region_rank: 3, previous_rank: 55, previous_captured_at: "2026-09-01T12:00:00Z", grade: 94.5, committed_team_id: "1", committed_team_name: "Example", status: "committed" }],
    };
    expect(parsePlayerNationalProspectPayload(payload, 2027, "123")).toMatchObject({ athlete_id: "123", season: 2027, rank: 42, position_rank: 7, state_rank: null, region_rank: 3, previous_rank: 55, committed_team_id: "1" });
    expect(parsePlayerNationalProspectPayload({ ...payload, rows: [...payload.rows, payload.rows[0]] }, 2027, "123")).toBeNull();
    expect(parsePlayerNationalProspectPayload(payload, 2026, "123")).toBeNull();
  });

  it("keeps dimensional ranks unavailable when omitted and rejects non-exact IDs", () => {
    const payload = {
      season: 2027,
      edition: "a".repeat(64),
      captured_at: "2026-09-21T12:00:00Z",
      rows: [{ athlete_id: "123", name: "Exact Prospect", position: "G", rank: 42, previous_rank: null, previous_captured_at: null, grade: null, committed_team_id: null, committed_team_name: null, status: null }],
    };
    expect(parsePlayerNationalProspectPayload(payload, 2027, "123")).toMatchObject({ position_rank: null, state_rank: null, region_rank: null });
    expect(parsePlayerNationalProspectPayload({ ...payload, rows: [{ ...payload.rows[0], athlete_id: 123 }] }, 2027, "123")).toBeNull();
    expect(parsePlayerNationalProspectPayload({ ...payload, rows: [{ ...payload.rows[0], position_rank: 0 }] }, 2027, "123")).toBeNull();
  });

  it("targets the live retained recruiting and roster editions", () => {
    expect(playerRecruitingContextRequests()).toEqual({
      recruiting: "/api/basketball/research/recruiting?season=2027",
      rosters: "/api/basketball/research/rosters?season=2027&limit=10000",
    });
  });

  it("rejects incomplete live payloads before they become player evidence", () => {
    expect(parseLivePlayerRecruitingPayload({}, {})).toBeNull();
  });

  it("accepts complete retained releases for exact-ID joining", () => {
    expect(parseLivePlayerRecruitingPayload(recruitingRelease, rosterRelease)).toEqual({
      recruiting: recruitingRelease,
      rosters: rosterRelease,
    });
  });

  it("joins announcements and roster observations by exact source ID", () => {
    const linked = recruitingRelease.people.find((person) => person.stats)?.stats?.id;
    expect(linked).toBeTruthy();
    const context = playerRecruitingContext(linked!, recruitingRelease, rosterRelease);
    expect(context.announcements.length).toBeGreaterThan(0);
    expect(context.announcements.every((row) => row.stats?.id === linked)).toBe(true);
    expect(context.rosterObservations.every((row) => row.id === linked)).toBe(true);
  });

  it("does not treat a matching name as a player identity", () => {
    const context = playerRecruitingContext("not-a-source-id", recruitingRelease, rosterRelease);
    expect(context.announcements).toEqual([]);
    expect(context.rosterObservations).toEqual([]);
  });

  it("reports exact-ID recruiting readiness without inferring missing evidence", () => {
    const linked = recruitingRelease.people.find((person) => person.stats)?.stats?.id;
    expect(linked).toBeTruthy();
    const complete = playerRecruitingReadiness(playerRecruitingContext(linked!, recruitingRelease, rosterRelease));
    expect(complete.every((check) => check.status === "recorded")).toBe(true);
    expect(complete.map((check) => check.label)).toEqual([
      "Dated school evidence",
      "Prior college production",
      "Current roster observation",
    ]);

    const missing = playerRecruitingReadiness({ announcements: [], rosterObservations: [] });
    expect(missing.map((check) => check.status)).toEqual(["unavailable", "unavailable", "unavailable"]);
    expect(missing[2].detail).toBe("No exact-ID roster row");
  });

  it("keeps the recruiting handoff wide enough for a useful player review", () => {
    const rows = playerRecruitingStatRows({
      mpg: 31.2,
      ppg: 18.4,
      rpg: 7.1,
      apg: 4.3,
      spg: 1.2,
      bpg: 0.6,
      topg: 2.1,
      efg: 0.57,
      ts: 0.61,
      three_pct: 0.39,
      ft_pct: 0.82,
    });
    expect(rows.map((row) => row.label)).toEqual([
      "MIN/G", "PTS/G", "REB/G", "AST/G", "STL/G", "BLK/G", "TO/G",
      "eFG%", "TS%", "3P%", "FT%",
    ]);
    expect(rows.find((row) => row.key === "spg")?.value).toBe(1.2);
    expect(rows.find((row) => row.key === "ts")?.percent).toBe(true);
  });
});
