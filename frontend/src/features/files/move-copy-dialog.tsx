import { useState } from "react";
import type { ObjectEntry } from "@r2-manager/shared";
import { baseName, joinKey, normalizeFolderKey } from "@r2-manager/shared";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Progress } from "@/components/ui/progress";
import { api } from "@/lib/api";
import { useBuckets } from "@/hooks/use-listing";

interface MoveCopyDialogProps {
  mode: "move" | "copy";
  sourceBucket: string;
  entries: ObjectEntry[];
  onClose: () => void;
  onDone: () => void;
}

/**
 * FILE-04/FILE-05: moves or copies a multi-select of files and folders to a
 * destination bucket/prefix. Files go through objects/move|copy; folders run
 * as cursor-batched tree operations with visible progress (folder ops are
 * not atomic - NFR-09).
 */
export function MoveCopyDialog({ mode, sourceBucket, entries, onClose, onDone }: MoveCopyDialogProps) {
  const { data: bucketsData } = useBuckets();
  const [destBucket, setDestBucket] = useState(sourceBucket);
  const [destPrefix, setDestPrefix] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runFolderOp(entry: ObjectEntry) {
    let cursor: string | undefined;
    for (;;) {
      const destFolderPrefix = normalizeFolderKey(joinKey(destPrefix, baseName(entry.key)));
      const result = await api.treeOp({
        op: mode,
        sourceBucket,
        sourcePrefix: entry.key,
        destBucket,
        destPrefix: destFolderPrefix,
        onConflict: "rename",
        cursor,
      });
      const failed = result.processed.find((p) => p.status === "failed");
      if (failed) throw new Error(`Failed on "${failed.key}": ${failed.reason}`);
      if (result.done) return;
      cursor = result.cursor ?? undefined;
    }
  }

  async function handleConfirm() {
    setBusy(true);
    setError(null);
    setProgress({ done: 0, total: entries.length });
    try {
      for (const entry of entries) {
        if (entry.type === "folder") {
          await runFolderOp(entry);
        } else {
          const destKey = joinKey(destPrefix, baseName(entry.key));
          if (mode === "move") await api.move(sourceBucket, entry.key, destBucket, destKey, "rename");
          else await api.copy(sourceBucket, entry.key, destBucket, destKey, "rename");
        }
        setProgress((prev) => (prev ? { ...prev, done: prev.done + 1 } : prev));
      }
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Operation failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "move" ? "Move" : "Copy"} {entries.length} item{entries.length === 1 ? "" : "s"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label htmlFor="dest-bucket">Destination bucket</Label>
            <NativeSelect id="dest-bucket" value={destBucket} onChange={(e) => setDestBucket(e.target.value)}>
              {bucketsData?.buckets.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div>
            <Label htmlFor="dest-prefix">Destination folder (blank for bucket root)</Label>
            <Input id="dest-prefix" value={destPrefix} onChange={(e) => setDestPrefix(e.target.value)} placeholder="team-a/reports" />
          </div>
        </div>

        {progress && (
          <div className="space-y-1">
            <Progress value={(progress.done / progress.total) * 100} />
            <div className="text-xs text-muted-foreground">
              {progress.done} / {progress.total} items
            </div>
          </div>
        )}
        {error && <div className="text-sm text-destructive">{error}</div>}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={busy}>
            {busy ? "Working..." : mode === "move" ? "Move" : "Copy"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
