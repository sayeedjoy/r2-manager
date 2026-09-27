import { format, formatDistanceToNowStrict } from "date-fns";

const BYTE_UNITS = ["KB", "MB", "GB", "TB"];
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** "5 minutes ago" for the past week, where recency matters, then a plain date. RelativeTime shows the exact time on hover. */
export function formatRelativeDate(iso: string): string {
  const date = new Date(iso);
  const age = Date.now() - date.getTime();
  // Clock skew between server and browser can make a brand-new timestamp land slightly in the future.
  if (Math.abs(age) < 10_000) return "just now";
  return age < WEEK_MS ? formatDistanceToNowStrict(date, { addSuffix: true }) : format(date, "MMM d, yyyy");
}

/** Local time with seconds and the UTC offset, e.g. "Sep 27, 2026, 9:32:10 PM GMT+6". */
export function formatDateTime(iso: string): string {
  return format(new Date(iso), "PPpp O");
}

/** The same instant in UTC, e.g. "2026-09-27 15:32:10 UTC", for matching against server logs. */
export function formatUtc(iso: string): string {
  return `${new Date(iso).toISOString().slice(0, 19).replace("T", " ")} UTC`;
}

export function formatBytes(bytes?: number | null): string {
  if (bytes === undefined || bytes === null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(1)} ${BYTE_UNITS[unit]}`;
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count.toLocaleString()} ${count === 1 ? singular : plural}`;
}
