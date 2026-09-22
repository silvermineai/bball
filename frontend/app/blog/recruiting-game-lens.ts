import type { BBGame, BBRosterModel, BBRosterScenario } from "../_lib/basketball-types";

export type RecruitingGameLens = {
  game: BBGame;
  scenario: BBRosterScenario;
};

/**
 * Select upcoming games where the roster-continuity challenger can be read
 * beside the same-edition primary forecast. Exact game and team IDs keep a
 * stale or cross-game scenario from becoming recruiting commentary.
 */
export function selectRecruitingGameLenses(
  games: BBGame[],
  model: Pick<BBRosterModel, "primary_model_id">,
  scenarios: BBRosterScenario[],
  limit = 6,
): RecruitingGameLens[] {
  if (!Number.isSafeInteger(limit) || limit <= 0) return [];
  const scenariosByGame = new Map<string, BBRosterScenario>();
  for (const scenario of scenarios) {
    if (!scenario || scenario.primary_model_id !== model.primary_model_id) continue;
    if (!scenario.game_id || scenariosByGame.has(scenario.game_id)) continue;
    if (![scenario.base_margin, scenario.roster_margin, scenario.margin_delta].every(Number.isFinite)) continue;
    scenariosByGame.set(scenario.game_id, scenario);
  }
  return games
    .flatMap((game): RecruitingGameLens[] => {
      const scenario = scenariosByGame.get(game.id);
      if (!scenario || !game.prediction) return [];
      if (scenario.home_id !== game.home_id || scenario.away_id !== game.away_id) return [];
      return [{ game, scenario }];
    })
    .sort((a, b) => Math.abs(b.scenario.margin_delta) - Math.abs(a.scenario.margin_delta) || a.game.starts_at.localeCompare(b.game.starts_at) || a.game.id.localeCompare(b.game.id))
    .slice(0, limit);
}
