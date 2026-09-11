"use client";

import { useState } from "react";
import { validateMarketImportCsv, type MarketImportPreflight as Preflight } from "../../_lib/market-import";

export default function MarketImportPreflight() {
  const [fileName, setFileName] = useState("");
  const [preflight, setPreflight] = useState<Preflight | null>(null);
  return (
    <div className="market-import-preflight">
      <div>
        <div className="eyebrow">Operator preflight / stays in this browser</div>
        <h3>Check an authorized line export before import.</h3>
        <p>Select a licensed provider CSV to validate its exact-match columns, timing clocks, market type and paired prices locally. The file is never uploaded; a clean preflight still requires the server importer, provider identity and license URL.</p>
      </div>
      <label className="button secondary market-import-file">
        {fileName ? `Check ${fileName}` : "Choose authorized market CSV"}
        <input name="authorized-market-csv" type="file" accept=".csv,text/csv" onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          setFileName(file.name);
          file.text().then((text) => setPreflight(validateMarketImportCsv(text))).catch(() => setPreflight({ headers: [], rows: 0, markets: {}, errors: ["The selected file could not be read in this browser."], warnings: [] }));
        }} />
      </label>
      {preflight && <div className={`market-import-preflight-result ${preflight.errors.length ? "has-errors" : "is-ready"}`} role="status">
        {preflight.errors.length ? <><strong>Needs fixes before import</strong><ul>{preflight.errors.map((error) => <li key={error}>{error}</li>)}</ul></> : <><strong>Ready for the server importer</strong><p>{preflight.rows.toLocaleString()} rows · {Object.entries(preflight.markets).map(([market, count]) => `${count} ${market}`).join(" · ")}</p></>}
        {preflight.warnings.length > 0 && <p className="note">{preflight.warnings.length} row warning{preflight.warnings.length === 1 ? "" : "s"}: blank event IDs will be derived by the importer.</p>}
      </div>}
    </div>
  );
}
