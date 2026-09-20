export type SportGender = "men" | "women";
export type SportDivision = "1" | "2" | "3";

export type SportScope = {
  gender: SportGender;
  division: SportDivision;
};

type SearchValues = Record<string, string | string[] | undefined>;

const one = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

export function parseSportScope(values?: SearchValues | null): SportScope {
  const gender = one(values?.gender) === "women" ? "women" : "men";
  const rawDivision = one(values?.division);
  const division = rawDivision === "2" || rawDivision === "3" ? rawDivision : "1";
  return { gender, division };
}

/** Parse the URL form used by the shared sport navigation. */
export function parseSportScopeSearch(search: string): SportScope {
  const params = new URLSearchParams(search);
  return parseSportScope({
    gender: params.get("gender") || undefined,
    division: params.get("division") || undefined,
  });
}

export function scopeLabel(scope: SportScope) {
  return `${scope.gender === "women" ? "Women's" : "Men's"} · D${scope.division}`;
}

export function basketballScopeAvailable(scope: SportScope) {
  return scope.gender === "men" && scope.division === "1";
}

export function footballScopeAvailable(scope: SportScope) {
  return scope.gender === "men" && scope.division === "1";
}
