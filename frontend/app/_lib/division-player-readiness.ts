export type DivisionPlayerAsset = {
  asset: string;
  dataset?: string | null;
  rows: number;
  division_fields?: string[];
  identity_fields?: string[];
  receipt?: { valid?: boolean; sha256?: string | null; url?: string | null };
};

export type DivisionPlayerAssetGate = {
  asset: string;
  dataset: string;
  rows: number;
  status: "ready" | "blocked";
  reasons: string[];
};

export type DivisionPlayerReadiness = {
  candidates: number;
  ready: number;
  blocked: number;
  status: "ready" | "blocked";
  gates: DivisionPlayerAssetGate[];
};

const playerDatasetPattern = /(^|[^a-z])(players?|athletes?)(?=[^a-z]|$)/i;
const requiredIdentityFields = ["team_id", "team_display_name", "athlete_id", "athlete_display_name"];

const hasExplicitDivision = (fields: readonly string[]) => fields.some((field) =>
  ["division", "division_id", "division_code", "source_division"].includes(field.toLowerCase()),
);

/**
 * Check a retained candidate player asset against the D2/D3 import contract.
 * Dataset names alone never establish a division; the release must expose an
 * explicit division field, stable team/athlete identities, and a valid receipt.
 */
export function assessDivisionPlayerAsset(asset: DivisionPlayerAsset): DivisionPlayerAssetGate | null {
  const dataset = asset.dataset || asset.asset;
  if (!playerDatasetPattern.test(dataset)) return null;
  const reasons: string[] = [];
  if (!hasExplicitDivision(asset.division_fields || [])) reasons.push("explicit division field is missing");
  const identityFields = new Set((asset.identity_fields || []).map((field) => field.toLowerCase()));
  const missingIdentity = requiredIdentityFields.filter((field) => !identityFields.has(field));
  if (missingIdentity.length) reasons.push(`stable identity fields missing: ${missingIdentity.join(", ")}`);
  if (!asset.receipt?.valid || !asset.receipt.sha256 || !asset.receipt.url) reasons.push("valid receipt URL and SHA-256 are required");
  return {
    asset: asset.asset,
    dataset,
    rows: Number.isFinite(asset.rows) && asset.rows >= 0 ? asset.rows : 0,
    status: reasons.length ? "blocked" : "ready",
    reasons,
  };
}

/** Summarize only player-shaped assets; schedule/team/shot assets remain out of the player gate. */
export function divisionPlayerReadiness(assets: readonly DivisionPlayerAsset[]): DivisionPlayerReadiness {
  const gates = assets.map(assessDivisionPlayerAsset).filter((gate): gate is DivisionPlayerAssetGate => gate != null);
  const ready = gates.filter((gate) => gate.status === "ready").length;
  return {
    candidates: gates.length,
    ready,
    blocked: gates.length - ready,
    status: gates.length > 0 && ready === gates.length ? "ready" : "blocked",
    gates,
  };
}
