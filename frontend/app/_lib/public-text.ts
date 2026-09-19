/** Keep retained provider copy out of the public reading surface. */
export function publicArchiveText(value: string) {
  return value
    .replace(/<img\b[^>]*>/gi, "")
    .replace(/https?:\/\/[^\s"'<>]+/gi, "archived media")
    .replace(/\bESPN\b/gi, "the reporting desk")
    .replace(/\bNCAA(?:\.com)?\b/gi, "the national archive")
    .replace(/\bSportsDataverse\b/gi, "the archive")
    .replace(/\bCBBD\b/gi, "the archive")
    .replace(/\bCollegeFootballData\b/gi, "the college football archive");
}

export type PublicArchiveArticleInput = {
  id: string;
  headline: string;
  description: string;
  published: string;
  categories: string[];
  sport?: string;
  division?: "D-I" | "D-II" | "D-III";
};

/** Whitelist public article fields so hidden author/provider metadata is not serialized into page HTML. */
export function publicArchiveArticle(article: PublicArchiveArticleInput) {
  return {
    id: article.id,
    headline: publicArchiveText(article.headline),
    description: publicArchiveText(article.description),
    published: article.published,
    categories: article.categories.map(publicArchiveText),
    sport: article.sport,
    division: article.division,
  };
}
