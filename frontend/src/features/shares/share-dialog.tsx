import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock, Trash2 } from "lucide-react";
import type { ObjectEntry } from "@r2-manager/shared";
import { baseName } from "@r2-manager/shared";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { useConfirm } from "@/components/confirm-dialog";

interface ShareDialogProps {
  bucket: string;
  entry: ObjectEntry;
  onClose: () => void;
}

/** SHARE-01/05: create a revocable link with optional password/expiry/download limit, and manage existing ones. */
export function ShareDialog({ bucket, entry, onClose }: ShareDialogProps) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const sharesQuery = useQuery({
    queryKey: ["shares", bucket, entry.key],
    queryFn: () => api.listShares(bucket, entry.key),
  });

  const [password, setPassword] = useState("");
  const [expiryHours, setExpiryHours] = useState("168");
  const [maxDownloads, setMaxDownloads] = useState("");
  const [inlinePreview, setInlinePreview] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleCreate() {
    setBusy(true);
    try {
      const result = await api.createShare({
        bucket,
        key: entry.key,
        password: password || undefined,
        expiresAt: expiryHours ? new Date(Date.now() + Number(expiryHours) * 3600 * 1000).toISOString() : undefined,
        maxDownloads: maxDownloads ? Number(maxDownloads) : undefined,
        inlinePreview,
      });
      setUrl(result.url);
      qc.invalidateQueries({ queryKey: ["shares", bucket, entry.key] });
    } finally {
      setBusy(false);
    }
  }

  async function handleRevoke(shareId: string) {
    const ok = await confirm({
      title: "Revoke this share link?",
      description: "Anyone holding the link loses access immediately.",
      confirmLabel: "Revoke",
      destructive: true,
    });
    if (!ok) return;
    await api.revokeShare(shareId);
    qc.invalidateQueries({ queryKey: ["shares", bucket, entry.key] });
  }

  const activeShares = (sharesQuery.data?.shares ?? []).filter((s) => !s.revokedAt);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Share "{baseName(entry.key)}"</DialogTitle>
        </DialogHeader>

        {activeShares.length > 0 && (
          <div className="space-y-2">
            <Label>Active links</Label>
            {activeShares.map((share) => (
              <div key={share.id} className="flex items-center justify-between rounded-md border p-2 text-xs">
                <div className="flex flex-wrap items-center gap-1.5">
                  {share.hasPassword && (
                    <Badge variant="secondary">
                      <Lock className="mr-1 size-3" /> Password
                    </Badge>
                  )}
                  <span className="text-muted-foreground">
                    {share.maxDownloads ? `${share.reservedDownloads}/${share.maxDownloads} downloads` : `${share.reservedDownloads} downloads`}
                  </span>
                  <span className="text-muted-foreground">
                    {share.expiresAt ? `expires ${new Date(share.expiresAt).toLocaleString()}` : "no expiry"}
                  </span>
                </div>
                <Button variant="ghost" size="icon" aria-label="Revoke" onClick={() => handleRevoke(share.id)}>
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {url ? (
          <div className="space-y-2">
            <Label>New link (shown only once)</Label>
            <Input readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
            <Button variant="outline" size="sm" onClick={() => navigator.clipboard.writeText(url)}>
              Copy link
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <Label htmlFor="share-password">Password (optional)</Label>
              <Input id="share-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="share-expiry">Expires in (hours)</Label>
              <Input id="share-expiry" type="number" min="1" value={expiryHours} onChange={(e) => setExpiryHours(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="share-max">Max downloads (optional)</Label>
              <Input id="share-max" type="number" min="1" value={maxDownloads} onChange={(e) => setMaxDownloads(e.target.value)} />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="share-inline" checked={inlinePreview} onCheckedChange={(v) => setInlinePreview(!!v)} />
              <Label htmlFor="share-inline">Allow inline preview instead of forcing download</Label>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {url ? "Done" : "Cancel"}
          </Button>
          {!url && (
            <Button onClick={handleCreate} disabled={busy}>
              Create link
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
