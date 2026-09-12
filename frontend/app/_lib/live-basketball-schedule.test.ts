import { describe, expect, it, vi } from "vitest";
import type { BBGame } from "./basketball-types";
import { loadLiveBasketballScheduleClocks, mergeBasketballScheduleClocks } from "./live-basketball-schedule";

const game = (id: string): BBGame => ({
  id,
  season: 2027,
  starts_at: "2026-11-02T05:00:00Z",
  home_id: "home",
  away_id: "away",
  home_name: "Home",
  away_name: "Away",
  neutral: 0,
  time_tbd: 1,
  venue: "Arena",
  broadcast: "",
  prediction: null,
});

describe("live basketball schedule clocks", () => {
  it("loads and bounds scoreboard observations to numeric game IDs", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ total: 2, confirmed: false, confirmed_count: 1, rows: [
        { game_id: "401", source_start: "2026-11-02T05:00:00Z", source_time_valid: true },
        { game_id: "bad", source_start: null, source_time_valid: false },
      ] }),
    });
    vi.stubGlobal("fetch", fetcher);
    await expect(loadLiveBasketballScheduleClocks()).resolves.toEqual({
      total: 2,
      confirmed: false,
      confirmed_count: 1,
      rows: [{ game_id: "401", source_start: "2026-11-02T05:00:00Z", source_time_valid: true }],
    });
    expect(fetcher).toHaveBeenCalledWith(
      "/api/basketball/research/schedule-times?season=2027&limit=200",
      { signal: undefined },
    );
    vi.unstubAllGlobals();
  });

  it("adds source-clock evidence without rewriting the canonical game", () => {
    const merged = mergeBasketballScheduleClocks([game("401"), game("402")], [
      { game_id: "401", source_start: "2026-11-02T05:00:00Z", source_time_valid: true, observed_at: "2026-09-12T10:00:00Z" },
    ]);
    expect(merged[0].starts_at).toBe("2026-11-02T05:00:00Z");
    expect(merged[0].source_start).toBe("2026-11-02T05:00:00Z");
    expect(merged[0].source_time_valid).toBe(true);
    expect(merged[1].source_start).toBeUndefined();
  });
});
