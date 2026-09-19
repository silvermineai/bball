import { describe, expect, it } from "vitest";
import { publicArchiveArticle, publicArchiveText } from "./public-text";

describe("public archive text", () => {
  it("removes provider names and URLs from retained copy", () => {
    expect(publicArchiveText("ESPN and NCAA.com report https://example.com"))
      .toBe("the reporting desk and the national archive report archived media");
  });

  it("keeps ordinary statistical prose unchanged", () => {
    expect(publicArchiveText("Four Factors explain the matchup."))
      .toBe("Four Factors explain the matchup.");
  });

  it("whitelists and sanitizes initial article payloads before server serialization", () => {
    const article = publicArchiveArticle({
      id: "story-1",
      headline: "NCAA.com update",
      description: "ESPN report https://example.com <img src='https://example.com/a.jpg'>",
      published: "2026-09-19T00:00:00Z",
      categories: ["NCAA Men's Basketball"],
      sport: "mens-college-basketball",
      division: "D-I",
      author: "NCAA staff",
      publisher: "ESPN",
      link: "https://example.com/story",
    } as Parameters<typeof publicArchiveArticle>[0] & { author: string; publisher: string; link: string });
    const serialized = JSON.stringify(article);

    expect(serialized).not.toMatch(/ESPN|NCAA(?:\.com)?|https?:\/\//i);
    expect(serialized).not.toContain("author");
    expect(serialized).not.toContain("publisher");
    expect(serialized).not.toContain("<img");
  });
});
