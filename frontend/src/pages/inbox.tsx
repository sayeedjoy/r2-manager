import { useMemo, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, CircleCheck, FileDown, FolderInput, Inbox, Paperclip, RefreshCw, TriangleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PageHeader } from "@/components/layout/page-header";
import { TableCard, TableSkeleton } from "@/components/layout/table-card";
import { api, type MailAttachment, type MailMessage } from "@/lib/api";
import { RelativeTime } from "@/components/relative-time";
import { formatBytes, formatDateTime } from "@/lib/format";
import { useBuckets } from "@/hooks/use-listing";

type StatusFilter = "all" | MailMessage["status"];

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "processed", label: "Processed" },
  { value: "rejected", label: "Rejected" },
  { value: "failed", label: "Failed" },
];

/** MAIL-04: inbox listing plus a per-message attachment view. Attachment preview/download reuses the same content viewer as ordinary files. */
export function InboxPage() {
  const { data, isLoading, error, refetch, isFetching } = useQuery({ queryKey: ["mail", "messages"], queryFn: api.listMailMessages });
  const [openMessageId, setOpenMessageId] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusFilter>("all");

  const messages = useMemo(() => data?.messages ?? [], [data]);
  const visible = status === "all" ? messages : messages.filter((m) => m.status === status);
  const countFor = (value: StatusFilter) => (value === "all" ? messages.length : messages.filter((m) => m.status === value).length);

  let content;
  if (isLoading) {
    content = (
      <TableCard>
        <TableSkeleton />
      </TableCard>
    );
  } else if (error) {
    content = (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <TriangleAlert />
          </EmptyMedia>
          <EmptyTitle>Couldn't load the inbox</EmptyTitle>
          <EmptyDescription>{error.message}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button variant="outline" onClick={() => refetch()}>
            Try again
          </Button>
        </EmptyContent>
      </Empty>
    );
  } else if (messages.length === 0) {
    content = (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Inbox />
          </EmptyMedia>
          <EmptyTitle>No mail yet</EmptyTitle>
          <EmptyDescription>
            Messages sent to your Email Routing address show up here, with their attachments stored in R2.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  } else {
    content = (
      <TableCard>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>From</TableHead>
              <TableHead className="hidden sm:table-cell">Subject</TableHead>
              <TableHead className="hidden md:table-cell">Received</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                  No {status} messages.
                </TableCell>
              </TableRow>
            )}
            {visible.map((m) => (
              <TableRow key={m.id} className="cursor-pointer" onClick={() => setOpenMessageId(m.id)}>
                {/* On phones the subject folds into this cell, which then takes the spare width instead of the Subject column. */}
                <TableCell className="w-full max-w-0 sm:w-auto sm:max-w-56">
                  <div className="flex flex-col">
                    <span className="truncate font-medium">{m.sender}</span>
                    <span className="truncate text-xs text-muted-foreground max-sm:hidden">to {m.recipient}</span>
                    <span className="truncate text-xs text-muted-foreground sm:hidden">{m.subject ?? "(no subject)"}</span>
                  </div>
                </TableCell>
                <TableCell className="hidden w-full max-w-0 sm:table-cell">
                  {/* The row is clickable for the mouse; this button makes it reachable from the keyboard. */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenMessageId(m.id);
                    }}
                    className="max-w-full truncate rounded-sm text-left underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    {m.subject ?? <span className="text-muted-foreground">(no subject)</span>}
                  </button>
                </TableCell>
                <TableCell className="hidden text-muted-foreground md:table-cell">
                  <RelativeTime value={m.receivedAt} />
                </TableCell>
                <TableCell>
                  <StatusBadge status={m.status} reason={m.reason} />
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
        title="Inbox"
        description="Attachments received through Cloudflare Email Routing. Shows the latest 100 messages."
        actions={
          <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? <Spinner data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />}
            Refresh
          </Button>
        }
      />

      {messages.length > 0 && (
        <ToggleGroup
          variant="outline"
          size="sm"
          spacing={0}
          aria-label="Filter by status"
          value={[status]}
          onValueChange={(value) => value[0] && setStatus(value[0] as StatusFilter)}
        >
          {FILTERS.map((f) => (
            <ToggleGroupItem key={f.value} value={f.value}>
              {f.label}
              <span className="text-muted-foreground tabular-nums">{countFor(f.value)}</span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      )}

      {content}

      {openMessageId && <MessageDialog messageId={openMessageId} onClose={() => setOpenMessageId(null)} />}
    </div>
  );
}

function StatusBadge({ status, reason }: { status: MailMessage["status"]; reason: string | null }) {
  const badge =
    status === "processed" ? (
      <Badge variant="secondary">
        <CircleCheck data-icon="inline-start" />
        Processed
      </Badge>
    ) : (
      <Badge variant="destructive">
        {status === "rejected" ? <Ban data-icon="inline-start" /> : <TriangleAlert data-icon="inline-start" />}
        {status === "rejected" ? "Rejected" : "Failed"}
      </Badge>
    );

  if (!reason) return badge;
  return (
    <Tooltip>
      <TooltipTrigger render={<span />}>{badge}</TooltipTrigger>
      <TooltipContent>{reason}</TooltipContent>
    </Tooltip>
  );
}

function MessageDialog({ messageId, onClose }: { messageId: string; onClose: () => void }) {
  const { data, isLoading } = useQuery({ queryKey: ["mail", "message", messageId], queryFn: () => api.getMailMessage(messageId) });
  const [copyTarget, setCopyTarget] = useState<MailAttachment | null>(null);
  const message = data?.message;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="pr-6">{isLoading ? <Skeleton className="h-5 w-48" /> : (message?.subject ?? "(no subject)")}</DialogTitle>
          <DialogDescription>
            {message ? (
              <>
                From {message.sender} to {message.recipient} · {formatDateTime(message.receivedAt)}
              </>
            ) : (
              "Loading message…"
            )}
          </DialogDescription>
        </DialogHeader>

        {message && message.status !== "processed" && (
          <Alert variant="destructive">
            <TriangleAlert />
            <AlertTitle>{message.status === "rejected" ? "Rejected" : "Processing failed"}</AlertTitle>
            {message.reason && <AlertDescription>{message.reason}</AlertDescription>}
          </Alert>
        )}

        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">
            Attachments {data && <span className="text-muted-foreground tabular-nums">{data.attachments.length}</span>}
          </h3>
          {isLoading && <Skeleton className="h-14 w-full rounded-lg" />}
          {data?.attachments.length === 0 && <p className="text-sm text-muted-foreground">This message had no attachments.</p>}
          {data && data.attachments.length > 0 && (
            <ItemGroup className="gap-2">
              {data.attachments.map((a) => (
                <Item key={a.id} variant="outline" size="sm">
                  <ItemMedia variant="icon">
                    <Paperclip />
                  </ItemMedia>
                  <ItemContent className="min-w-0">
                    <ItemTitle className="w-full truncate">{a.displayFilename}</ItemTitle>
                    <ItemDescription>{[a.size !== null ? formatBytes(a.size) : null, a.mimeType].filter(Boolean).join(" · ")}</ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    {a.status === "stored" ? (
                      <>
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label={`Download ${a.displayFilename}`}
                                onClick={() => window.open(api.attachmentContentUrl(a.id), "_blank")}
                              />
                            }
                          >
                            <FileDown />
                          </TooltipTrigger>
                          <TooltipContent>Download</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <Button variant="ghost" size="icon-sm" aria-label={`Copy ${a.displayFilename} to a folder`} onClick={() => setCopyTarget(a)} />
                            }
                          >
                            <FolderInput />
                          </TooltipTrigger>
                          <TooltipContent>Copy to a folder</TooltipContent>
                        </Tooltip>
                      </>
                    ) : (
                      <Badge variant="destructive">Rejected</Badge>
                    )}
                  </ItemActions>
                </Item>
              ))}
            </ItemGroup>
          )}
        </div>

        <DialogFooter showCloseButton />
      </DialogContent>

      {copyTarget && <CopyAttachmentDialog attachment={copyTarget} onClose={() => setCopyTarget(null)} />}
    </Dialog>
  );
}

function CopyAttachmentDialog({ attachment, onClose }: { attachment: MailAttachment; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: bucketsData } = useBuckets();
  const [destBucket, setDestBucket] = useState(bucketsData?.buckets[0] ?? "");
  const [destPrefix, setDestPrefix] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCopy(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const destKey = `${destPrefix ? `${destPrefix.replace(/\/$/, "")}/` : ""}${attachment.displayFilename}`;
      await api.copyAttachmentToFolder(attachment.id, destBucket, destKey);
      qc.invalidateQueries({ queryKey: ["listing"] });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to copy attachment");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent>
        <form onSubmit={handleCopy} className="contents">
          <DialogHeader>
            <DialogTitle>Copy to a folder</DialogTitle>
            <DialogDescription className="line-clamp-2 wrap-anywhere" title={attachment.displayFilename}>
              {attachment.displayFilename}
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="copy-bucket">Bucket</FieldLabel>
              <NativeSelect id="copy-bucket" value={destBucket} onChange={(e) => setDestBucket(e.target.value)}>
                {bucketsData?.buckets.map((b) => (
                  <NativeSelectOption key={b} value={b}>
                    {b}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel htmlFor="copy-prefix">Folder</FieldLabel>
              <Input id="copy-prefix" value={destPrefix} onChange={(e) => setDestPrefix(e.target.value)} placeholder="team-a/attachments" />
              <FieldDescription>Leave blank to copy to the bucket root.</FieldDescription>
            </Field>
          </FieldGroup>
          {error && (
            <Alert variant="destructive">
              <TriangleAlert />
              <AlertTitle>Couldn't copy the attachment</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" disabled={busy} />}>Cancel</DialogClose>
            <Button type="submit" disabled={busy || !destBucket}>
              {busy && <Spinner data-icon="inline-start" />}
              Copy
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
