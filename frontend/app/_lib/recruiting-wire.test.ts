import { describe, expect, it } from "vitest";
import { filterRecruitingWire, parseRecruitingWireFilters, recruitingWireFilterSearch, type RecruitingWireArticle } from "./recruiting-wire";

const article = (headline: string, description = "") : RecruitingWireArticle => ({ id: headline, headline, description, published: "2026-06-01T00:00:00Z", link: "https://example.com", categories: ["NCAA Men's Basketball"] });

describe("recruiting wire filters", () => {
  it("round-trips shareable topic and page controls", () => {
    const search = recruitingWireFilterSearch({ query: "portal", topic: "transfer", page: 2 });
    expect(search).toBe("?wireQ=portal&wireTopic=transfer&wirePage=2");
    expect(parseRecruitingWireFilters(search)).toEqual({ query: "portal", topic: "transfer", page: 2 });
  });
  it("filters topic text and rejects invalid values", () => {
    expect(filterRecruitingWire([article("Transfer portal winners"), article("2027 recruiting class")], { query: "", topic: "transfer", page: 0 }).map((row) => row.id)).toEqual(["Transfer portal winners"]);
    expect(parseRecruitingWireFilters("?wireTopic=nope&wirePage=-1")).toEqual({ query: "", topic: "all", page: 0 });
  });
});
