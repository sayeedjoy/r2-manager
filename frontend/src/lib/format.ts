import { format, formatDistanceToNowStrict } from "date-fns";

const BYTE_UNITS = ["KB", "MB", "GB", "TB"];
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** "5 minutes ago" for the past week, where recency matters, then a plain date. Pair it with formatDateTime in a title. */
export function formatRelativeDate(iso: string): string {
  const date = new Date(iso);
  return Date.now() - date.getTime() < WEEK_MS ? formatDistanceToNowStrict(date, { addSuffix: true }) : format(date, "MMM d, yyyy");
}

export function formatDateTime(iso: string): string {
  return format(new Date(iso), "PPpp");
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
