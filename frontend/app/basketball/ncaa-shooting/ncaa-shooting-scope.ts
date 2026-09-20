import {
  basketballScopeAvailable,
  type SportScope,
} from "../../_lib/sport-scope";

/** The retained court-coordinate shooting release is currently men’s D1 only. */
export function shootingArchiveAvailable(scope: SportScope) {
  return basketballScopeAvailable(scope);
}

/** Keep the shared sport tab’s scope visible when shooting filters update. */
export function shootingArchiveScopeParams(scope: SportScope) {
  const params = new URLSearchParams();
  params.set("gender", scope.gender);
  params.set("division", scope.division);
  return params;
}
