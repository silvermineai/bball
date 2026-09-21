import { describe, expect, it } from "vitest";
import { WOMENS_SOURCE_SCOPE_LABEL, WOMENS_SOURCE_SCOPE_NOTE } from "./womens-source-scope";

describe("women's source scope language", () => {
  it("makes the absent division field explicit", () => {
    expect(WOMENS_SOURCE_SCOPE_LABEL).toContain("DIVISION UNSPECIFIED");
    expect(WOMENS_SOURCE_SCOPE_NOTE).toContain("do not carry an explicit D1, D2 or D3 field");
    expect(WOMENS_SOURCE_SCOPE_NOTE).toContain("no division is inferred");
  });
});
