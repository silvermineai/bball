import { describe, expect, it } from "vitest";
import { matchWomensShotProfiles, womensShotProfileSearchHref, womensShotTendencyStats } from "./womens-shot-summary";

describe("women's shot tendency summaries", () => {
  it("uses located attempts for shares and recorded attempts for shooting rates", () => {
    const rows = womensShotTendencyStats([
      { label: "Rim", attempts: 40, makes: 28 },
      { label: "3-point", attempts: 60, makes: 21 },
    ], 100);

    expect(rows[0]).toMatchObject({ share: 0.4, makeRate: 0.7 });
    expect(rows[1]).toMatchObject({ share: 0.6, makeRate: 0.35 });
  });

  it("fails closed on impossible make counts and unavailable denominators", () => {
    expect(womensShotTendencyStats([
      { label: "Rim", attempts: 4, makes: 5 },
    ], 0)[0]).toMatchObject({ makes: 0, share: 0, makeRate: null });
  });

  it("creates a women’s shot archive label-search handoff without joining IDs", () => {
    expect(womensShotProfileSearchHref("Jade Jones")).toBe("/basketball/ncaa-shooting/?gender=women&division=1&q=Jade+Jones");
    expect(womensShotProfileSearchHref("")).toBe("/basketball/ncaa-shooting/?gender=women&division=1");
  });

  it("keeps exact and name-only matches separate for safe auto-open behavior", () => {
    const profiles = [
      { profile_id: "1", name: "Jade Jones", team: "Ga. Southern" },
      { profile_id: "2", name: "Jade Jones", team: "Fairfield" },
      { profile_id: "3", name: "Jada Jones", team: "Ga. Southern" },
    ];
    expect(matchWomensShotProfiles(profiles, "Jade Jones", "Ga. Southern")).toMatchObject({
      exact: [profiles[0]],
      compatible: [profiles[0]],
      nameMatches: [profiles[0], profiles[1]],
    });
    expect(matchWomensShotProfiles(profiles, "Jade Jones", "Unknown")).toMatchObject({
      exact: [],
      compatible: [],
      nameMatches: [profiles[0], profiles[1]],
    });
  });

  it("normalizes accents and punctuation without falling back to name-only identity", () => {
    const profiles = [{ profile_id: "1", name: "Zoë O'Connor", team: "St. Mary's" }];
    expect(matchWomensShotProfiles(profiles, "Zoe OConnor", "St Marys").exact).toHaveLength(1);
    expect(matchWomensShotProfiles(profiles, "Zoe OConnor", "Other").exact).toHaveLength(0);
  });

  it("recognizes a unique source abbreviation beside a full team label", () => {
    const profiles = [{ profile_id: "1", name: "Kenley McCarn", team: "UT Martin" }];
    expect(matchWomensShotProfiles(profiles, "Kenley McCarn", "UT Martin Skyhawks")).toMatchObject({
      exact: [],
      compatible: [profiles[0]],
    });
  });
});
