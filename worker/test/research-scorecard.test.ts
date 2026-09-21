import { describe, expect, it, vi } from "vitest";
import { researchScorecard } from "../src/research-scorecard";

describe("live research scorecard", () => {
  it("returns the selected registration with parsed status and metrics", async () => {
    const selected = {
      id: "registration-1",
      sport: "basketball",
      game_id: "game-1",
      model_id: "model-1",
      generated_at: "2026-01-01T00:00:00.000000Z",
      registered_at: "2026-01-01T00:01:00.000000Z",
      starts_at: "2027-01-02T00:00:00.000000Z",
      time_tbd: 0,
      payload_json: JSON.stringify({
        home_id: "home",
        away_id: "away",
        home_name: "Home University",
        away_name: "Away College",
        season: 2027,
        prediction: { home_margin: 5, total: 145, home_win_probability: 0.7, margin_low: -8, margin_high: 18 },
      }),
      state_json: JSON.stringify({
        home_id: "home",
        away_id: "away",
        starts_at: "2027-01-02T00:00:00.000000Z",
        time_tbd: 0,
        completed: 0,
        home_score: null,
        away_score: null,
      }),
      exclusion: null,
    };
    const eligibleQuote = {
      id: "quote-1",
      sport: "basketball",
      game_id: "game-1",
      provider: "licensed-feed",
      bookmaker: "book-1",
      market: "spreads",
      captured_at: "2026-01-01T12:00:00.000000Z",
      updated_at: "2026-01-01T11:59:00.000000Z",
      payload_json: JSON.stringify({
        home_id: "home",
        away_id: "away",
        starts_at: "2027-01-02T00:00:00.000000Z",
        line: -3.5,
        home_price: 1.91,
        away_price: 1.91,
      }),
    };
    const preRegistrationQuote = {
      ...eligibleQuote,
      id: "quote-before-registration",
      captured_at: "2025-12-31T23:59:00.000000Z",
      updated_at: "2025-12-31T23:58:00.000000Z",
    };
    const supersededQuote = {
      ...eligibleQuote,
      id: "quote-superseded",
      captured_at: "2026-01-01T11:00:00.000000Z",
      updated_at: "2026-01-01T10:59:00.000000Z",
    };
    const invalidPricesQuote = {
      ...eligibleQuote,
      id: "quote-invalid-prices",
      bookmaker: "book-2",
      payload_json: JSON.stringify({
        home_id: "home",
        away_id: "away",
        starts_at: "2027-01-02T00:00:00.000000Z",
        line: -4,
        home_price: null,
        away_price: 1.91,
      }),
    };
    const prepare = vi.fn((sql: string) => {
      const first = async () => {
        if (sql.includes("MAX(CAST")) return { season: 2027 };
        if (sql.includes("audit_predictions")) return { total: 1 };
        if (sql.includes("audit_markets") && sql.includes("WHERE sport=?")) return { total: 7 };
        if (sql.includes("audit_unmatched") && sql.includes("WHERE sport=?")) return { total: 3 };
        return { total: 0 };
      };
      return {
        first,
        bind: (..._args: unknown[]) => ({
          first,
          all: async () => sql.includes("ROW_NUMBER() OVER")
            ? { results: [selected] }
            : sql.includes("SELECT id,sport,game_id,provider")
              ? { results: [supersededQuote, eligibleQuote, preRegistrationQuote, invalidPricesQuote] }
              : { results: [] },
        }),
      };
    });
    const response = await researchScorecard.request(
      "/?sport=basketball&season=2027&model=model-1&limit=5000",
      {},
      { RESEARCH_DB: { prepare } as never },
    );
    expect(response.status).toBe(200);
    const body = await response.json() as { live: boolean; model: string | null; total: number; market_observations: number; qualifying_market_observations: number; unmatched_events: number; games: Array<Record<string, unknown>>; sports: Record<string, Record<string, unknown>> };
    expect(body.live).toBe(true);
    expect(body.model).toBe("model-1");
    expect(body.total).toBe(1);
    expect(body.market_observations).toBe(7);
    expect(body.qualifying_market_observations).toBe(1);
    expect(body.unmatched_events).toBe(3);
    expect(body.games[0]).toMatchObject({ home_name: "Home University", status: "scheduled", home_margin: 5, home_win_probability: 0.7, comparisons: [expect.objectContaining({ market: "spreads", model_difference: 1.5 })] });
    expect(body.sports.basketball).toMatchObject({
      games: 1,
      registered_versions: 1,
      market_observations: 7,
      unmatched_events: 3,
      games_with_comparisons: 1,
      qualifying_market_observations: 1,
      settled_market_observations: 0,
      pending_market_observations: 1,
      pending_market_metrics: [{
        model_id: "model-1",
        market: "spreads",
        games: 1,
        model_difference_mean: 1.5,
        market_overround_mean: expect.closeTo(1 / 1.91 + 1 / 1.91 - 1, 8),
      }],
    });
    expect(body.sports.basketball.comparison_readiness).toEqual({
      retained_observations: 7,
      selected_game_observations: 4,
      outside_selected_cohort: 3,
      eligible_observations: 3,
      comparable_observations: 2,
      superseded_observations: 1,
      selected_comparisons: 1,
      rejection_counts: {
        captured_before_registration: 1,
        invalid_prices: 1,
      },
    });
    expect(prepare.mock.calls.some(([sql]) => String(sql).includes("p.model_id=?"))).toBe(true);
    expect(prepare.mock.calls.some(([sql]) => String(sql).includes("registered_at<=? AND model_id=?"))).toBe(true);
  });

  it("publishes reliability and keeps model-edition results separate", async () => {
    const selected = {
      id: "registration-settled",
      sport: "basketball",
      game_id: "game-settled",
      model_id: "model-1",
      generated_at: "2026-01-01T00:00:00.000000Z",
      registered_at: "2026-01-01T00:01:00.000000Z",
      starts_at: "2026-01-02T00:00:00.000000Z",
      time_tbd: 0,
      payload_json: JSON.stringify({
        home_id: "home", away_id: "away", home_name: "Home", away_name: "Away", season: 2027,
        prediction: { home_margin: 5, total: 145, home_win_probability: 0.7, margin_low: -8, margin_high: 18 },
      }),
      state_json: JSON.stringify({ home_id: "home", away_id: "away", starts_at: "2026-01-02T00:00:00.000000Z", time_tbd: 0, completed: 1, home_score: 80, away_score: 70 }),
      exclusion: null,
    };
    const second = {
      ...selected,
      id: "registration-settled-2",
      game_id: "game-settled-2",
      model_id: "model-2",
      generated_at: "2026-01-03T00:00:00.000000Z",
      registered_at: "2026-01-03T00:01:00.000000Z",
      starts_at: "2026-01-04T00:00:00.000000Z",
      payload_json: JSON.stringify({
        home_id: "home-2", away_id: "away-2", home_name: "Home 2", away_name: "Away 2", season: 2027,
        prediction: { home_margin: -3, total: 132, home_win_probability: 0.2, margin_low: -15, margin_high: 9, estimate_type: "cold_start" },
      }),
      state_json: JSON.stringify({ home_id: "home-2", away_id: "away-2", starts_at: "2026-01-04T00:00:00.000000Z", time_tbd: 0, completed: 1, home_score: 60, away_score: 70 }),
    };
    const quotes = [
      {
        id: "quote-model-1", sport: "basketball", game_id: "game-settled", provider: "licensed-feed", bookmaker: "book-1", market: "spreads",
        captured_at: "2026-01-01T12:00:00.000000Z", updated_at: "2026-01-01T11:59:00.000000Z",
        payload_json: JSON.stringify({ home_id: "home", away_id: "away", starts_at: "2026-01-02T00:00:00.000000Z", line: -2, home_price: 1.91, away_price: 1.91 }),
      },
      {
        id: "quote-model-2", sport: "basketball", game_id: "game-settled-2", provider: "licensed-feed", bookmaker: "book-1", market: "spreads",
        captured_at: "2026-01-03T12:00:00.000000Z", updated_at: "2026-01-03T11:59:00.000000Z",
        payload_json: JSON.stringify({ home_id: "home-2", away_id: "away-2", starts_at: "2026-01-04T00:00:00.000000Z", line: 1, home_price: 1.91, away_price: 1.91 }),
      },
    ];
    const prepare = vi.fn((sql: string) => {
      const first = async () => {
        if (sql.includes("MAX(CAST")) return { season: 2027 };
        if (sql.includes("audit_predictions")) return { total: 2 };
        return { total: 0 };
      };
      return {
        first,
        bind: (..._args: unknown[]) => ({
          first,
          all: async () => sql.includes("ROW_NUMBER() OVER")
            ? { results: [selected, second] }
            : sql.includes("SELECT id,sport,game_id,provider")
              ? { results: quotes }
              : { results: [] },
        }),
      };
    });
    const response = await researchScorecard.request("/?sport=basketball&season=2027&limit=5000", {}, { RESEARCH_DB: { prepare } as never });
    expect(response.status).toBe(200);
    const body = await response.json() as { games: Array<Record<string, unknown>>; sports: { basketball: {
      metrics: { reliability: Array<{ lower: number; upper: number; games: number; predicted: number; observed: number }> };
      model_metrics: Array<Record<string, unknown>>;
      market_metrics: Array<Record<string, unknown>>;
      pending_market_metrics?: Array<Record<string, unknown>>;
      estimate_metrics: Array<Record<string, unknown>>;
    } } };
    expect(body.sports.basketball.metrics.reliability).toEqual([
      { lower: 0.2, upper: 0.3, games: 1, predicted: 0.2, observed: 0 },
      { lower: 0.7, upper: 0.8, games: 1, predicted: 0.7, observed: 1 },
    ]);
    expect(body.sports.basketball.metrics).toMatchObject({
      interval_games: 2,
      interval_coverage: 1,
      interval_mean_width: 25,
      expected_calibration_error: 0.25,
    });
    expect(body.sports.basketball.model_metrics).toMatchObject([
      { model_id: "model-2", selected_forecasts: 1, eligible_forecasts: 1, settled_games: 1, margin_mae: 7, interval_coverage: 1, interval_mean_width: 24 },
      { model_id: "model-1", selected_forecasts: 1, eligible_forecasts: 1, settled_games: 1, margin_mae: 5, interval_coverage: 1, interval_mean_width: 26 },
    ]);
    expect(body.sports.basketball.model_metrics[0].expected_calibration_error).toBeCloseTo(0.2);
    expect(body.sports.basketball.model_metrics[1].expected_calibration_error).toBeCloseTo(0.3);
    expect(body.sports.basketball.model_metrics[0].brier).toBeCloseTo(0.04);
    expect(body.sports.basketball.model_metrics[1].brier).toBeCloseTo(0.09);
    expect(body.sports.basketball.estimate_metrics).toMatchObject([
      { model_id: "model-2", estimate_type: "cold_start", selected_forecasts: 1, eligible_forecasts: 1, settled_games: 1, margin_mae: 7 },
      { model_id: "model-1", estimate_type: "primary", selected_forecasts: 1, eligible_forecasts: 1, settled_games: 1, margin_mae: 5 },
    ]);
    expect(body.games?.[0]?.estimate_type).toBe("primary");
    expect(body.sports.basketball.market_metrics).toMatchObject([
      { model_id: "model-1", provider: "licensed-feed", bookmaker: "book-1", market: "spreads", games: 1, model_mae: 5, market_mae: 8 },
      { model_id: "model-2", provider: "licensed-feed", bookmaker: "book-1", market: "spreads", games: 1, model_mae: 7, market_mae: 9 },
    ]);
    expect(body.sports.basketball.pending_market_metrics).toEqual([]);
  });

  it("uses a confirmed source clock to qualify a forecast whose canonical row was time TBD", async () => {
    const selected = {
      id: "registration-clocked",
      sport: "basketball",
      game_id: "game-clocked",
      model_id: "model-clocked",
      generated_at: "2026-09-19T00:00:00.000000Z",
      registered_at: "2026-09-19T00:01:00.000000Z",
      starts_at: "2026-11-02T05:00:00.000000Z",
      time_tbd: 1,
      source_start: "2026-11-02T18:00:00.000000Z",
      source_time_valid: 1,
      source_observed_at: "2026-09-19T12:00:00.000000Z",
      payload_json: JSON.stringify({
        home_id: "home-clocked", away_id: "away-clocked", home_name: "Home", away_name: "Away", season: 2027,
        prediction: { home_margin: 5, total: 145, home_win_probability: 0.7, margin_low: -8, margin_high: 18 },
      }),
      state_json: JSON.stringify({
        home_id: "home-clocked", away_id: "away-clocked", starts_at: "2026-11-02T05:00:00.000000Z", time_tbd: 1,
        completed: 0, home_score: null, away_score: null,
      }),
      exclusion: null,
    };
    const quote = {
      id: "quote-clocked",
      sport: "basketball",
      game_id: "game-clocked",
      provider: "ESPN Summary",
      bookmaker: "Public Book",
      market: "spreads",
      captured_at: "2026-09-20T12:30:00.000000Z",
      updated_at: "2026-09-20T12:29:00.000000Z",
      payload_json: JSON.stringify({
        home_id: "home-clocked", away_id: "away-clocked", starts_at: "2026-11-02T18:00:00.000000Z",
        line: -3.5, home_price: 1.91, away_price: 1.91,
      }),
    };
    const prepare = vi.fn((sql: string) => {
      const first = async () => {
        if (sql.includes("MAX(CAST")) return { season: 2027 };
        if (sql.includes("audit_predictions")) return { total: 1 };
        return { total: 0 };
      };
      return {
        first,
        bind: (..._args: unknown[]) => ({
          first,
          all: async () => {
            return sql.includes("FROM audit_predictions p")
              ? { results: [selected] }
              : sql.includes("audit_schedule_times")
                ? { results: [{ sport: "basketball", game_id: "game-clocked", source_start: "2026-11-02T18:00:00.000000Z", source_time_valid: 1, observed_at: "2026-09-19T12:00:00.000000Z" }] }
                : sql.includes("SELECT id,sport,game_id,provider")
                  ? { results: [quote] }
                  : { results: [] };
          },
        }),
      };
    });
    const response = await researchScorecard.request(
      "/?sport=basketball&season=2027&model=model-clocked&limit=5000",
      {},
      { RESEARCH_DB: { prepare } as never },
    );
    expect(response.status).toBe(200);
    const body = await response.json() as { games: Array<Record<string, unknown>>; sports: { basketball: { comparison_readiness: Record<string, unknown> } } };
    expect(body.games[0]).toMatchObject({
      status: "scheduled",
      exclusion: null,
      time_tbd: 0,
      starts_at: "2026-11-02T18:00:00.000Z",
      canonical_starts_at: "2026-11-02T05:00:00.000000Z",
      source_starts_at: "2026-11-02T18:00:00.000Z",
      source_time_valid: true,
      comparisons: [expect.objectContaining({ market: "spreads", model_difference: 1.5 })],
    });
    expect(body.sports.basketball.comparison_readiness).toMatchObject({
      selected_game_observations: 1,
      eligible_observations: 1,
      comparable_observations: 1,
      selected_comparisons: 1,
    });
    expect(prepare.mock.calls.some(([sql]) => String(sql).includes("audit_schedule_times") && String(sql).includes("latest_clock"))).toBe(true);

    const unconfirmed = { ...selected, source_start: null, source_time_valid: 0, exclusion: "unconfirmed_start" };
    const unconfirmedPrepare = vi.fn((sql: string) => {
      const first = async () => sql.includes("audit_predictions") ? { total: 1 } : { total: 0 };
      return {
        first,
        bind: (..._args: unknown[]) => ({
          first,
          all: async () => sql.includes("FROM audit_predictions p")
            ? { results: [unconfirmed] }
            : sql.includes("SELECT id,sport,game_id,provider")
              ? { results: [quote] }
              : { results: [] },
        }),
      };
    });
    const unconfirmedResponse = await researchScorecard.request(
      "/?sport=basketball&season=2027&model=model-clocked&limit=5000",
      {},
      { RESEARCH_DB: { prepare: unconfirmedPrepare } as never },
    );
    const unconfirmedBody = await unconfirmedResponse.json() as { games: Array<Record<string, unknown>> };
    expect(unconfirmedBody.games[0]).toMatchObject({ status: "excluded", exclusion: "unconfirmed_start", time_tbd: 1, comparisons: [] });
  });

  it("withholds null and invalid numeric evidence instead of coercing it into metrics", async () => {
    const incompleteFinal = {
      id: "registration-incomplete",
      sport: "basketball",
      game_id: "game-incomplete",
      model_id: "model-integrity",
      generated_at: "2026-01-01T00:00:00.000000Z",
      registered_at: "2026-01-01T00:01:00.000000Z",
      starts_at: "2026-01-02T00:00:00.000000Z",
      time_tbd: 0,
      payload_json: JSON.stringify({
        home_id: "home", away_id: "away", home_name: "Home", away_name: "Away", season: 2027,
        prediction: { home_margin: null, total: "", home_win_probability: 1.2, margin_low: 12, margin_high: -4 },
      }),
      state_json: JSON.stringify({
        home_id: "home", away_id: "away", starts_at: "2026-01-02T00:00:00.000000Z", time_tbd: 0,
        completed: 1, home_score: null, away_score: 70,
      }),
      exclusion: null,
    };
    const prepare = vi.fn((sql: string) => {
      const first = async () => {
        if (sql.includes("MAX(CAST")) return { season: 2027 };
        if (sql.includes("audit_predictions")) return { total: 1 };
        return { total: 0 };
      };
      return {
        first,
        bind: (..._args: unknown[]) => ({
          first,
          all: async () => sql.includes("ROW_NUMBER() OVER")
            ? { results: [incompleteFinal] }
            : { results: [] },
        }),
      };
    });
    const response = await researchScorecard.request("/?sport=basketball&season=2027&limit=5000", {}, { RESEARCH_DB: { prepare } as never });
    expect(response.status).toBe(200);
    const body = await response.json() as { games: Array<Record<string, unknown>>; sports: { basketball: { metrics: Record<string, unknown> } } };
    expect(body.games[0]).toMatchObject({
      status: "final_missing_scores",
      home_margin: null,
      total: null,
      home_win_probability: null,
      margin_low: null,
      margin_high: null,
      actual_margin: null,
      actual_total: null,
    });
    expect(body.sports.basketball.metrics).toMatchObject({
      games: 0,
      binary_games: 0,
      brier: null,
      interval_games: 0,
      interval_coverage: null,
      interval_mean_width: null,
      expected_calibration_error: null,
    });
  });

  it("returns a retryable response when the scorecard warehouse is busy", async () => {
    const response = await researchScorecard.request(
      "/?sport=basketball&season=2027",
      {},
      { RESEARCH_DB: { prepare: vi.fn(() => ({ bind: () => ({ first: vi.fn().mockRejectedValue(new Error("D1 busy")), all: vi.fn().mockRejectedValue(new Error("D1 busy")) }) })) } as never },
    );
    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ error: "The live research scorecard is temporarily unavailable." });
  });
});
