import fs from "node:fs";
import { describe, it, expect } from "vitest";
import {
  verifyPlayerIndex,
  type PlayerCatalog,
} from "./football-player-history";
const root = "public/data/football/";
const catalog: PlayerCatalog = JSON.parse(
  fs.readFileSync(root + "player-catalog.json", "utf8"),
);
const bytes = (data: Buffer) => Uint8Array.from(data).buffer;
describe("football player history", () => {
  it("verifies all five season hashes, positive identities and offensive rank cohorts", async () => {
    expect(catalog.seasons.map((s) => s.season)).toEqual([
      2022, 2023, 2024, 2025, 2026,
    ]);
    for (const season of catalog.seasons) {
      const d = await verifyPlayerIndex(
        bytes(fs.readFileSync(root + season.file)),
        season.season,
        catalog,
      );
      expect(d.players.length).toBe(season.player_team_records);
      expect(d.excluded_team_placeholder_entries).toBe(
        season.excluded_team_placeholder_entries,
      );
      const keys = new Set();
      for (const p of d.players) {
        expect(p.id).toMatch(/^[1-9]\d*$/);
        expect(keys.has(p.id + ":" + p.team_id)).toBe(false);
        keys.add(p.id + ":" + p.team_id);
        expect(p.season).toBe(season.season);
      }
      for (const category of ["passing", "rushing", "receiving"]) {
        const ranked = d.players
          .filter((p: any) => p.production[category]?.rank != null)
          .map((p: any) => p.production[category])
          .sort((a: any, b: any) => a.rank - b.rank);
        expect(ranked.length).toBe(d.rankings[category].qualified);
        for (let i = 0; i < ranked.length; i++) {
          expect(ranked[i].rank).toBe(i + 1);
          expect(ranked[i].plays).toBeGreaterThanOrEqual(
            d.rankings[category].minimum_plays,
          );
          if (i) expect(ranked[i].epa).toBeLessThanOrEqual(ranked[i - 1].epa);
        }
      }
    }
  });
  it("rejects altered indexes and unsupported seasons", async () => {
    const s = catalog.seasons[0],
      raw = fs.readFileSync(root + s.file);
    await expect(verifyPlayerIndex(bytes(raw), 1900, catalog)).rejects.toThrow(
      "supported",
    );
    await expect(
      verifyPlayerIndex(
        bytes(Buffer.concat([raw, Buffer.from(" ")])),
        s.season,
        catalog,
      ),
    ).rejects.toThrow("different editions");
    await expect(
      verifyPlayerIndex(bytes(raw), s.season, {
        ...catalog,
        seasons: catalog.seasons.map((y) => ({ ...y, player_team_records: 0 })),
      }),
    ).rejects.toThrow("coverage");
  });
});
