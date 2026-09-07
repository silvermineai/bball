import { DEFAULT_SPORT } from "@/lib/sports";
import { useEffect, useState } from "react";

const STORAGE_KEY = "silvermine:selectedSport";

export function useSelectedSport() {
  const [sport, setSportState] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_SPORT;
    return window.localStorage.getItem(STORAGE_KEY) || DEFAULT_SPORT;
  });

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, sport);
  }, [sport]);

  return [sport, setSportState] as const;
}
