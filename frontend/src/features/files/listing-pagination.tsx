import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PAGE_SIZES, type PageSize } from "./listing-filters";

interface ListingPaginationProps {
  page: number;
  pageCount: number;
  pageSize: PageSize;
  /** Index of the first row on this page, counted from 0. */
  start: number;
  shown: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: PageSize) => void;
}

const PAGE_SIZE_ITEMS = PAGE_SIZES.map((size) => ({
  value: String(size),
  label: String(size),
}));

/** FILE-01: first, previous, next and last page controls for the loaded listing, plus how many rows a page holds. */
export function ListingPagination({
  page,
  pageCount,
  pageSize,
  start,
  shown,
  total,
  onPageChange,
  onPageSizeChange,
}: ListingPaginationProps) {
  const onFirst = page <= 1;
  const onLast = page >= pageCount;

  return (
    <nav aria-label="Pages" className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t px-3 py-2 text-sm">
      <p className="mr-auto text-muted-foreground tabular-nums">
        {(start + 1).toLocaleString()}–{(start + shown).toLocaleString()} of {total.toLocaleString()}
      </p>
      <div className="flex items-center gap-2">
        <label htmlFor="listing-page-size" className="hidden text-muted-foreground sm:block">
          Rows per page
        </label>
        <Select
          items={PAGE_SIZE_ITEMS}
          value={String(pageSize)}
          onValueChange={(value) => value && onPageSizeChange(Number(value) as PageSize)}
        >
          <SelectTrigger id="listing-page-size" size="sm" className="w-18" aria-label="Rows per page">
            <SelectValue />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false} align="end" side="top">
            <SelectGroup>
              {PAGE_SIZE_ITEMS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="First page"
          disabled={onFirst}
          onClick={() => onPageChange(1)}
        >
          <ChevronsLeft />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Previous page"
          disabled={onFirst}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft />
        </Button>
        <span className="min-w-24 text-center tabular-nums" aria-live="polite">
          Page {page.toLocaleString()} of {pageCount.toLocaleString()}
        </span>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Next page"
          disabled={onLast}
          onClick={() => onPageChange(page + 1)}
        >
          <ChevronRight />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Last page"
          disabled={onLast}
          onClick={() => onPageChange(pageCount)}
        >
          <ChevronsRight />
        </Button>
      </div>
    </nav>
  );
}
