import { describe, expect, it } from "vitest";
import { snapshotRow } from "./ncaa-player-ranking-snapshot";

const definition = { metric: "ppg" as const, label: "Points per game", note: "5 games" };

describe("NCAA player ranking snapshot", () => {
  it("matches the exact source ID and computes a cohort percentile", () => {
    const row = snapshotRow(definition, {
      total: 101,
      rows: [
        { player_id: "42", value: 19.2, rank: 11 },
        { player_id: "420", value: 99, rank: 1 },
      ],
    }, "42");
    expect(row.status).toBe("qualified");
    expect(row.rank).toBe(11);
    expect(row.percentile).toBe(90);
  });

  it("keeps a player outside the qualified board explicit", () => {
    const row = snapshotRow(definition, { total: 8, rows: [] }, "42");
    expect(row.status).toBe("not_qualified");
    expect(row.value).toBeNull();
    expect(row.percentile).toBeNull();
    expect(row.total).toBe(8);
  });
});
