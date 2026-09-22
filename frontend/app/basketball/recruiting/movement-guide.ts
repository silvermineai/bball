export type MovementGuideStatus = "different_program" | "new_to_dataset";

export type MovementGuideInput = {
  season: number;
  status: MovementGuideStatus;
  matchingCount: number;
  playersObserved: number;
};

export type MovementGuideRow = {
  key: "identity" | "status" | "workload";
  signal: string;
  observed: string;
  establishes: string;
  boundary: string;
};

const whole = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) >= 0;

/**
 * Explain the movement archive from the exact fields it exposes. A guide is
 * withheld when its denominator cannot be reconciled, so the copy cannot
 * turn an incomplete response into a transfer, commitment or role claim.
 */
export function movementEvidenceGuide(
  input: MovementGuideInput,
): MovementGuideRow[] {
  if (
    !whole(input.season) || input.season < 2000 ||
    !whole(input.matchingCount) || !whole(input.playersObserved) ||
    input.matchingCount > input.playersObserved ||
    (input.status !== "different_program" && input.status !== "new_to_dataset")
  ) {
    return [];
  }

  const status = input.status === "different_program"
    ? {
        signal: "Changed-program observation",
        establishes: "The same retained player ID appears with a different listed program across the editions compared by this archive.",
        boundary: "It does not establish a portal transaction, commitment, eligibility, enrollment or future availability.",
      }
    : {
        signal: "New-to-dataset observation",
        establishes: "No matching prior player ID was observed in the retained comparison edition for this row.",
        boundary: "It does not establish that the athlete is a freshman, a transfer, or new to college basketball; the prior record may be outside this archive.",
      };

  return [
    {
      key: "identity",
      signal: "Exact player identity",
      observed: `${input.matchingCount.toLocaleString()} matching observation${input.matchingCount === 1 ? "" : "s"} in the selected status · ${input.playersObserved.toLocaleString()} player IDs in the archive`,
      establishes: "Rows are interpreted through the player ID supplied by the roster observation release, with the listed program kept as a separate field.",
      boundary: "A name match alone is not enough; an unavailable or ambiguous ID should remain unavailable rather than being joined by guesswork.",
    },
    {
      key: "status",
      signal: status.signal,
      observed: `Selected ${input.season} roster observation`,
      establishes: status.establishes,
      boundary: status.boundary,
    },
    {
      key: "workload",
      signal: "Prior workload and production",
      observed: "Minutes, games and prior stat fields are historical observations when present on a row.",
      establishes: "Those values describe recorded prior usage and production for study or comparison.",
      boundary: "They do not project next-season minutes, role, fit or performance; a missing denominator stays unavailable rather than zero.",
    },
  ];
}
