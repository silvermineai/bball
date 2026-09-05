"use client";
import { useEffect, useState } from "react";
export default function BriefNotebook({
  storageKey,
  tasks,
}: {
  storageKey: string;
  tasks: string[];
}) {
  const [notes, setNotes] = useState(""),
    [checks, setChecks] = useState<string[]>([]),
    [ready, setReady] = useState(false),
    [status, setStatus] = useState("Loading browser notes…");
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "{}");
      if (typeof saved.notes === "string")
        setNotes(saved.notes.slice(0, 20000));
      if (Array.isArray(saved.checks))
        setChecks(
          saved.checks.filter(
            (v: unknown) => typeof v === "string" && tasks.includes(v),
          ),
        );
      setStatus(
        "Saved only in this browser for this game and model edition. No account sync.",
      );
    } catch {
      setStatus("Browser notes could not be restored.");
    }
    setReady(true);
  }, [storageKey, tasks]);
  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify({ notes, checks }));
      setStatus(
        "Saved only in this browser for this game and model edition. No account sync.",
      );
    } catch {
      setStatus(
        "Browser storage is unavailable. Notes will not persist after leaving this page.",
      );
    }
  }, [storageKey, notes, checks, ready]);
  return (
    <section className="brief-notebook section">
      <div className="section-heading">
        <div>
          <div className="eyebrow">
            Your preparation / Private browser notes
          </div>
          <h2>Take it into the film room.</h2>
        </div>
        <button
          className="button secondary screen-only"
          onClick={() => window.print()}
        >
          Print scouting brief ↗
        </button>
      </div>
      <div className="two-col">
        <div className="brief-checklist">
          {tasks.map((task) => (
            <label key={task}>
              <input
                type="checkbox"
                checked={checks.includes(task)}
                disabled={!ready}
                onChange={(e) =>
                  setChecks(
                    e.target.checked
                      ? [...checks, task]
                      : checks.filter((t) => t !== task),
                  )
                }
              />
              <span>{task}</span>
            </label>
          ))}
        </div>
        <div>
          <label className="control screen-only">
            <span>SCOUTING NOTES</span>
            <textarea
              rows={7}
              maxLength={20000}
              value={notes}
              disabled={!ready}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Film timestamps, coverage questions, availability checks…"
            />
          </label>
          <p className="print-only brief-printed-notes">
            {notes || "No preparation notes added."}
          </p>
          <p className="note screen-only" role="status">
            {status}
          </p>
        </div>
      </div>
    </section>
  );
}
