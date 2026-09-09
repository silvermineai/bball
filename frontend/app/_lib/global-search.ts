export type SearchProgram = { id: string; name: string };

export type SearchResult = {
  id: string;
  name: string;
  type: "player" | "program";
  sport?: "basketball" | "football";
  detail?: string;
  href: string;
};

const normalize = (value: string) => value.trim().toLocaleLowerCase();

/** Rank local program records for the global basketball search box. */
export function searchPrograms(
  programs: SearchProgram[],
  query: string,
  limit = 8,
): SearchResult[] {
  const needle = normalize(query);
  if (!needle) return [];
  return programs
    .filter((program) => normalize(program.name).includes(needle))
    .sort((a, b) => {
      const aName = normalize(a.name);
      const bName = normalize(b.name);
      const aStarts = aName.startsWith(needle) ? 0 : 1;
      const bStarts = bName.startsWith(needle) ? 0 : 1;
      return aStarts - bStarts || aName.localeCompare(bName);
    })
    .slice(0, limit)
    .map((program) => ({
      id: program.id,
      name: program.name,
      type: "program",
      sport: "basketball",
      detail: "Basketball program",
      href: `/basketball/programs/${encodeURIComponent(program.id)}/`,
    }));
}

/** Keep API player results ahead of local program matches, with a bounded list. */
export function combineSearchResults(
  players: SearchResult[],
  programs: SearchResult[],
  limit = 8,
): SearchResult[] {
  return [...players, ...programs].slice(0, limit);
}
