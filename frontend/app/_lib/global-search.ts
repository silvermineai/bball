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

const resultKey = (result: SearchResult) => `${result.type}|${result.sport || ""}|${result.href}`;

/**
 * Merge source-backed records into a small, useful search list.
 *
 * The API intentionally returns several source namespaces for one query. A
 * route is the strongest identity we have in the browser, so remove repeated
 * routes while retaining the first (highest quality) source result. When a
 * query is supplied, exact and prefix matches rise above broad substring
 * matches; this keeps an exact program visible even when several player
 * sources match the same word.
 */
export function combineSearchResults(
  players: SearchResult[],
  programs: SearchResult[],
  limit = 8,
  query = "",
): SearchResult[] {
  const seen = new Set<string>();
  const unique = [...players, ...programs].filter((result) => {
    const key = resultKey(result);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const needle = normalize(query);
  if (!needle) return unique.slice(0, limit);
  return unique
    .map((result, index) => ({ result, index }))
    .sort((a, b) => {
      const rank = (result: SearchResult) => {
        const name = normalize(result.name);
        return name === needle ? 0 : name.startsWith(needle) ? 1 : 2;
      };
      return rank(a.result) - rank(b.result) || a.index - b.index;
    })
    .slice(0, limit)
    .map(({ result }) => result);
}
