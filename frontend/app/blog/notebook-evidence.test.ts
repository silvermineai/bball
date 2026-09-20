import { describe, expect, it } from "vitest";
import type { RecruitingRelease } from "../_lib/recruiting";
import type { ShotSeason } from "../_lib/shooting";
import type { NotebookRecentForm } from "./notebook-form";
import { buildNotebookEvidenceRows } from "./notebook-evidence";

const recentForm = {
  sourceEdition: "scouting-edition-1",
  generatedAt: "2026-09-19T12:00:00Z",
  modelId: "scouting-model-1",
  home: { id: "10", name: "Home", season: {}, lastFive: {} },
  away: { id: "20", name: "Away", season: {}, lastFive: {} },
} as unknown as NotebookRecentForm;

const recruiting = {
  season: 2027,
  edition: "b".repeat(64),
  reviewed_at: "2026-09-18T12:00:00Z",
  programs: [{ id: "10", name: "Home" }, { id: "20", name: "Away" }],
  people: [{ team_id: "10" }, { team_id: "20" }, { team_id: "99" }],
  sources: [{ team_id: "10" }, { team_id: "20" }],
} as unknown as RecruitingRelease;

const shotEdition = {
  season: 2026,
  source: { fetched_at: "2026-09-17T12:00:00Z", sha256: "c".repeat(64) },
} as unknown as ShotSeason;

const base = {
  homeId: "10",
  awayId: "20",
  forecastModelId: "forecast-1",
  forecastCapturedAt: "2026-09-20T12:00:00Z",
  recentForm,
  historicalPlayerCount: 6,
  shotEdition,
  shotPlayerJoins: 4,
  shotAttempts: 120,
  shotLocated: 90,
  recruiting,
  rosterSource: { dataset: "rosters", url: null, fetched_at: "2026-09-18T12:00:00Z", sha256: "d".repeat(64) },
  rosterSeason: 2027,
  rosterRows: 24,
};

describe("notebook evidence chain", () => {
  it("keeps model editions distinct from verified source receipts", () => {
    const rows = buildNotebookEvidenceRows(base);
    expect(rows.map((row) => row.status)).toEqual(["edition", "edition", "verified", "verified", "verified"]);
    expect(rows.find((row) => row.key === "forecast")?.receipt).toBe("forecast-1");
    expect(rows.find((row) => row.key === "shots")?.receipt).toBe("c".repeat(64));
    expect(rows.find((row) => row.key === "recruiting")?.coverage).toContain("2/2 exact programs");
  });

  it("withholds a shot release when its digest or capture clock is invalid", () => {
    const rows = buildNotebookEvidenceRows({
      ...base,
      shotEdition: { ...shotEdition, source: { fetched_at: "not-a-date", sha256: "not-a-digest" } } as ShotSeason,
    });
    const shots = rows.find((row) => row.key === "shots");
    expect(shots?.status).toBe("unavailable");
    expect(shots?.receipt).toBe("Unavailable");
  });
});
