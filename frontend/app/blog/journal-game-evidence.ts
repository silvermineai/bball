import type { BBGame } from "../_lib/basketball-types";

export type JournalScheduleEvidence = {
  label: "Source-confirmed start" | "Start time unconfirmed" | "Source clock unresolved" | "Canonical start only";
  detail: string;
  confirmed: boolean;
};

/** Keep the upcoming-game journal explicit about the timing evidence behind a row. */
export function journalScheduleEvidence(game: Pick<BBGame, "time_tbd" | "source_start" | "source_time_valid">): JournalScheduleEvidence {
  if (game.source_time_valid === true && game.source_start) {
    return {
      label: "Source-confirmed start",
      detail: "A recorded source clock is attached to this game.",
      confirmed: true,
    };
  }
  if (game.time_tbd) {
    return {
      label: "Start time unconfirmed",
      detail: "The forecast remains available, but market checks stay withheld until the start is confirmed.",
      confirmed: false,
    };
  }
  if (game.source_time_valid === false) {
    return {
      label: "Source clock unresolved",
      detail: "The schedule clock did not pass source validation; market checks stay withheld.",
      confirmed: false,
    };
  }
  return {
    label: "Canonical start only",
    detail: "No recorded source clock is attached; market checks stay withheld until timing evidence is available.",
    confirmed: false,
  };
}
