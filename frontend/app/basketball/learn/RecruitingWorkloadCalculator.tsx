"use client";

import { useMemo, useState } from "react";
import { recruitingWorkload } from "../../_lib/recruiting-workload";

const percent = (value: number | null) =>
  value == null ? "—" : `${(value * 100).toFixed(1)}%`;
const numberValue = (value: string) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};

export default function RecruitingWorkloadCalculator() {
  const [prior, setPrior] = useState("2400");
  const [returning, setReturning] = useState("1500");
  const [incoming, setIncoming] = useState("400");
  const result = useMemo(
    () => recruitingWorkload({
      priorMinutes: numberValue(prior),
      returningMinutes: numberValue(returning),
      incomingMinutes: numberValue(incoming),
    }),
    [incoming, prior, returning],
  );
  return (
    <section className="paper-panel recruiting-workload-calculator" aria-labelledby="recruiting-workload-title">
      <div className="section-heading">
        <div>
          <div className="eyebrow">Interactive recruiting lesson</div>
          <h2 id="recruiting-workload-title">Follow the minutes.</h2>
        </div>
        <span className="note">Browser only · no source claim</span>
      </div>
      <p>
        Enter the prior season&apos;s team minutes and the exact-ID minutes represented by the next roster snapshot. The worksheet shows why returning share, incoming workload and unrepresented minutes answer different questions.
      </p>
      <div className="manual-market-controls recruiting-workload-controls">
        <label className="control">
          <span>PRIOR TEAM MINUTES</span>
          <input inputMode="decimal" type="number" min="0" step="1" value={prior} onChange={(event) => setPrior(event.target.value)} />
          <small>The denominator from the recorded prior team sample.</small>
        </label>
        <label className="control">
          <span>RETURNING MINUTES</span>
          <input inputMode="decimal" type="number" min="0" step="1" value={returning} onChange={(event) => setReturning(event.target.value)} />
          <small>Prior minutes for source IDs listed at the same program.</small>
        </label>
        <label className="control">
          <span>INCOMING PRIOR MINUTES</span>
          <input inputMode="decimal" type="number" min="0" step="1" value={incoming} onChange={(event) => setIncoming(event.target.value)} />
          <small>Prior minutes for source IDs listed from another program.</small>
        </label>
      </div>
      <div className="raw-stat-grid recruiting-workload-results" aria-live="polite">
        <div><dt>{result.returningMinutes.toLocaleString()}</dt><dd>Returning minutes</dd><small>{percent(result.returningShare)} of prior denominator</small></div>
        <div><dt>{result.incomingMinutes.toLocaleString()}</dt><dd>Incoming prior minutes</dd><small>{percent(result.incomingShare)} of prior denominator</small></div>
        <div><dt>{result.representedMinutes.toLocaleString()}</dt><dd>Represented minutes</dd><small>{percent(result.representedShare)} combined coverage</small></div>
        <div><dt>{result.unrepresentedMinutes.toLocaleString()}</dt><dd>Unrepresented minutes</dd><small>Review queue, not a departure count</small></div>
      </div>
      <p className="note">
        The roster lab uses the same arithmetic on source-listed IDs. A represented minute is historical workload evidence; it does not establish a transfer, eligibility, availability or a future role. Incoming minutes can exceed the prior denominator in a hand-entered exercise, so review the source rows before drawing a continuity conclusion.
      </p>
    </section>
  );
}
