import { describe, expect, it } from "vitest";
import { toCsv } from "./csv";

describe("toCsv", () => {
  it("escapes commas, quotes, and line breaks", () => {
    expect(
      toCsv(["Player", "Program", "Net"], [
        ["Ava, O'Neil", 'North "State"', 4.2],
        ["Line\nBreak", null, undefined],
      ]),
    ).toBe(
      'Player,Program,Net\r\n"Ava, O\'Neil","North ""State""",4.2\r\n"Line\nBreak",,',
    );
  });
});
