import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileDown, FolderInput } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { api } from "@/lib/api";
import { useBuckets } from "@/hooks/use-listing";

/** MAIL-04: inbox listing plus a per-message attachment view. Attachment preview/download reuses the same content viewer as ordinary files. */
export function InboxPage() {
  const { data, isLoading } = useQuery({ queryKey: ["mail", "messages"], queryFn: api.listMailMessages });
  const [openMessageId, setOpenMessageId] = useState<string | null>(null);

  return (
    <div className="p-6">
      <h1 className="mb-4 text-lg font-medium">Inbox</h1>
      {isLoading && <div className="text-sm text-muted-foreground">Loading...</div>}
      {data && data.messages.length === 0 && <div className="text-sm text-muted-foreground">No messages yet.</div>}
      {data && data.messages.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Sender</TableHead>
              <TableHead>Recipient</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead>Received</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.messages.map((m) => (
              <TableRow key={m.id} className="cursor-pointer" onClick={() => setOpenMessageId(m.id)}>
                <TableCell>{m.sender}</TableCell>
                <TableCell>{m.recipient}</TableCell>
                <TableCell>{m.subject ?? "—"}</TableCell>
                <TableCell>{new Date(m.receivedAt).toLocaleString()}</TableCell>
                <TableCell>
                  <Badge variant={m.status === "processed" ? "default" : "destructive"}>{m.status}</Badge>
                  {m.reason && <span className="ml-2 text-xs text-muted-foreground">{m.reason}</span>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {openMessageId && <MessageDialog messageId={openMessageId} onClose={() => setOpenMessageId(null)} />}
    </div>
  );
}

function MessageDialog({ messageId, onClose }: { messageId: string; onClose: () => void }) {
  const { data } = useQuery({ queryKey: ["mail", "message", messageId], queryFn: () => api.getMailMessage(messageId) });
  const [copyTarget, setCopyTarget] = useState<{ id: string; filename: string } | null>(null);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{data?.message.subject ?? "(no subject)"}</DialogTitle>
        </DialogHeader>

        {data && (
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              From {data.message.sender} to {data.message.recipient} &middot;{" "}
              {new Date(data.message.receivedAt).toLocaleString()}
            </div>

            <div>
              <Label>Attachments</Label>
              {data.attachments.length === 0 && <div className="text-sm text-muted-foreground">No attachments.</div>}
              <div className="space-y-1">
                {data.attachments.map((a) => (
                  <div key={a.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
                    <span className="truncate">
                      {a.displayFilename}
                      {a.status === "rejected" && (
                        <Badge variant="destructive" className="ml-2">
                          rejected
                        </Badge>
                      )}
                    </span>
                    {a.status === "stored" && (
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Download ${a.displayFilename}`}
                          onClick={() => window.open(api.attachmentContentUrl(a.id), "_blank")}
                        >
                          <FileDown className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Copy ${a.displayFilename} to a folder`}
                          onClick={() => setCopyTarget({ id: a.id, filename: a.displayFilename })}
                        >
                          <FolderInput className="size-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>

      {copyTarget && <CopyAttachmentDialog attachment={copyTarget} onClose={() => setCopyTarget(null)} />}
    </Dialog>
  );
}

function CopyAttachmentDialog({ attachment, onClose }: { attachment: { id: string; filename: string }; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: bucketsData } = useBuckets();
  const [destBucket, setDestBucket] = useState(bucketsData?.buckets[0] ?? "");
  const [destPrefix, setDestPrefix] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCopy() {
    setBusy(true);
    setError(null);
    try {
      const destKey = `${destPrefix ? `${destPrefix.replace(/\/$/, "")}/` : ""}${attachment.filename}`;
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
        <DialogHeader>
          <DialogTitle>Copy "{attachment.filename}" to a folder</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="copy-bucket">Bucket</Label>
            <NativeSelect id="copy-bucket" value={destBucket} onChange={(e) => setDestBucket(e.target.value)}>
              {bucketsData?.buckets.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div>
            <Label htmlFor="copy-prefix">Folder (blank for bucket root)</Label>
            <Input id="copy-prefix" value={destPrefix} onChange={(e) => setDestPrefix(e.target.value)} placeholder="team-a/attachments" />
          </div>
        </div>
        {error && <div className="text-sm text-destructive">{error}</div>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={handleCopy} disabled={busy || !destBucket}>
            {busy ? "Copying..." : "Copy"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
