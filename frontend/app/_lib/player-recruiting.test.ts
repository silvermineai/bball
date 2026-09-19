import { describe, expect, it } from "vitest";
import recruiting from "../../public/data/basketball/recruiting.json";
import rosters from "../../public/data/basketball/rosters.json";
import {
  parseLivePlayerRecruitingPayload,
  playerRecruitingContext,
  playerRecruitingContextRequests,
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
});
