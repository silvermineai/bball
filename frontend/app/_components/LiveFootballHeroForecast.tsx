"use client";

import { useEffect, useState } from "react";
import { fmt } from "../_lib/format";

type Forecast = {
  game_id: string;
  week?: number | null;
  home_name: string;
  away_name: string;
  home_margin: number | null;
  total: number | null;
  home_win_probability: number | null;
};

type ForecastResponse = {
  rows?: Forecast[];
  latest_model?: { model_id?: string; created_at?: string | null } | null;
};

type Props = {
  fallback: {
    week?: number | null;
    home_name?: string | null;
    away_name?: string | null;
    home_score?: number | null;
    away_score?: number | null;
    home_win_probability?: number | null;
  };
};

export default function LiveFootballHeroForecast({ fallback }: Props) {
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/football/research/forecasts?season=2026&status=upcoming&limit=1&page=0", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("live forecast unavailable");
        return response.json() as Promise<ForecastResponse>;
      })
      .then((payload) => {
        if (!controller.signal.aborted) {
          setForecast(payload.rows?.[0] || null);
          setLive(Boolean(payload.rows?.[0]));
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setLive(false);
      });
    return () => controller.abort();
  }, []);

  const home = forecast?.home_name || fallback.home_name || "Home team";
  const away = forecast?.away_name || fallback.away_name || "Away team";
  const homeScore = forecast?.home_margin != null && forecast?.total != null
    ? (forecast.total + forecast.home_margin) / 2
    : fallback.home_score;
  const awayScore = forecast?.home_margin != null && forecast?.total != null
    ? (forecast.total - forecast.home_margin) / 2
    : fallback.away_score;
  const winProbability = forecast?.home_win_probability ?? fallback.home_win_probability;

  return (
    <div className="field-card" aria-label="Football forecast">
      <div className="eyebrow">On the board / week {forecast?.week ?? fallback.week ?? "—"}</div>
      <div className="score-line">
        <span>{away}</span>
        <strong>{fmt(awayScore)}</strong>
      </div>
      <div className="score-line">
        <span>{home}</span>
        <strong>{fmt(homeScore)}</strong>
      </div>
      <div className="field-note">
        {live ? "LIVE D1 MODEL ESTIMATE · NOT A RESULT" : "MODEL ESTIMATE · NOT A RESULT"}
        <br />
        HOME WIN PROBABILITY {fmt(winProbability == null ? null : winProbability * 100)}%
        <br />
        {live ? "Current forecast · uncertainty included" : "Calibrated score model · uncertainty included"}
      </div>
    </div>
  );
}
