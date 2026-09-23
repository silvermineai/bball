import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import RecruitingStudyPath, { recruitingStudySteps } from "./RecruitingStudyPath";

describe("recruiting study path", () => {
  it("keeps the workflow in four source-bound checks", () => {
    expect(recruitingStudySteps).toHaveLength(4);
    expect(recruitingStudySteps.map((step) => step.number)).toEqual(["01", "02", "03", "04"]);
    expect(recruitingStudySteps.map((step) => step.href)).toEqual([
      "/basketball/recruiting/#prospect-board-table",
      "/basketball/recruiting/#recruiting-coverage-table",
      "/basketball/roster-board/",
      "/basketball/recruiting/fit/",
    ]);
  });

  it("renders each step and keeps the evidence boundary visible", () => {
    const html = renderToStaticMarkup(createElement(RecruitingStudyPath));
    expect(html).toContain("Four checks before a recruiting conclusion.");
    expect(html).toContain("A published event describes what was recorded");
    expect(html).toContain("Missing joins remain unavailable rather than zero.");
    for (const step of recruitingStudySteps) {
      expect(html).toContain(step.title);
      const renderedHref = step.href.replace(/\/(?=#)/, "").replace(/\/$/, "");
      expect(html).toContain(`href=\"${renderedHref}\"`);
    }
  });
});
