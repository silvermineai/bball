"use client";

import { useMemo, useState } from "react";
import { marketImportMatchState, marketImportPrediction, marketImportScheduleSummary, parseMarketImportRows, validateMarketImportCsv, type MarketImportPreflight as Preflight, type MarketImportRow } from "../../_lib/market-import";
import type { BBGame } from "../../_lib/basketball-types";

const fixed = (value: number | null, digits = 1) => value == null || !Number.isFinite(value) ? "—" : value.toFixed(digits);
const signed = (value: number | null) => value == null || !Number.isFinite(value) ? "—" : `${value > 0 ? "+" : ""}${value.toFixed(1)}`;
const noVigHome = (row: MarketImportRow) => {
  if (row.homePrice == null || row.awayPrice == null) return null;
  const home = 1 / row.homePrice;
  const away = 1 / row.awayPrice;
  return home / (home + away);
};

export default function MarketImportPreflight({ upcoming }: { upcoming: BBGame[] }) {
  const [fileName, setFileName] = useState("");
  const [preflight, setPreflight] = useState<Preflight | null>(null);
  const [rows, setRows] = useState<MarketImportRow[]>([]);
  const comparisons = useMemo(() => rows.map((row) => {
    const game = upcoming.find((candidate) => candidate.id === row.gameId);
    const matchState = marketImportMatchState(row, game || null);
    const exact = matchState === "exact";
    const prediction = exact ? marketImportPrediction(game || null) : null;
    if (!game || !prediction) return { row, game: game || null, exact: false, matchState, gap: null, model: null, estimateType: null };
    const gap = row.market === "spreads"
      ? prediction.home_margin + (row.line || 0)
      : row.market === "totals"
        ? prediction.total - (row.line || 0)
        : prediction.home_win_probability - (noVigHome(row) || 0);
    return { row, game, exact, matchState, gap, model: row.market === "spreads" ? prediction.home_margin : row.market === "totals" ? prediction.total : prediction.home_win_probability * 100, estimateType: prediction.estimate_type === "cold_start" ? "cold-start" : "primary" };
  }), [rows, upcoming]);
  const scheduleSummary = useMemo(() => marketImportScheduleSummary(rows, upcoming), [rows, upcoming]);
  const matched = comparisons.filter((item) => item.exact);
  const rejected = comparisons.filter((item) => !item.exact);
  return (
    <div className="market-import-preflight">
      <div>
        <div className="eyebrow">Operator preflight / stays in this browser</div>
        <h3>Check an authorized line export before import.</h3>
        <p>Select a licensed feed CSV to validate its exact-match columns, timing clocks, market type and paired prices locally. The file is never uploaded; a clean preflight still requires the server importer, feed identity and license URL.</p>
      </div>
      <label className="button secondary market-import-file">
        {fileName ? `Check ${fileName}` : "Choose authorized market CSV"}
        <input name="authorized-market-csv" type="file" accept=".csv,text/csv" onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          setFileName(file.name);
          file.text().then((text) => {
            const result = validateMarketImportCsv(text);
            setPreflight(result);
            setRows(result.errors.length ? [] : parseMarketImportRows(text));
          }).catch(() => {
            setRows([]);
            setPreflight({ headers: [], rows: 0, markets: {}, errors: ["The selected file could not be read in this browser."], warnings: [] });
          });
        }} />
      </label>
      {preflight && <div className={`market-import-preflight-result ${preflight.errors.length || !scheduleSummary.ready ? "has-errors" : "is-ready"}`} role="status">
        {preflight.errors.length ? <><strong>Needs fixes before import</strong><ul>{preflight.errors.map((error) => <li key={error}>{error}</li>)}</ul></> : scheduleSummary.ready ? <><strong>Ready for the server importer</strong><p>{preflight.rows.toLocaleString()} rows · {Object.entries(preflight.markets).map(([market, count]) => `${count} ${market}`).join(" · ")} · every row joins the published schedule exactly</p></> : <><strong>CSV structure valid; schedule joins need fixes</strong><p>{preflight.rows.toLocaleString()} rows · {scheduleSummary.exact.toLocaleString()} exact · {scheduleSummary.missingSchedule.toLocaleString()} missing schedule IDs · {scheduleSummary.identityOrClockMismatch.toLocaleString()} participant or tip mismatches</p></>}
        {preflight.warnings.length > 0 && <p className="note">{preflight.warnings.length} row warning{preflight.warnings.length === 1 ? "" : "s"}: blank event IDs will be derived by the importer.</p>}
      </div>}
      {rows.length > 0 && <div className="market-import-preview">
        <div className="eyebrow">Private comparison preview / upcoming basketball</div>
        <h4>See the model beside your authorized quote.</h4>
        <p className="note">This preview stays in memory in this browser. It joins only exact game IDs, participant names and start instants from the published 2026–27 schedule; it does not upload, persist or add these rows to the public ledger.</p>
        <div className="market-import-preview-stats" role="status"><span><strong>{scheduleSummary.exact}</strong> exact upcoming matches</span><span><strong>{scheduleSummary.missingSchedule}</strong> rows without a current schedule ID</span><span><strong>{scheduleSummary.identityOrClockMismatch}</strong> participant or tip mismatches</span></div>
        {matched.length > 0 ? <div className="table-scroll">
          <table className="data-table"><thead><tr><th>Game</th><th>Market</th><th>Book</th><th className="numeric">Quote</th><th className="numeric">Model</th><th className="numeric">Difference</th></tr></thead><tbody>
            {matched.slice(0, 40).map(({ row, game, gap, model, estimateType }) => <tr key={`${row.gameId}-${row.market}-${row.bookmaker}-${row.capturedAt}`}>
              <td><strong>{game?.away_name}</strong><small>at {game?.home_name} · {row.gameId}</small></td>
              <td>{row.market}</td>
              <td>{row.bookmaker}<small>captured {row.capturedAt.slice(0, 10)} · updated {row.updatedAt.slice(0, 10)}</small></td>
              <td className="numeric">{row.market === "h2h" ? `${(noVigHome(row) == null ? "—" : (noVigHome(row)! * 100).toFixed(1) + "% home")}` : row.market === "totals" ? `O/U ${fixed(row.line)}` : `home ${signed(row.line)}`}<small>{row.market === "h2h" ? "no-vig" : "paired prices"}</small></td>
              <td className="numeric">{row.market === "h2h" ? `${fixed(model)}%` : fixed(model)}<small>{estimateType === "cold-start" ? "cold-start estimate" : "primary model"} · {row.market === "h2h" ? "home probability" : row.market === "totals" ? "model total" : "model home margin"}</small></td>
              <td className="numeric">{row.market === "h2h" ? `${gap == null ? "—" : signed(gap * 100)}%` : signed(gap)}<small>model minus quote</small></td>
            </tr>)}
          </tbody></table>
        </div> : <p className="note" role="status">No rows matched the current upcoming basketball schedule exactly. The preflight remains local and no comparison is shown.</p>}
        {matched.length > 40 && <small className="note">Showing the first 40 exact matches; the selected file remains local and can be imported through the server protocol.</small>}
        {rejected.length > 0 && <div className="table-scroll" style={{ marginTop: 16 }}>
          <table className="data-table"><thead><tr><th>Row that needs correction</th><th>Reason</th><th>Published schedule row</th></tr></thead><tbody>
            {rejected.slice(0, 40).map(({ row, game, matchState }, index) => <tr key={`${row.gameId}-${row.market}-${row.bookmaker}-${row.capturedAt}-${index}`}>
              <td><strong>{row.awayName} at {row.homeName}</strong><small>{row.gameId || "missing game ID"} · {row.startsAt}</small></td>
              <td>{matchState === "missing_schedule" ? "Game ID is not in the published upcoming schedule." : "Participant names or tip instant do not match this game ID exactly."}</td>
              <td>{game ? <><strong>{game.away_name} at {game.home_name}</strong><small>{game.id} · {game.starts_at}</small></> : <span className="muted">No current schedule row</span>}</td>
            </tr>)}
          </tbody></table>
        </div>}
        {rejected.length > 40 && <small className="note">Showing the first 40 schedule-join failures.</small>}
      </div>}
    </div>
  );
}
