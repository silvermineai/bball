"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { filterLearningMetrics, type LearningMetric, type LearningTopic } from "../../_lib/metric-explorer";

const topicLabels: Record<LearningTopic | "all", string> = {
  all: "All measures",
  team: "Team and game",
  player: "Player production",
  impact: "Impact and lineups",
  recruiting: "Recruiting and roster",
  market: "Market literacy",
};

export default function MetricExplorer({ metrics }: { metrics: LearningMetric[] }) {
  const [query, setQuery] = useState("");
  const [topic, setTopic] = useState<LearningTopic | "all">("all");
  const [selectedName, setSelectedName] = useState(metrics[0]?.name || "");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedTopic = params.get("topic") as LearningTopic | null;
    if (requestedTopic && requestedTopic in topicLabels) setTopic(requestedTopic);
    setQuery(params.get("q") || "");
    setSelectedName(params.get("metric") || metrics[0]?.name || "");
    setHydrated(true);
  }, [metrics]);

  const filtered = useMemo(() => filterLearningMetrics(metrics, query, topic), [metrics, query, topic]);
  const selected = filtered.find((metric) => metric.name === selectedName) || filtered[0] || null;

  useEffect(() => {
    if (!hydrated) return;
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (topic !== "all") params.set("topic", topic);
    if (selected?.name) params.set("metric", selected.name);
    const value = params.toString();
    window.history.replaceState(window.history.state, "", value ? `${window.location.pathname}?${value}` : window.location.pathname);
  }, [hydrated, query, selected?.name, topic]);

  return (
    <section className="metric-explorer" aria-label="Searchable metric dictionary">
      <div className="toolbar">
        <label className="control">
          <span>SEARCH DEFINITIONS</span>
          <input
            type="search"
            maxLength={120}
            value={query}
            onChange={(event) => { setQuery(event.target.value); setSelectedName(""); }}
            placeholder="eFG%, RAPM, recruiting…"
          />
        </label>
        <label className="control">
          <span>TOPIC</span>
          <select value={topic} onChange={(event) => { setTopic(event.target.value as LearningTopic | "all"); setSelectedName(""); }}>
            {(Object.keys(topicLabels) as Array<LearningTopic | "all">).map((value) => <option key={value} value={value}>{topicLabels[value]}</option>)}
          </select>
        </label>
      </div>
      <div className="metric-explorer-layout">
        <div>
          <p className="note" aria-live="polite">{filtered.length} of {metrics.length} definitions · choose a row to focus the lesson.</p>
          <div className="metric-explorer-list" role="listbox" aria-label="Metric definitions">
            {filtered.map((metric) => (
              <button
                type="button"
                role="option"
                aria-selected={selected?.name === metric.name}
                className={`metric-explorer-row${selected?.name === metric.name ? " is-selected" : ""}`}
                key={metric.name}
                onClick={() => setSelectedName(metric.name)}
              >
                <span><strong>{metric.name}</strong><small>{topicLabels[metric.topic]}</small></span>
                <span className="metric-explorer-chevron" aria-hidden="true">→</span>
              </button>
            ))}
          </div>
          {!filtered.length && <p className="empty">No definitions match this search. Try a broader term or clear the topic.</p>}
        </div>
        <aside className="paper-panel metric-explorer-detail" aria-live="polite">
          {selected ? <>
            <div className="eyebrow">{topicLabels[selected.topic]} / Selected measure</div>
            <h3>{selected.name}</h3>
            <p><strong>What it means.</strong> {selected.value}</p>
            <p><strong>How to use it.</strong> {selected.use}</p>
            <Link href={selected.href}>Open the evidence →</Link>
          </> : <p className="empty">Select a definition to see its evidence handoff.</p>}
        </aside>
      </div>
    </section>
  );
}
