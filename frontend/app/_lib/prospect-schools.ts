export type ProspectProgram = {
  id: string;
  name: string;
  shortName?: string | null;
};

export type ProspectSchool = {
  id: string;
  name: string;
  committed: boolean;
  resolved: boolean;
};

/**
 * Resolve a prospect's retained school IDs against the site's program
 * directory. The source field is a school list, not proof of an offer or
 * active interest, so this helper deliberately adds no recruiting status.
 */
export function prospectSchools(
  schoolIds: unknown,
  programs: ProspectProgram[],
  committedTeamId: string | null,
): ProspectSchool[] {
  const byId = new Map(programs.map((program) => [String(program.id), program]));
  const ids = Array.isArray(schoolIds)
    ? Array.from(new Set(schoolIds
        .filter((id): id is string | number => typeof id === "string" || typeof id === "number")
        .map((id) => String(id).trim())
        .filter(Boolean)))
    : [];

  return ids
    .map((id) => {
      const program = byId.get(id);
      return {
        id,
        name: program?.shortName || program?.name || `Program ${id}`,
        committed: committedTeamId === id,
        resolved: Boolean(program),
      };
    })
    .sort((a, b) => Number(b.committed) - Number(a.committed) || a.name.localeCompare(b.name));
}
