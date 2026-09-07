export type CsvCell = string | number | null | undefined;

const escapeCell = (value: CsvCell) => {
  const text = value == null ? "" : String(value);
  return /[\",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

export function toCsv(headers: string[], rows: CsvCell[][]): string {
  return [headers, ...rows]
    .map((row) => row.map(escapeCell).join(","))
    .join("\r\n");
}

export function downloadCsv(filename: string, csv: string): void {
  if (typeof window === "undefined") return;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
