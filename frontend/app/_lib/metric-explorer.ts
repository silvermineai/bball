export type LearningTopic = "team" | "player" | "impact" | "recruiting" | "market";

export type LearningMetric = {
  name: string;
  value: string;
  use: string;
  topic: LearningTopic;
  href: string;
};

export function filterLearningMetrics(
  metrics: LearningMetric[],
  query: string,
  topic: LearningTopic | "all",
) {
  const needle = query.trim().toLowerCase();
  return metrics.filter((metric) => {
    if (topic !== "all" && metric.topic !== topic) return false;
    if (!needle) return true;
    return `${metric.name} ${metric.value} ${metric.use} ${metric.topic}`
      .toLowerCase()
      .includes(needle);
  });
}
