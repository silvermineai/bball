"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type LearningStep = {
  id: string;
  label: string;
  href: string;
  track: string;
};

const steps: LearningStep[] = [
  { id: "frame-game", label: "Frame the next matchup", href: "/basketball/matchups/", track: "Game planner" },
  { id: "four-factors", label: "Test the Four Factors", href: "/basketball/learn/#four-factors", track: "Game planner" },
  { id: "find-player", label: "Find a source player", href: "/basketball/players/", track: "Player researcher" },
  { id: "rank-production", label: "Choose a ranking lens", href: "/basketball/ncaa-rankings/", track: "Player researcher" },
  { id: "dated-evidence", label: "Read dated recruiting evidence", href: "/basketball/recruiting/", track: "Recruiting analyst" },
  { id: "role-shortlist", label: "Build a role shortlist", href: "/basketball/recruiting/fit/", track: "Recruiting analyst" },
  { id: "read-model", label: "Read the forecast model", href: "/basketball/model/", track: "Methods reader" },
  { id: "inspect-holdouts", label: "Inspect held-out results", href: "/basketball/evaluation/", track: "Methods reader" },
];

const STORAGE_KEY = "silvermine-learning-progress-v1";

export default function LearningProgress() {
  const [completed, setCompleted] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const completedSet = useMemo(() => new Set(completed), [completed]);

  useEffect(() => {
    try {
      const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]") as unknown;
      if (Array.isArray(stored)) setCompleted(stored.filter((value): value is string => typeof value === "string" && steps.some((step) => step.id === value)));
    } catch {
      // Private progress is optional; an unavailable storage API should not block the guide.
    } finally {
      setHydrated(true);
    }
  }, []);

  const toggle = (id: string) => {
    setCompleted((current) => {
      const next = current.includes(id) ? current.filter((value) => value !== id) : [...current, id];
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Keep the current session usable when local storage is blocked.
      }
      return next;
    });
  };

  const count = completed.length;
  return (
    <section className="paper-panel learning-progress" aria-labelledby="learning-progress-title">
      <div className="section-heading">
        <div>
          <div className="eyebrow">Your study desk</div>
          <h2 id="learning-progress-title">Pick up where you left off.</h2>
        </div>
        <span className="note">Browser only · never uploaded</span>
      </div>
      <p>
        Mark a lesson complete as you work through the four routes. The checklist stays on this device and only organizes your reading; it does not change a forecast, ranking or recruiting record.
      </p>
      <div className="learning-progress-meter" role="status" aria-live="polite">
        <div><strong>{count} of {steps.length}</strong><span>lessons checked</span></div>
        <progress max={steps.length} value={count} aria-label={`${count} of ${steps.length} lessons checked`} />
        {hydrated && count > 0 && <button className="hero-link" type="button" onClick={() => { setCompleted([]); try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* optional storage */ } }}>Clear progress</button>}
      </div>
      <div className="learning-progress-grid">
        {steps.map((step) => (
          <div className={`learning-progress-step${completedSet.has(step.id) ? " is-complete" : ""}`} key={step.id}>
            <input id={`learning-step-${step.id}`} type="checkbox" name={`learning-step-${step.id}`} checked={completedSet.has(step.id)} onChange={() => toggle(step.id)} />
            <div><small>{step.track}</small><div><label htmlFor={`learning-step-${step.id}`}>{step.label}</label>{" "}<Link href={step.href} aria-label={`Open ${step.label}`}>↗</Link></div></div>
          </div>
        ))}
      </div>
    </section>
  );
}
