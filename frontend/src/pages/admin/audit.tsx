import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Copy, RefreshCw, ScrollText, Search, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PageHeader } from "@/components/layout/page-header";
import { TableCard, TableSkeleton } from "@/components/layout/table-card";
import { api, type AuditEvent } from "@/lib/api";
import { formatDateTime, formatRelativeDate } from "@/lib/format";
import { cn } from "@/lib/utils";

type OutcomeFilter = "all" | AuditEvent["outcome"];

/** ADMIN-01: audit trail. */
export function AdminAuditPage() {
  const { data, isLoading, error, refetch, isFetching } = useQuery({ queryKey: ["admin", "audit"], queryFn: api.getAudit });
  // Events only carry the actor's id; the users list (already cached by the Users page) turns it into a name.
  const { data: usersData } = useQuery({ queryKey: ["admin", "users"], queryFn: api.listUsers });
  const [search, setSearch] = useState("");
  const [outcome, setOutcome] = useState<OutcomeFilter>("all");

  const actorNames = useMemo(() => new Map(usersData?.users.map((u) => [u.id, u.displayName])), [usersData]);
  const events = useMemo(() => data?.events ?? [], [data]);
  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return events.filter(
      (e) =>
        (outcome === "all" || e.outcome === outcome) &&
        (!needle || [e.action, e.target, e.correlationId].some((v) => v?.toLowerCase().includes(needle))),
    );
  }, [events, search, outcome]);

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
  } else if (events.length === 0) {
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
      <TableCard>
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
            {visible.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  No events match these filters.
                </TableCell>
              </TableRow>
            )}
            {visible.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="text-muted-foreground">
                  <time dateTime={e.createdAt} title={formatDateTime(e.createdAt)}>
                    {formatRelativeDate(e.createdAt)}
                  </time>
                </TableCell>
                <TableCell>
                  <code className="font-mono text-xs">{e.action}</code>
                </TableCell>
                <TableCell className="hidden max-w-40 truncate sm:table-cell">
                  {e.actorId ? (actorNames.get(e.actorId) ?? <span className="text-muted-foreground">Unknown user</span>) : <span className="text-muted-foreground">System</span>}
                </TableCell>
                <TableCell className="hidden max-w-72 truncate font-mono text-xs md:table-cell" title={e.target ?? undefined}>
                  {e.target ?? <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell>
                  <Badge variant={e.outcome === "success" ? "secondary" : "destructive"} className="capitalize">
                    {e.outcome}
                  </Badge>
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  <CopyableId value={e.correlationId} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableCard>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <PageHeader
        title="Audit log"
        description="Changes made through R2 Manager, newest first. Shows the latest 100 events."
        actions={
          <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? <Spinner data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />}
            Refresh
          </Button>
        }
      />

      {events.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <InputGroup className="max-w-xs">
            <InputGroupAddon>
              <Search />
            </InputGroupAddon>
            <InputGroupInput
              placeholder="Action, target or correlation ID"
              aria-label="Search the audit log"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </InputGroup>
          <ToggleGroup
            variant="outline"
            spacing={0}
            aria-label="Filter by outcome"
            value={[outcome]}
            onValueChange={(value) => value[0] && setOutcome(value[0] as OutcomeFilter)}
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
