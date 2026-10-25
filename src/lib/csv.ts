// One CSV cell. A value that starts with = + - @ (or a tab/CR) could be run as a formula by a spreadsheet, so it is
// neutralized with a leading quote; values with commas, quotes or line breaks are quoted and their quotes doubled.
export function csvCell(value: string | number | null): string {
  const text = value === null ? "" : String(value);
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}
