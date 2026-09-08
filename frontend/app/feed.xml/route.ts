import { getBasketball } from "../_lib/basketball-data";
import { getOverview } from "../_lib/data";

export const dynamic = "force-static";

const base = "https://bball.silvermine.dev";
const guideItems = [
  ["reading-the-forecast", "What a preseason model knows. And what it misses.", "A practical guide to reading forecast evidence and its limits."],
  ["understanding-player-epa", "Production is a question of context.", "How to read player production with workload and expected points context."],
  ["market-comparison", "Before measuring an edge, check the clock.", "Why capture time and source provenance matter for model-versus-market research."],
  ["basketball-four-factors", "Read the matchup before you read the score.", "A field guide to Four Factors, pace, forecast ranges and roster evidence."],
  ["basketball-impact", "Read impact with the lineup context intact.", "How to use ORAPM, DRAPM, net RAPM and possession samples."],
  ["basketball-recruiting-workload", "An announcement is a starting point, not a depth chart.", "How to connect school statements, roster observations and prior workload."],
  ["basketball-player-rates", "A rate is only as useful as its denominator.", "How to read player efficiency and impact rankings responsibly."],
] as const;

function escapeXml(value: string) {
  return value.replace(/[<>&'\"]/g, (character) => ({
    "<": "&lt;",
    ">": "&gt;",
    "&": "&amp;",
    "'": "&apos;",
    '"': "&quot;",
  })[character]!);
}

function item(title: string, url: string, description: string, published: string) {
  return `<item><title>${escapeXml(title)}</title><link>${escapeXml(url)}</link><guid isPermaLink="true">${escapeXml(url)}</guid><description>${escapeXml(description)}</description><pubDate>${escapeXml(new Date(published).toUTCString())}</pubDate></item>`;
}

export function GET() {
  const football = getOverview();
  const basketball = getBasketball();
  const generated = football.generated_at;
  const entries = [
    ...guideItems.map(([slug, title, description]) => item(title, `${base}/blog/${slug}/`, description, generated)),
    ...football.upcoming
      .filter((game) => game.prediction)
      .slice(0, 20)
      .map((game) => item(
        `${game.away_name} at ${game.home_name}: forecast notebook`,
        `${base}/blog/game-${game.id}/`,
        `Projected score, unit efficiency and scouting questions for ${game.away_name} at ${game.home_name}.`,
        game.kickoff,
      )),
    ...basketball.upcoming
      .filter((game) => game.prediction)
      .slice(0, 20)
      .map((game) => item(
        `${game.away_name} at ${game.home_name}: basketball brief`,
        `${base}/basketball/briefs/${game.id}/`,
        `Projected score, pace, Four Factors and roster evidence for ${game.away_name} at ${game.home_name}.`,
        game.starts_at,
      )),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>The Coaching Annual · Silvermine Research</title><link>${base}/blog/</link><description>College football and basketball forecasts, player production and recruiting research.</description><language>en-us</language><lastBuildDate>${escapeXml(new Date(generated).toUTCString())}</lastBuildDate>${entries.join("")}</channel></rss>`;
  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8", "Cache-Control": "public, max-age=300" } });
}
