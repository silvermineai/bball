import type { BBGame } from "./basketball-types";

export type ForecastEditionDefaults = {
  modelId?: string | null;
  generatedAt?: string | null;
};

export type ForecastEdition = {
  modelId: string | null;
  generatedAt: string | null;
};

function usableId(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function usableClock(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && Number.isFinite(Date.parse(trimmed)) ? trimmed : null;
}

/**
 * Resolve the edition attached to a game, with the bundled overview edition
 * as an explicit fallback for static rows that predate per-game metadata.
 * Invalid clocks and blank IDs stay unavailable instead of being rendered as
 * if they were trustworthy forecast evidence.
 */
export function resolveForecastEdition(
  game: Pick<BBGame, "forecast_model_id" | "forecast_created_at">,
  defaults: ForecastEditionDefaults = {},
): ForecastEdition {
  return {
    modelId: usableId(game.forecast_model_id) ?? usableId(defaults.modelId),
    generatedAt: usableClock(game.forecast_created_at) ?? usableClock(defaults.generatedAt),
  };
}
