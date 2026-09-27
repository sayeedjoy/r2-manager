import { useState } from "react";
import type { ObjectEntry } from "@r2-manager/shared";
import { baseName } from "@r2-manager/shared";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { api } from "@/lib/api";

interface ShareDialogProps {
  bucket: string;
  entry: ObjectEntry;
  onClose: () => void;
}

/** SHARE-01: create a revocable link with optional password, expiry, and download limit. */
export function ShareDialog({ bucket, entry, onClose }: ShareDialogProps) {
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
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share "{baseName(entry.key)}"</DialogTitle>
        </DialogHeader>

        {url ? (
          <div className="space-y-2">
            <Label>Link (shown only once)</Label>
            <Input readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigator.clipboard.writeText(url)}
            >
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
