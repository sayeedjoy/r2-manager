import type { ObjectEntry } from "@r2-manager/shared";
import { baseName } from "@r2-manager/shared";
import { typeLabel } from "./file-kind";
import { PAGE_SIZES, type PageSize } from "./listing-filters";

export type SortColumn = "name" | "type" | "size" | "modified";
export interface SortState {
  column: SortColumn;
  dir: 1 | -1;
}

export type Density = "compact" | "comfortable";
export type DisplayProperty = "type" | "size" | "modified";

export interface ViewOptions {
  density: Density;
  sort: SortState;
  /** Which optional list-view columns are shown. Name and selection always are. */
  properties: Record<DisplayProperty, boolean>;
  /** Rows per page, in both the list and the grid. */
  pageSize: PageSize;
}

export const DEFAULT_VIEW_OPTIONS: ViewOptions = {
  density: "compact",
  sort: { column: "name", dir: 1 },
  properties: { type: true, size: true, modified: true },
  pageSize: 50,
};

export const DISPLAY_PROPERTIES: { value: DisplayProperty; label: string }[] = [
  { value: "type", label: "Type" },
  { value: "size", label: "Size" },
  { value: "modified", label: "Modified" },
];

export const DENSITIES: { value: Density; label: string }[] = [
  { value: "compact", label: "Compact" },
  { value: "comfortable", label: "Comfortable" },
];

/** Each column's natural first direction: names A to Z, but dates and sizes biggest-first. */
export const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: "name:1", label: "Name A to Z" },
  { value: "name:-1", label: "Name Z to A" },
  { value: "type:1", label: "Type A to Z" },
  { value: "type:-1", label: "Type Z to A" },
  { value: "modified:-1", label: "Newest first" },
  { value: "modified:1", label: "Oldest first" },
  { value: "size:-1", label: "Largest first" },
  { value: "size:1", label: "Smallest first" },
];

export function sortValue(sort: SortState): string {
  return `${sort.column}:${sort.dir}`;
}

export function parseSortValue(value: string): SortState | null {
  const [column, dir] = value.split(":");
  if (!["name", "type", "size", "modified"].includes(column ?? "") || (dir !== "1" && dir !== "-1")) return null;
  return { column: column as SortColumn, dir: dir === "1" ? 1 : -1 };
}

/** Clicking a column header: flip the active column, or start a new one in its natural direction. */
export function nextSort(current: SortState, column: SortColumn): SortState {
  if (current.column === column) return { column, dir: current.dir === 1 ? -1 : 1 };
  return { column, dir: column === "size" || column === "modified" ? -1 : 1 };
}

// Numeric so "file2" sorts before "file10"; base sensitivity so case doesn't split the list.
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

/** Sorts by the chosen column with name as the tiebreaker, keeping folders ahead of files as file managers do. */
export function sortEntries(entries: ObjectEntry[], { column, dir }: SortState): ObjectEntry[] {
  const byName = (a: ObjectEntry, b: ObjectEntry) => collator.compare(baseName(a.key), baseName(b.key));
  const compare = (a: ObjectEntry, b: ObjectEntry): number => {
    switch (column) {
      case "type":
        return collator.compare(typeLabel(a), typeLabel(b));
      case "size":
        return (a.size ?? -1) - (b.size ?? -1);
      case "modified":
        return (a.lastModified ?? "").localeCompare(b.lastModified ?? "");
      default:
        return byName(a, b);
    }
  };
  return [...entries].sort((a, b) => {
    if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
    return compare(a, b) * dir || byName(a, b);
  });
}

const STORAGE_KEY = "r2-manager:browser-view-options";

/** A per-browser convenience: anything missing, stale or unreadable falls back to the defaults. */
export function readViewOptions(): ViewOptions {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<ViewOptions> | null;
    if (!raw || typeof raw !== "object") return DEFAULT_VIEW_OPTIONS;
    const sort = raw.sort && parseSortValue(sortValue(raw.sort));
    return {
      density: raw.density === "comfortable" ? "comfortable" : "compact",
      sort: sort ?? DEFAULT_VIEW_OPTIONS.sort,
      properties: {
        type: raw.properties?.type !== false,
        size: raw.properties?.size !== false,
        modified: raw.properties?.modified !== false,
      },
      pageSize: PAGE_SIZES.find((size) => size === raw.pageSize) ?? DEFAULT_VIEW_OPTIONS.pageSize,
    };
  } catch {
    return DEFAULT_VIEW_OPTIONS;
  }
}

export function writeViewOptions(options: ViewOptions) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(options));
  } catch {
    // Not persisting the preference is fine.
  }
}
