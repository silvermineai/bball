"use client";

import { useEffect, useState } from "react";
import { downloadCsv, toCsv } from "../../_lib/csv";
import { spreadCoverProbability } from "../../_lib/market-probabilities";

function numberValue(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function impliedAmerican(value: number) {
  if (value >= 100) return 100 / (value + 100);
  if (value <= -100) return Math.abs(value) / (Math.abs(value) + 100);
  return null;
}

function signedPoints(value: number) {
  return `${value > 0 ? "+" : ""}${value.toFixed(1)} pts`;
}

type SavedQuote = {
  savedAt: string;
  source: string;
  spread: number | null;
  total: number | null;
  moneyline: number | null;
  awayMoneyline: number | null;
  moneylineHomeProbability: number | null;
  spreadEdge: number | null;
  spreadCoverProbability: number | null;
  totalEdge: number | null;
  moneylineEdge: number | null;
};

export default function ManualMarketCheck({
  homeName,
  modelMargin,
  modelTotal,
  modelHomeWinProbability,
  modelMarginLow,
  modelMarginHigh,
  storageKey,
}: {
  homeName: string;
  modelMargin: number;
  modelTotal: number;
  modelHomeWinProbability: number;
  modelMarginLow?: number | null;
  modelMarginHigh?: number | null;
  storageKey?: string;
}) {
  const [spread, setSpread] = useState("");
  const [total, setTotal] = useState("");
  const [moneyline, setMoneyline] = useState("");
  const [awayMoneyline, setAwayMoneyline] = useState("");
  const [source, setSource] = useState("");
  const [history, setHistory] = useState<SavedQuote[]>([]);
  const [savedMessage, setSavedMessage] = useState("");
  const marketSpread = numberValue(spread);
  const marketTotal = numberValue(total);
  const marketMoneyline = numberValue(moneyline);
  const marketAwayMoneyline = numberValue(awayMoneyline);
  const spreadEdge =
    marketSpread == null ? null : modelMargin + marketSpread;
  const spreadCover = spreadCoverProbability(modelMargin, modelMarginLow, modelMarginHigh, marketSpread);
  const totalEdge = marketTotal == null ? null : modelTotal - marketTotal;
  const implied =
    marketMoneyline == null ? null : impliedAmerican(marketMoneyline);
  const awayImplied =
    marketAwayMoneyline == null ? null : impliedAmerican(marketAwayMoneyline);
  const marketHomeProbability =
    implied == null || awayImplied == null || implied + awayImplied <= 0
      ? null
      : implied / (implied + awayImplied);
  const moneylineEdge =
    marketHomeProbability == null ? null : modelHomeWinProbability - marketHomeProbability;
  const notebookKey = `silvermine-market-notebook:${storageKey || homeName}`;
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(notebookKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) setHistory(parsed.slice(0, 20));
    } catch {
      // Local storage is optional; the calculator remains useful when blocked.
    }
  }, [notebookKey]);
  const saveQuote = () => {
    if (!source.trim() || [marketSpread, marketTotal, marketMoneyline, marketAwayMoneyline].every((value) => value == null)) {
      setSavedMessage("Add a source and at least one observed line first.");
      return;
    }
    const quote: SavedQuote = {
      savedAt: new Date().toISOString(),
      source: source.trim(),
      spread: marketSpread,
      total: marketTotal,
      moneyline: marketMoneyline,
      awayMoneyline: marketAwayMoneyline,
      moneylineHomeProbability: marketHomeProbability,
      spreadEdge,
      spreadCoverProbability: spreadCover,
      totalEdge,
      moneylineEdge,
    };
    const next = [quote, ...history].slice(0, 20);
    setHistory(next);
    setSavedMessage("Saved locally in this browser.");
    try {
      window.localStorage.setItem(notebookKey, JSON.stringify(next));
    } catch {
      setSavedMessage("Calculated, but this browser could not save local notes.");
    }
  };
  const clearHistory = () => {
    setHistory([]);
    setSavedMessage("Local quote history cleared.");
    try { window.localStorage.removeItem(notebookKey); } catch { /* optional storage */ }
  };
  const exportHistory = () => {
    if (!history.length) return;
    downloadCsv(
      "manual-market-notebook.csv",
      toCsv(
        ["Saved at", "Source", "Home spread", "Game total", "Home moneyline", "Away moneyline", "Market no-vig home probability", "Spread edge", "Approx. spread cover probability", "Total edge", "Moneyline probability edge"],
        history.map((quote) => [quote.savedAt, quote.source, quote.spread, quote.total, quote.moneyline, quote.awayMoneyline, quote.moneylineHomeProbability == null ? null : quote.moneylineHomeProbability * 100, quote.spreadEdge, quote.spreadCoverProbability == null ? null : quote.spreadCoverProbability * 100, quote.totalEdge, quote.moneylineEdge == null ? null : quote.moneylineEdge * 100]),
      ),
    );
  };

  return (
    <section className="section paper-panel manual-market-check screen-only">
      <div className="section-heading">
        <div>
          <div className="eyebrow">Reader tool / Manual quote check</div>
          <h2>Compare a line you observed.</h2>
        </div>
        <span className="note">Browser only · never published</span>
      </div>
      <p className="note">
        Enter a home spread, game total or both sides of a moneyline from a source
        you are reviewing. Results use the published forecast and stay in this
        browser; they are not a verified market observation, recommendation or
        ledger record.
      </p>
      <div className="manual-market-controls">
        <label className="control">
          <span>HOME SPREAD</span>
          <input
            inputMode="decimal"
            type="number"
            step="0.5"
            value={spread}
            onChange={(event) => setSpread(event.target.value)}
            placeholder="-3.5"
          />
          <small>Negative means {homeName} is favored.</small>
        </label>
        <label className="control">
          <span>GAME TOTAL</span>
          <input
            inputMode="decimal"
            type="number"
            step="0.5"
            value={total}
            onChange={(event) => setTotal(event.target.value)}
            placeholder="145.5"
          />
          <small>Use the full-game over/under number.</small>
        </label>
        <label className="control">
          <span>{homeName.toUpperCase()} MONEYLINE</span>
          <input
            inputMode="numeric"
            type="number"
            step="1"
            value={moneyline}
            onChange={(event) => setMoneyline(event.target.value)}
            placeholder="+125"
          />
          <small>American odds, at least +100 or at most -100.</small>
        </label>
        <label className="control">
          <span>AWAY MONEYLINE</span>
          <input
            inputMode="numeric"
            type="number"
            step="1"
            value={awayMoneyline}
            onChange={(event) => setAwayMoneyline(event.target.value)}
            placeholder="-145"
          />
          <small>Enter both sides to remove two-way vig.</small>
        </label>
        <label className="control">
          <span>OBSERVED SOURCE</span>
          <input
            type="text"
            maxLength={120}
            value={source}
            onChange={(event) => setSource(event.target.value)}
            placeholder="Bookmaker or screen"
          />
          <small>Label the line so your local notes remain auditable.</small>
        </label>
      </div>
      <div className="button-row" style={{ marginTop: 16 }}>
        <button className="button secondary" type="button" onClick={saveQuote}>Save quote locally</button>
        <span className="note">Up to 20 notes · never uploaded</span>
        {savedMessage && <span className="note" role="status">{savedMessage}</span>}
      </div>
      <div className="manual-market-results" aria-live="polite">
        <div>
          <span>Spread edge</span>
          <strong>{spreadEdge == null ? "—" : signedPoints(spreadEdge)}</strong>
          <small>
            {spreadEdge == null
              ? "Model margin minus the observed home line."
              : spreadEdge > 0
                ? "Model is more favorable to the home side."
                : "Observed line is more favorable to the home side."}
          </small>
          <small>
            {spreadCover == null
              ? "The published margin range is unavailable for a cover estimate."
              : `Normal approximation: ${(spreadCover * 100).toFixed(1)}% chance the home margin clears this line.`}
          </small>
        </div>
        <div>
          <span>Total edge</span>
          <strong>{totalEdge == null ? "—" : signedPoints(totalEdge)}</strong>
          <small>
            {totalEdge == null
              ? "Model total minus the observed total."
              : totalEdge > 0
                ? "Model total is above the observed number."
                : "Model total is below the observed number."}
          </small>
        </div>
        <div>
          <span>Moneyline probability edge</span>
          <strong>
            {moneylineEdge == null
              ? "—"
              : `${moneylineEdge > 0 ? "+" : ""}${(moneylineEdge * 100).toFixed(1)} pp`}
          </strong>
          <small>
            {marketHomeProbability == null
              ? "Enter both moneylines to calculate a no-vig market probability."
              : `No-vig market ${(marketHomeProbability * 100).toFixed(1)}% · model ${(modelHomeWinProbability * 100).toFixed(1)}%`}
          </small>
        </div>
      </div>
      <p className="note manual-market-footnote">
        Convention: spread edge = model home margin + home spread; total edge
        = model total − observed total. This arithmetic does not account for
        vig, pushes, limits, timing or player availability. The spread-cover
        probability is a normal approximation from the published nominal 80%
        margin interval; it is not a calibrated betting probability. Moneyline
        edge uses both sides to remove two-way vig.
      </p>
      {history.length > 0 && (
        <section className="manual-market-history">
          <div className="section-heading">
            <div>
              <div className="eyebrow">Local notebook / Saved observations</div>
              <h3>Keep the lines you actually saw.</h3>
            </div>
            <div className="button-row">
              <button className="button secondary" type="button" onClick={exportHistory}>Export notes ↓</button>
              <button className="button secondary" type="button" onClick={clearHistory}>Clear local notes</button>
            </div>
          </div>
          <p className="note">Saved in this browser with the model values shown above. These notes are user-entered observations, not provider-verified market records.</p>
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr><th>Saved / source</th><th className="numeric">Spread</th><th className="numeric">Total</th><th className="numeric">Moneyline</th><th className="numeric">Edges</th></tr></thead>
              <tbody>{history.map((quote) => <tr key={`${quote.savedAt}-${quote.source}`}>
                <td><strong>{quote.source}</strong><small>{new Date(quote.savedAt).toLocaleString()}</small></td>
                <td className="numeric">{quote.spread == null ? "—" : quote.spread.toFixed(1)}<small>{quote.spreadEdge == null ? "" : signedPoints(quote.spreadEdge)}</small><small>{quote.spreadCoverProbability == null ? "" : `${(quote.spreadCoverProbability * 100).toFixed(1)}% cover approx.`}</small></td>
                <td className="numeric">{quote.total == null ? "—" : quote.total.toFixed(1)}<small>{quote.totalEdge == null ? "" : signedPoints(quote.totalEdge)}</small></td>
                <td className="numeric">{quote.moneyline == null ? "—" : quote.moneyline > 0 ? `+${quote.moneyline}` : quote.moneyline}<small>{quote.awayMoneyline == null ? "Away —" : `Away ${quote.awayMoneyline > 0 ? "+" : ""}${quote.awayMoneyline}`}</small><small>{quote.moneylineHomeProbability == null ? "" : `No-vig home ${(quote.moneylineHomeProbability * 100).toFixed(1)}%`}</small><small>{quote.moneylineEdge == null ? "" : `${quote.moneylineEdge > 0 ? "+" : ""}${(quote.moneylineEdge * 100).toFixed(1)} pp`}</small></td>
                <td className="numeric"><small>Spread / total / ML</small><strong>{[quote.spreadEdge, quote.totalEdge, quote.moneylineEdge == null ? null : quote.moneylineEdge * 100].map((value) => value == null ? "—" : value.toFixed(1)).join(" · ")}</strong></td>
              </tr>)}</tbody>
            </table>
          </div>
        </section>
      )}
    </section>
  );
}
