import { addDays, endOfDay, startOfDay, startOfYear, subDays, subMonths } from "date-fns";
import type { ObjectEntry } from "@r2-manager/shared";

/** An inclusive range of local calendar days. Either end may be open. */
export interface DateRange {
  from?: Date;
  to?: Date;
}

export type DatePreset = "today" | "7d" | "30d" | "3m" | "year";

export const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "3m", label: "Last 3 months" },
  { value: "year", label: "This year" },
];

export function presetRange(preset: DatePreset, now = new Date()): DateRange {
  const today = startOfDay(now);
  switch (preset) {
    case "today":
      return { from: today, to: today };
    case "7d":
      return { from: subDays(today, 6), to: today };
    case "30d":
      return { from: subDays(today, 29), to: today };
    case "3m":
      return { from: addDays(subMonths(today, 3), 1), to: today };
    case "year":
      return { from: startOfYear(today), to: today };
  }
}

export function isDateRangeActive(range: DateRange): boolean {
  return !!(range.from || range.to);
}

/**
 * Whether an entry was modified within the range, counting whole local days at both ends. Folders R2 infers from
 * common prefixes carry no date, so an active range leaves out every folder rather than guessing.
 */
export function inDateRange(entry: ObjectEntry, range: DateRange): boolean {
  if (!isDateRangeActive(range)) return true;
  if (entry.type === "folder" || !entry.lastModified) return false;
  const time = new Date(entry.lastModified).getTime();
  if (range.from && time < startOfDay(range.from).getTime()) return false;
  if (range.to && time > endOfDay(range.to).getTime()) return false;
  return true;
}

export const PAGE_SIZES = [25, 50, 100, 200] as const;
export type PageSize = (typeof PAGE_SIZES)[number];

/** Clamps a requested page into range, so deleting the last rows of the last page lands on the new last page. */
export function paginate<T>(items: T[], page: number, pageSize: number) {
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const current = Math.min(Math.max(1, page), pageCount);
  const start = (current - 1) * pageSize;
  return {
    page: current,
    pageCount,
    start,
    items: items.slice(start, start + pageSize),
  };
}
