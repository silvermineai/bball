import Link from "next/link";

export type RecruitingStudyStep = {
  number: string;
  title: string;
  description: string;
  href: string;
  linkLabel: string;
};

/**
 * A short evidence-first route for readers who land on the recruiting board
 * without knowing which table to open first. The links intentionally point at
 * existing source-bound views; this component does not create a new ranking.
 */
export const recruitingStudySteps: RecruitingStudyStep[] = [
  {
    number: "01",
    title: "Find the recorded class",
    description:
      "Filter the national prospect release by class, position, rank, movement or destination. Start with the source edition and exact athlete ID.",
    href: "/basketball/recruiting/#prospect-board-table",
    linkLabel: "Open the prospect table",
  },
  {
    number: "02",
    title: "Check the evidence date",
    description:
      "Read the dated school and roster observations beside the prospect row. A published event describes what was recorded; it does not establish eligibility or a future role.",
    href: "/basketball/recruiting/#recruiting-coverage-table",
    linkLabel: "Review dated evidence",
  },
  {
    number: "03",
    title: "Measure prior work",
    description:
      "Open the exact player record and compare games, minutes and rates from the retained college sample. Missing joins remain unavailable rather than zero.",
    href: "/basketball/roster-board/",
    linkLabel: "Open roster workload",
  },
  {
    number: "04",
    title: "Test the role fit",
    description:
      "Use source-listed workload and production percentiles to make a shortlist, then write the film or availability question that still needs confirmation.",
    href: "/basketball/recruiting/fit/",
    linkLabel: "Build a role shortlist",
  },
];

export default function RecruitingStudyPath() {
  return (
    <section className="section" aria-labelledby="recruiting-study-path-title">
      <div className="section-heading">
        <div>
          <div className="eyebrow">Recruiting workflow / evidence first</div>
          <h2 id="recruiting-study-path-title">Four checks before a recruiting conclusion.</h2>
        </div>
        <span className="note">Every step keeps its source boundary</span>
      </div>
      <p className="note">
        Use the sequence when you are learning a player or building a staff
        shortlist. The board connects exact records where the data supports it
        and leaves the next question visible when it does not.
      </p>
      <div className="learning-path-grid">
        {recruitingStudySteps.map((step) => (
          <article className="learning-path" key={step.number}>
            <div className="learning-path-topline">
              <span className="learning-path-number">{step.number}</span>
              <span className="eyebrow">Recruiting check</span>
            </div>
            <h3>{step.title}</h3>
            <p>{step.description}</p>
            <Link href={step.href}>{step.linkLabel} <span aria-hidden="true">↗</span></Link>
          </article>
        ))}
      </div>
    </section>
  );
}
