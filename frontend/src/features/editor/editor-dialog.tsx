import { useEffect, useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { api, ApiError } from "@/lib/api";

interface EditorDialogProps {
  bucket: string;
  entry: ObjectEntry;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * EDIT-01/02: in-browser text/Markdown/CSV/JSON editing up to the
 * configured size ceiling, with unsaved-changes protection and an ETag
 * conflict check on save.
 */
export function EditorDialog({ bucket, entry, onClose, onSaved }: EditorDialogProps) {
  const [loading, setLoading] = useState(true);
  const [original, setOriginal] = useState("");
  const [content, setContent] = useState("");
  const [etag, setEtag] = useState<string | null>(null);
  const [tooLarge, setTooLarge] = useState<{ size: number; limit: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [saving, setSaving] = useState(false);

  const dirty = content !== original;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [settings, metadata, text] = await Promise.all([
          api.getAppSettings(),
          api.getMetadata(bucket, entry.key),
          api.getContent(bucket, entry.key),
        ]);
        if (cancelled) return;
        if (metadata.size > settings.maxEditorSizeBytes) {
          setTooLarge({ size: metadata.size, limit: settings.maxEditorSizeBytes });
        } else {
          setOriginal(text);
          setContent(text);
          setEtag(metadata.etag);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load file.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [bucket, entry.key]);

  function handleClose() {
    if (dirty && !confirm("Discard unsaved changes?")) return;
    onClose();
  }

  async function handleSave() {
    if (!etag) return;
    setSaving(true);
    setError(null);
    setConflict(false);
    try {
      const result = await api.updateContent({ bucket, key: entry.key, ifMatch: etag, content });
      setEtag(result.etag);
      setOriginal(content);
      onSaved();
    } catch (err) {
      if (err instanceof ApiError && err.body.error.code === "PRECONDITION_FAILED") {
        setConflict(true);
      } else {
        setError(err instanceof Error ? err.message : "Failed to save.");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Edit "{baseName(entry.key)}"</DialogTitle>
          <DialogDescription className="sr-only">Text editor</DialogDescription>
        </DialogHeader>

        {loading && <div className="p-8 text-center text-sm text-muted-foreground">Loading...</div>}

        {tooLarge && (
          <div className="p-8 text-center text-sm text-muted-foreground">
            This file ({(tooLarge.size / 1024 / 1024).toFixed(1)} MB) is over the {(tooLarge.limit / 1024 / 1024).toFixed(1)} MB editor
            limit. Download it to edit locally.
          </div>
        )}

        {!loading && !tooLarge && !error && (
          <>
            {conflict && (
              <div className="rounded-md border border-destructive/50 bg-destructive/10 p-2 text-sm text-destructive">
                This file changed since you opened it. Reload to see the latest version before saving again.
              </div>
            )}
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="min-h-[50vh] flex-1 resize-none font-mono text-xs"
              spellCheck={false}
            />
          </>
        )}

        {error && <div className="p-4 text-sm text-destructive">{error}</div>}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          {!tooLarge && (
            <Button onClick={handleSave} disabled={!dirty || saving || conflict}>
              {saving ? "Saving..." : "Save"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
