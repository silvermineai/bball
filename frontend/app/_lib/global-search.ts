export type SearchProgram = { id: string; name: string };
export type SearchRecruitingPerson = { key: string; name: string; category?: string };

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

/** Find announced recruiting people without treating an announcement as a player identity join. */
export function searchRecruitingPeople(
  people: SearchRecruitingPerson[],
  query: string,
  limit = 4,
): SearchResult[] {
  const needle = normalize(query);
  if (!needle) return [];
  return people
    .filter((person) => normalize(person.name).includes(needle))
    .sort((a, b) => {
      const aName = normalize(a.name);
      const bName = normalize(b.name);
      return Number(!aName.startsWith(needle)) - Number(!bName.startsWith(needle)) || aName.localeCompare(bName) || a.key.localeCompare(b.key);
    })
    .slice(0, limit)
    .map((person) => ({
      id: `recruiting-${person.key}`,
      name: person.name,
      type: "player",
      sport: "basketball",
      detail: `Recruiting evidence${person.category ? ` · ${person.category.replaceAll("_", " ")}` : ""}`,
      href: `/basketball/recruiting/?q=${encodeURIComponent(person.name)}`,
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
