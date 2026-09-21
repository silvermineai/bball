/**
 * Scope language for the retained women's bulk releases.
 *
 * The player, team and schedule files are women’s basketball releases, but
 * they do not carry an explicit D1/D2/D3 field. Keep this boundary in one
 * place so a component cannot imply a division from a team name or source
 * path.
 */
export const WOMENS_SOURCE_SCOPE_LABEL = "SOURCE-NATIVE · DIVISION UNSPECIFIED";

export const WOMENS_SOURCE_SCOPE_NOTE =
  "The retained women’s bulk releases do not carry an explicit D1, D2 or D3 field. These rows remain source-native women’s basketball data; no division is inferred.";
