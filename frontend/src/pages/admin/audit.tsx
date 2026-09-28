import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Check, CircleCheck, CircleX, Copy, RefreshCw, ScrollText, Search, TriangleAlert, X } from "lucide-react";
import { AUDIT_PAGE_SIZES } from "@r2-manager/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PageHeader } from "@/components/layout/page-header";
import { TableCard, TableSkeleton } from "@/components/layout/table-card";
import { RelativeTime } from "@/components/relative-time";
import { api, type AuditEvent } from "@/lib/api";
import { cn } from "@/lib/utils";

type OutcomeFilter = "all" | AuditEvent["outcome"];

const DEFAULT_PAGE_SIZE = AUDIT_PAGE_SIZES[0];

/**
 * Page numbers to show around the current page: always the first and last, the current page and its neighbours,
 * and an ellipsis for each gap. For example, page 6 of 20 gives 1 … 5 6 7 … 20.
 */
function pageWindow(current: number, total: number): (number | "ellipsis")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set([1, total, current - 1, current, current + 1]);
  if (current <= 3) [2, 3, 4].forEach((p) => pages.add(p));
  if (current >= total - 2) [total - 3, total - 2, total - 1].forEach((p) => pages.add(p));
  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  return sorted.flatMap((p, i) => (i > 0 && p - sorted[i - 1] > 1 ? (["ellipsis", p] as const) : [p]));
}

/** ADMIN-01: audit trail, paginated on the server. Page, page size and filters live in the URL, so views can be linked. */
export function AdminAuditPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const topRef = useRef<HTMLDivElement>(null);

  const page = Math.max(1, Math.floor(Number(searchParams.get("page"))) || 1);
  const sizeParam = Number(searchParams.get("size"));
  const pageSize = (AUDIT_PAGE_SIZES as readonly number[]).includes(sizeParam) ? sizeParam : DEFAULT_PAGE_SIZE;
  const outcomeParam = searchParams.get("outcome");
  const outcome: OutcomeFilter = outcomeParam === "success" || outcomeParam === "failure" ? outcomeParam : "all";
  const q = searchParams.get("q") ?? "";

  /** Updates URL params. Changing a filter or page size goes back to page 1; paging itself adds a history entry. */
  function updateParams(patch: Record<string, string | null>, { resetPage = true, replace = true } = {}) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [key, value] of Object.entries(patch)) {
          if (value === null || value === "") next.delete(key);
          else next.set(key, value);
        }
        if (resetPage) next.delete("page");
        return next;
      },
      { replace },
    );
  }

  function goToPage(target: number) {
    updateParams({ page: target === 1 ? null : String(target) }, { resetPage: false, replace: false });
    topRef.current?.scrollIntoView({ block: "start" });
  }

  function hrefFor(target: number) {
    const next = new URLSearchParams(searchParams);
    if (target === 1) next.delete("page");
    else next.set("page", String(target));
    const qs = next.toString();
    return qs ? `?${qs}` : "?";
  }

  // The search box updates the URL 300ms after typing stops, so each keystroke doesn't fire a request.
  const [searchInput, setSearchInput] = useState(q);
  const [syncedQ, setSyncedQ] = useState(q);
  if (q !== syncedQ) {
    // The URL changed from outside the box (back button, a link), so show that search.
    setSyncedQ(q);
    setSearchInput(q);
  }
  useEffect(() => {
    if (searchInput.trim() === q) return;
    const id = setTimeout(() => updateParams({ q: searchInput.trim() }), 300);
    return () => clearTimeout(id);
    // updateParams is recreated each render; the timer only needs to restart when the input or URL value changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput, q]);

  const { data, isLoading, error, refetch, isFetching, isPlaceholderData } = useQuery({
    queryKey: ["admin", "audit", { page, pageSize, outcome, q }],
    queryFn: () =>
      api.getAudit({ limit: pageSize, offset: (page - 1) * pageSize, outcome: outcome === "all" ? undefined : outcome, q: q || undefined }),
    // Keep the current page on screen while the next one loads instead of flashing a skeleton.
    placeholderData: keepPreviousData,
  });
  // Events only carry the actor's id; the users list (already cached by the Users page) turns it into a name.
  const { data: usersData } = useQuery({ queryKey: ["admin", "users"], queryFn: api.listUsers });
  const actorNames = useMemo(() => new Map(usersData?.users.map((u) => [u.id, u.displayName])), [usersData]);

  const events = data?.events ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const filtered = outcome !== "all" || q !== "";
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  let content;
  if (isLoading) {
    content = (
      <TableCard>
        <TableSkeleton rows={8} />
      </TableCard>
    );
  } else if (error) {
    content = (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <TriangleAlert />
          </EmptyMedia>
          <EmptyTitle>Couldn't load the audit log</EmptyTitle>
          <EmptyDescription>{error.message}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button variant="outline" onClick={() => refetch()}>
            Try again
          </Button>
        </EmptyContent>
      </Empty>
    );
  } else if (total === 0 && !filtered) {
    content = (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ScrollText />
          </EmptyMedia>
          <EmptyTitle>Nothing recorded yet</EmptyTitle>
          <EmptyDescription>Uploads, deletes, shares and admin changes are logged here as they happen.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  } else {
    content = (
      <>
        <TableCard className={cn("transition-opacity duration-150", isPlaceholderData && "opacity-60")} aria-busy={isPlaceholderData}>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Time</TableHead>
                <TableHead>Action</TableHead>
                <TableHead className="hidden sm:table-cell">Actor</TableHead>
                <TableHead className="hidden md:table-cell">Target</TableHead>
                <TableHead>Outcome</TableHead>
                <TableHead className="hidden lg:table-cell">Correlation ID</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.length === 0 && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                    {total === 0 ? (
                      "No events match these filters."
                    ) : (
                      // Only reachable by editing the URL to a page past the end.
                      <>
                        There's no page {page}.{" "}
                        <Button variant="link" className="h-auto p-0" onClick={() => goToPage(1)}>
                          Go to the first page
                        </Button>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              )}
              {events.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="text-muted-foreground">
                    <RelativeTime value={e.createdAt} />
                  </TableCell>
                  <TableCell>
                    <code className="font-mono text-xs">{e.action}</code>
                  </TableCell>
                  <TableCell className="hidden max-w-40 truncate sm:table-cell">
                    {e.actorId ? (
                      (actorNames.get(e.actorId) ?? <span className="text-muted-foreground">Unknown user</span>)
                    ) : (
                      <span className="text-muted-foreground">System</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden max-w-72 truncate font-mono text-xs md:table-cell" title={e.target ?? undefined}>
                    {e.target ?? <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell>
                    <OutcomeBadge outcome={e.outcome} />
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <CopyableId value={e.correlationId} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableCard>

        {total > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 text-sm">
            <p className="text-muted-foreground tabular-nums" aria-live="polite">
              {from.toLocaleString()}–{to.toLocaleString()} of {total.toLocaleString()} {total === 1 ? "event" : "events"}
            </p>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <div className="flex items-center gap-2">
                <label htmlFor="audit-page-size" className="text-muted-foreground max-sm:sr-only">
                  Rows per page
                </label>
                <NativeSelect
                  id="audit-page-size"
                  size="sm"
                  className="w-20"
                  value={String(pageSize)}
                  onChange={(e) => updateParams({ size: e.target.value === String(DEFAULT_PAGE_SIZE) ? null : e.target.value })}
                >
                  {AUDIT_PAGE_SIZES.map((size) => (
                    <NativeSelectOption key={size} value={size}>
                      {size}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
              {totalPages > 1 && (
                <Pagination className="mx-0 w-auto">
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        href={page > 1 ? hrefFor(page - 1) : undefined}
                        aria-disabled={page <= 1}
                        tabIndex={page <= 1 ? -1 : undefined}
                        className={cn(page <= 1 && "pointer-events-none opacity-50")}
                        onClick={(e) => {
                          e.preventDefault();
                          if (page > 1) goToPage(page - 1);
                        }}
                      />
                    </PaginationItem>
                    {pageWindow(Math.min(page, totalPages), totalPages).map((p, i) =>
                      p === "ellipsis" ? (
                        <PaginationItem key={`ellipsis-${i}`} className="max-sm:hidden">
                          <PaginationEllipsis />
                        </PaginationItem>
                      ) : (
                        // On phones only the current page number shows; Previous/Next do the rest.
                        <PaginationItem key={p} className={cn(p !== page && "max-sm:hidden")}>
                          <PaginationLink
                            href={hrefFor(p)}
                            isActive={p === page}
                            className="tabular-nums"
                            onClick={(e) => {
                              e.preventDefault();
                              goToPage(p);
                            }}
                          >
                            {p}
                          </PaginationLink>
                        </PaginationItem>
                      ),
                    )}
                    <PaginationItem>
                      <PaginationNext
                        href={page < totalPages ? hrefFor(page + 1) : undefined}
                        aria-disabled={page >= totalPages}
                        tabIndex={page >= totalPages ? -1 : undefined}
                        className={cn(page >= totalPages && "pointer-events-none opacity-50")}
                        onClick={(e) => {
                          e.preventDefault();
                          if (page < totalPages) goToPage(page + 1);
                        }}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              )}
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <div ref={topRef} className="flex scroll-mt-4 flex-col gap-4 p-4 md:p-6">
      <PageHeader
        title="Audit log"
        description="Every change made through R2 Manager, newest first."
        actions={
          <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? <Spinner data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />}
            Refresh
          </Button>
        }
      />

      {(total > 0 || filtered) && (
        <div className="flex flex-wrap items-center gap-2">
          <InputGroup className="max-w-xs">
            <InputGroupAddon>
              <Search />
            </InputGroupAddon>
            <InputGroupInput
              placeholder="Action, target or correlation ID"
              aria-label="Search the audit log"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setSearchInput("")}
            />
            {searchInput && (
              <InputGroupAddon align="inline-end">
                <InputGroupButton size="icon-xs" aria-label="Clear search" onClick={() => setSearchInput("")}>
                  <X />
                </InputGroupButton>
              </InputGroupAddon>
            )}
          </InputGroup>
          <ToggleGroup
            variant="outline"
            spacing={0}
            aria-label="Filter by outcome"
            value={[outcome]}
            onValueChange={(value) => value[0] && updateParams({ outcome: value[0] === "all" ? null : value[0] })}
          >
            <ToggleGroupItem value="all">All</ToggleGroupItem>
            <ToggleGroupItem value="success">Success</ToggleGroupItem>
            <ToggleGroupItem value="failure">Failure</ToggleGroupItem>
          </ToggleGroup>
        </div>
      )}

      {content}
    </div>
  );
}

function OutcomeBadge({ outcome }: { outcome: AuditEvent["outcome"] }) {
  return outcome === "success" ? (
    <Badge variant="success">
      <CircleCheck data-icon="inline-start" />
      Success
    </Badge>
  ) : (
    <Badge variant="destructive">
      <CircleX data-icon="inline-start" />
      Failure
    </Badge>
  );
}

/** Correlation IDs are what support asks for, so copying one is a single click. The icon cross-fades to a check. */
function CopyableId({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be unavailable (insecure origin, denied permission); the ID is still selectable text.
    }
  }

  const iconClass = "col-start-1 row-start-1 transition-[opacity,filter,scale] duration-300 ease-[cubic-bezier(0.2,0,0,1)]";
  return (
    <div className="flex items-center gap-1">
      <code className="max-w-36 truncate font-mono text-xs text-muted-foreground" title={value}>
        {value}
      </code>
      <Tooltip>
        <TooltipTrigger render={<Button variant="ghost" size="icon-xs" aria-label="Copy correlation ID" onClick={copy} />}>
          <span className="grid" aria-hidden>
            <Copy className={cn(iconClass, copied ? "scale-[0.25] opacity-0 blur-[4px]" : "blur-[0px]")} />
            <Check className={cn(iconClass, copied ? "blur-[0px]" : "scale-[0.25] opacity-0 blur-[4px]")} />
          </span>
        </TooltipTrigger>
        <TooltipContent>{copied ? "Copied" : "Copy"}</TooltipContent>
      </Tooltip>
    </div>
  );
}
