import { describe, expect, it } from "vitest";
import type { ObjectEntry } from "@r2-manager/shared";
import { inDateRange, paginate, presetRange } from "./listing-filters";

const file = (lastModified: Date): ObjectEntry => ({
  key: "a.txt",
  type: "file",
  size: 1,
  lastModified: lastModified.toISOString(),
});

describe("inDateRange", () => {
  const day = (d: number, h = 12) => new Date(2026, 2, d, h);

  it("keeps everything, folders included, when no range is set", () => {
    expect(inDateRange({ key: "docs/", type: "folder" }, {})).toBe(true);
    expect(inDateRange(file(day(6)), {})).toBe(true);
  });

  it("counts both ends as whole local days", () => {
    const range = { from: day(3, 15), to: day(6, 9) };
    expect(inDateRange(file(new Date(2026, 2, 3, 0, 0, 1)), range)).toBe(true);
    expect(inDateRange(file(new Date(2026, 2, 6, 23, 59, 59)), range)).toBe(true);
    expect(inDateRange(file(new Date(2026, 2, 2, 23, 59, 59)), range)).toBe(false);
    expect(inDateRange(file(new Date(2026, 2, 7, 0, 0, 1)), range)).toBe(false);
  });

  it("supports open-ended ranges", () => {
    expect(inDateRange(file(day(20)), { from: day(6) })).toBe(true);
    expect(inDateRange(file(day(1)), { from: day(6) })).toBe(false);
    expect(inDateRange(file(day(1)), { to: day(6) })).toBe(true);
  });

  it("leaves out folders and undated entries once a range is set", () => {
    expect(inDateRange({ key: "docs/", type: "folder" }, { from: day(1) })).toBe(false);
    expect(inDateRange({ key: "a.txt", type: "file" }, { from: day(1) })).toBe(false);
  });
});

describe("presetRange", () => {
  it("makes 'Last 7 days' include today and the six days before it", () => {
    const { from, to } = presetRange("7d", new Date(2026, 8, 28, 18));
    expect(from).toEqual(new Date(2026, 8, 22));
    expect(to).toEqual(new Date(2026, 8, 28));
  });
});

describe("paginate", () => {
  const items = Array.from({ length: 120 }, (_, i) => i);

  it("slices the requested page and counts pages", () => {
    const result = paginate(items, 3, 50);
    expect(result).toMatchObject({ page: 3, pageCount: 3, start: 100 });
    expect(result.items).toEqual(items.slice(100));
  });

  it("clamps a page past the end to the last page", () => {
    expect(paginate(items, 9, 50).page).toBe(3);
    expect(paginate(items.slice(0, 40), 3, 50)).toMatchObject({
      page: 1,
      start: 0,
    });
  });

  it("reports one empty page for an empty list", () => {
    expect(paginate([], 1, 50)).toMatchObject({
      page: 1,
      pageCount: 1,
      items: [],
    });
  });
});
