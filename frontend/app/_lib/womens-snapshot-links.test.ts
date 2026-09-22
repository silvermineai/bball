import { describe, expect, it } from "vitest";
import { womensSnapshotGameHref, womensSnapshotPlayerHref } from "./womens-snapshot-links";

describe("women's snapshot links", () => {
  it("opens an exact women player file without losing the source ID", () => {
    expect(womensSnapshotPlayerHref("athlete/7"))
      .toBe("/basketball/womens-player/?id=athlete%2F7");
  });

  it("keeps an exact women game in the D1 forecast scope", () => {
    expect(womensSnapshotGameHref("game 401917926"))
      .toBe("/basketball/matchups/?gender=women&division=1&game=game%20401917926");
  });
});
