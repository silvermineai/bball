export type RecruitingWireArticle = {
  id: string;
  headline: string;
  description: string;
  published: string;
  link: string;
  categories: string[];
};
export type RecruitingWireTopic = "all" | "transfer" | "prep" | "draft" | "eligibility";
export type RecruitingWireFilters = { query: string; topic: RecruitingWireTopic; page: number };

const topics = new Set<RecruitingWireTopic>(["all", "transfer", "prep", "draft", "eligibility"]);
const topicWords: Record<Exclude<RecruitingWireTopic, "all">, RegExp> = {
  transfer: /transfer|portal|commit|signing|addition/i,
  prep: /recruit|prospect|class of|top 100|high school/i,
  draft: /nba draft|draft pick|draft withdrawal/i,
  eligibility: /eligib|redshirt|waiver|amateur/i,
};

export function parseRecruitingWireFilters(search: string): RecruitingWireFilters {
  const params = new URLSearchParams(search);
  const page = Number(params.get("wirePage"));
  const topic = params.get("wireTopic") as RecruitingWireTopic | null;
  return {
    query: params.get("wireQ") || "",
    topic: topic && topics.has(topic) ? topic : "all",
    page: Number.isInteger(page) && page >= 0 ? page : 0,
  };
}

export function recruitingWireFilterSearch(filters: RecruitingWireFilters) {
  const params = new URLSearchParams();
  if (filters.query.trim()) params.set("wireQ", filters.query.trim());
  if (filters.topic !== "all") params.set("wireTopic", filters.topic);
  if (filters.page > 0) params.set("wirePage", String(filters.page));
  const query = params.toString();
  return query ? `?${query}` : "";
}

export function filterRecruitingWire(articles: RecruitingWireArticle[], filters: RecruitingWireFilters) {
  const needle = filters.query.trim().toLowerCase();
  return articles.filter((article) => {
    const text = `${article.headline} ${article.description} ${article.categories.join(" ")}`;
    return (!needle || text.toLowerCase().includes(needle)) &&
      (filters.topic === "all" || topicWords[filters.topic].test(text));
  });
}
