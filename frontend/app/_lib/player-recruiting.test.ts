import { describe, expect, it } from "vitest";
import recruiting from "../../public/data/basketball/recruiting.json";
import rosters from "../../public/data/basketball/rosters.json";
import {
  parseLivePlayerRecruitingPayload,
  playerRecruitingStatRows,
  playerRecruitingContext,
  playerRecruitingContextRequests,
  playerRecruitingReadiness,
} from "./player-recruiting";
import type { RecruitingRelease } from "./recruiting";
import type { BBRosters } from "./basketball-types";

const recruitingRelease = recruiting as unknown as RecruitingRelease;
const rosterRelease = rosters as unknown as BBRosters;

describe("player recruiting context", () => {
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
