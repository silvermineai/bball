"use client";

import { useEffect, useMemo, useState } from "react";

type Question = {
  prompt: string;
  choices: string[];
  answer: number;
  explanation: string;
  href: string;
  linkLabel: string;
};

const questions: Question[] = [
  {
    prompt: "A team has a lower Adj D than its opponent. What does that tell you first?",
    choices: ["It has allowed fewer opponent-adjusted points per 100 possessions.", "It will definitely win the next game.", "It plays at a faster tempo."],
    answer: 0,
    explanation: "Adjusted defense is a historical scoring-prevention estimate. It frames the matchup; it does not settle the result or describe pace.",
    href: "/basketball/ratings/",
    linkLabel: "Open team ratings",
  },
  {
    prompt: "Why should a player’s assist-to-turnover ratio be read with its turnover sample?",
    choices: ["A small turnover denominator can make the ratio unstable.", "The ratio is only valid for centers.", "Turnovers are already included in true shooting percentage."],
    answer: 0,
    explanation: "A ratio can look extreme when the denominator is tiny. Keep the games, minutes and turnover count beside the headline rate.",
    href: "/basketball/ncaa-rankings/?metric=ast_to",
    linkLabel: "Study player rates",
  },
  {
    prompt: "A forecast shows a narrow projected margin but a wide interval. How should a coach read it?",
    choices: ["The point estimate is useful, but the outcome uncertainty is still substantial.", "The model is more certain than a narrow interval suggests.", "The interval is a betting line and can be ignored."],
    answer: 0,
    explanation: "The interval describes held-out model error around the projection. Pair it with the model timestamp and the availability checks it cannot see.",
    href: "/basketball/evaluation/",
    linkLabel: "Review forecast evaluation",
  },
  {
    prompt: "What can a dated school announcement establish on a recruiting board?",
    choices: ["What the program publicly reported and when it reported it.", "NCAA eligibility and a guaranteed future role.", "That a missing roster row proves a player left."],
    answer: 0,
    explanation: "Recruiting evidence has boundaries. Keep the announcement, roster observation and prior production as separate layers until an authoritative source joins them.",
    href: "/basketball/recruiting/",
    linkLabel: "Open recruiting evidence",
  },
  {
    prompt: "When should a descriptive player rate remain unavailable?",
    choices: ["When the retained source is missing the denominator or the qualifying sample.", "Whenever the player is a freshman.", "Only when the player is not in the top 50."],
    answer: 0,
    explanation: "An unavailable value preserves the evidence boundary. It should not be turned into zero or filled from an unverified name match.",
    href: "/basketball/ncaa-rankings/",
    linkLabel: "Open ranking controls",
  },
];

const BEST_SCORE_KEY = "silvermine-learning-checkpoint-best-v1";

export default function LearningCheckpoint() {
  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [answered, setAnswered] = useState(0);
  const [complete, setComplete] = useState(false);
  const [bestScore, setBestScore] = useState<number | null>(null);
  const question = questions[current];
  const percent = useMemo(() => Math.round((answered / questions.length) * 100), [answered]);

  useEffect(() => {
    try {
      const stored = Number(window.localStorage.getItem(BEST_SCORE_KEY));
      if (Number.isInteger(stored) && stored >= 0 && stored <= questions.length) setBestScore(stored);
    } catch {
      // Private browsing modes can deny storage; the checkpoint remains usable for this visit.
    }
  }, []);
  useEffect(() => {
    if (!complete) return;
    setBestScore((value) => {
      const next = Math.max(value ?? 0, score);
      try {
        window.localStorage.setItem(BEST_SCORE_KEY, String(next));
      } catch {
        // A blocked storage API should never prevent the result from rendering.
      }
      return next;
    });
  }, [complete, score]);

  const choose = (choice: number) => {
    if (selected !== null) return;
    setSelected(choice);
    setAnswered((value) => value + 1);
    if (choice === question.answer) setScore((value) => value + 1);
  };
  const next = () => {
    if (current === questions.length - 1) setComplete(true);
    else { setCurrent((value) => value + 1); setSelected(null); }
  };
  const reset = () => { setCurrent(0); setSelected(null); setScore(0); setAnswered(0); setComplete(false); };

  return (
    <section className="learning-checkpoint" aria-labelledby="learning-checkpoint-title">
      <div className="learning-checkpoint-heading">
        <div>
          <div className="eyebrow">Coach&apos;s checkpoint</div>
          <h2 id="learning-checkpoint-title">Can you read the evidence?</h2>
          <p>Five quick questions reinforce the habits that keep a scouting note useful: qualify the sample, read the uncertainty and preserve each source boundary.</p>
        </div>
        {!complete && <span className="learning-checkpoint-progress">{answered} / {questions.length} answered{bestScore !== null ? ` · best ${bestScore}/${questions.length}` : ""}</span>}
      </div>
      {!complete ? (
        <>
          <div className="learning-checkpoint-meter" aria-label={`${percent}% complete`}><span style={{ width: `${percent}%` }} /></div>
          <div className="learning-checkpoint-question">
            <div className="eyebrow">Question {current + 1} of {questions.length}</div>
            <h3>{question.prompt}</h3>
            <div className="learning-checkpoint-choices" role="group" aria-label="Answer choices">
              {question.choices.map((choice, index) => {
                const isSelected = selected === index;
                const isCorrect = selected !== null && index === question.answer;
                return <button className={`learning-checkpoint-choice${isSelected ? " is-selected" : ""}${isCorrect ? " is-correct" : ""}`} key={choice} type="button" onClick={() => choose(index)} aria-pressed={isSelected} disabled={selected !== null}><span>{String.fromCharCode(65 + index)}</span>{choice}</button>;
              })}
            </div>
            {selected !== null && <div className={`learning-checkpoint-feedback ${selected === question.answer ? "is-correct" : "is-review"}`} role="status"><strong>{selected === question.answer ? "Correct." : "Review this one."}</strong><p>{question.explanation}</p><a href={question.href}>{question.linkLabel} →</a></div>}
          </div>
          {selected !== null && <button className="button" type="button" onClick={next}>{current === questions.length - 1 ? "See my result" : "Next question"} →</button>}
        </>
      ) : (
        <div className="learning-checkpoint-result" role="status"><div><div className="eyebrow">Checkpoint complete</div><h3>{score} / {questions.length} correct</h3><p>{score === questions.length ? "You are ready to move from a stat to a defensible coaching question." : "Use the review links above, then run the checkpoint again when you want a clean read."}</p></div><button className="button secondary" type="button" onClick={reset}>Run it again</button></div>
      )}
    </section>
  );
}
