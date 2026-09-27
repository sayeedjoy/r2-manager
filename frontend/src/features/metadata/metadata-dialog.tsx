import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { ObjectEntry } from "@r2-manager/shared";
import { baseName } from "@r2-manager/shared";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError } from "@/lib/api";

interface MetadataDialogProps {
  bucket: string;
  entry: ObjectEntry;
  onClose: () => void;
  onSaved: () => void;
}

/** META-01/02: view and edit HTTP + custom metadata, guarded by an If-Match ETag. */
export function MetadataDialog({ bucket, entry, onClose, onSaved }: MetadataDialogProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [etag, setEtag] = useState<string | null>(null);
  const [contentType, setContentType] = useState("");
  const [contentDisposition, setContentDisposition] = useState("");
  const [cacheControl, setCacheControl] = useState("");
  const [contentLanguage, setContentLanguage] = useState("");
  const [customMetadata, setCustomMetadata] = useState<{ key: string; value: string }[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .getMetadata(bucket, entry.key)
      .then((meta) => {
        if (cancelled) return;
        setEtag(meta.etag);
        setContentType(meta.contentType ?? "");
        setContentDisposition(meta.contentDisposition ?? "");
        setCacheControl(meta.cacheControl ?? "");
        setContentLanguage(meta.contentLanguage ?? "");
        setCustomMetadata(Object.entries(meta.customMetadata ?? {}).map(([key, value]) => ({ key, value: String(value) })));
      })
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : "Failed to load metadata"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [bucket, entry.key]);

  async function handleSave() {
    if (!etag) return;
    setSaving(true);
    setError(null);
    setConflict(false);
    try {
      await api.updateMetadata({
        bucket,
        key: entry.key,
        ifMatch: etag,
        contentType: contentType || undefined,
        contentDisposition: contentDisposition || undefined,
        cacheControl: cacheControl || undefined,
        contentLanguage: contentLanguage || undefined,
        customMetadata: Object.fromEntries(customMetadata.filter((m) => m.key.trim()).map((m) => [m.key.trim(), m.value])),
      });
      onSaved();
    } catch (err) {
      if (err instanceof ApiError && err.body.error.code === "PRECONDITION_FAILED") setConflict(true);
      else setError(err instanceof Error ? err.message : "Failed to save metadata");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Metadata for "{baseName(entry.key)}"</DialogTitle>
          <DialogDescription className="sr-only">Edit object metadata</DialogDescription>
        </DialogHeader>

        {loading && <div className="p-6 text-center text-sm text-muted-foreground">Loading...</div>}

        {!loading && !error && (
          <div className="space-y-3">
            {conflict && (
              <div className="rounded-md border border-destructive/50 bg-destructive/10 p-2 text-sm text-destructive">
                This file changed since metadata was loaded. Reload before saving again.
              </div>
            )}
            <div>
              <Label htmlFor="meta-content-type">Content-Type</Label>
              <Input id="meta-content-type" value={contentType} onChange={(e) => setContentType(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="meta-disposition">Content-Disposition</Label>
              <Input id="meta-disposition" value={contentDisposition} onChange={(e) => setContentDisposition(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="meta-cache">Cache-Control</Label>
              <Input id="meta-cache" value={cacheControl} onChange={(e) => setCacheControl(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="meta-language">Content-Language</Label>
              <Input id="meta-language" value={contentLanguage} onChange={(e) => setContentLanguage(e.target.value)} />
            </div>

            <div>
              <Label>Custom metadata</Label>
              <div className="space-y-2">
                {customMetadata.map((entry, i) => (
                  <div key={i} className="flex gap-2">
                    <Input
                      placeholder="key"
                      value={entry.key}
                      onChange={(e) =>
                        setCustomMetadata((prev) => prev.map((m, j) => (j === i ? { ...m, key: e.target.value } : m)))
                      }
                    />
                    <Input
                      placeholder="value"
                      value={entry.value}
                      onChange={(e) =>
                        setCustomMetadata((prev) => prev.map((m, j) => (j === i ? { ...m, value: e.target.value } : m)))
                      }
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Remove field"
                      onClick={() => setCustomMetadata((prev) => prev.filter((_, j) => j !== i))}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCustomMetadata((prev) => [...prev, { key: "", value: "" }])}
                >
                  <Plus className="mr-1 size-4" /> Add field
                </Button>
              </div>
            </div>
          </div>
        )}

        {error && <div className="p-4 text-sm text-destructive">{error}</div>}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          {!loading && !error && (
            <Button onClick={handleSave} disabled={saving || conflict}>
              {saving ? "Saving..." : "Save"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
