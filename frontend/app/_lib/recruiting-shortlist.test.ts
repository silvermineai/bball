import { describe, expect, it } from "vitest";
import {
  recruitingShortlistKey,
  readRecruitingShortlist,
  toggleRecruitingShortlist,
  type RecruitingShortlistEntry,
} from "./recruiting-shortlist";

const entry = (key = recruitingShortlistKey("2027", "42")): RecruitingShortlistEntry => ({
  key,
  season: key.split(":")[0],
  athlete_id: key.split(":")[1],
  name: "Example Prospect",
  position: "SF",
  rank: 12,
  grade: 98,
  committed_team_id: "8",
  committed_team_name: "Example U",
  high_school: "Example High",
  source_url: "https://example.test/prospect",
  edition: null,
  captured_at: null,
});

describe("recruiting prospect shortlist", () => {
  it("accepts valid entries, removes duplicates and rejects malformed storage", () => {
    const valid = entry();
    const raw = JSON.stringify([valid, valid, { key: "bad", name: "No ID" }]);
    expect(readRecruitingShortlist(raw)).toEqual([valid]);
    expect(readRecruitingShortlist("not json")).toEqual([]);
  });

  it("toggles an exact season and athlete key", () => {
    const valid = entry();
    expect(toggleRecruitingShortlist([], valid)).toEqual([valid]);
    expect(toggleRecruitingShortlist([valid], valid)).toEqual([]);
  });

  it("keeps the class in the key so the same athlete ID can be audited separately", () => {
    const one = entry(recruitingShortlistKey("2027", "42"));
    const two = entry(recruitingShortlistKey("2028", "42"));
    expect(toggleRecruitingShortlist([one], two).map((value) => value.key)).toEqual([two.key, one.key]);
  });
});
