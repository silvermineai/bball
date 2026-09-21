import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseRecruitingRelease, type RecruitingRelease } from "./recruiting";
import { buildRecruitingProductionIndex } from "./recruiting-production-index";

const source = JSON.parse(
  readFileSync("public/data/basketball/recruiting.json", "utf8"),
) as RecruitingRelease;

describe("recruiting production index", () => {
  it("indexes only unique exact athlete IDs and retains the release receipt", () => {
    const release = parseRecruitingRelease(source);
    expect(release).not.toBeNull();
    const index = buildRecruitingProductionIndex(release!);
    expect(index).toMatchObject({
      season: 2027,
      edition: source.edition,
      sourceRows: source.coverage.players,
      linkedRows: 45,
    });
    expect(index?.byAthleteId.get("260209")).toBeUndefined();
    const linked = [...(index?.byAthleteId.keys() || [])][0];
    expect(linked).toMatch(/^\d{1,15}$/);
    expect(index?.byAthleteId.get(linked)?.id).toBe(linked);
  });

  it("withholds the bridge when a reviewed packet repeats an athlete ID", () => {
    const release = parseRecruitingRelease(source)!;
    const duplicate = structuredClone(release);
    const first = duplicate.people.find((person) => person.stats)?.stats;
    const second = duplicate.people.find((person) => !person.stats);
    expect(first && second).toBeTruthy();
    second!.stats = { ...first! };
    duplicate.coverage.historical_links += 1;
    const reparsed = parseRecruitingRelease(duplicate);
    expect(reparsed).not.toBeNull();
    expect(buildRecruitingProductionIndex(reparsed!)).toBeNull();
  });

  it("rejects a release whose coverage denominator no longer matches its people", () => {
    const release = parseRecruitingRelease(source)!;
    const malformed = structuredClone(release);
    malformed.coverage.players -= 1;
    expect(buildRecruitingProductionIndex(malformed)).toBeNull();
  });
});
