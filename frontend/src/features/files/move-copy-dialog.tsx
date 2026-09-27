import { useState, type FormEvent } from "react";
import { TriangleAlert } from "lucide-react";
import type { ObjectEntry } from "@r2-manager/shared";
import { baseName, joinKey, normalizeFolderKey } from "@r2-manager/shared";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Progress, ProgressLabel, ProgressValue } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/lib/api";
import { pluralize } from "@/lib/format";
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

  const verb = mode === "move" ? "Move" : "Copy";
  const summary =
    entries.length === 1 ? `"${baseName(entries[0].key)}"` : pluralize(entries.length, "item");

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

  async function handleConfirm(event: FormEvent) {
    event.preventDefault();
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
        <form onSubmit={handleConfirm} className="contents">
          <DialogHeader>
            <DialogTitle>
              {verb} {summary}
            </DialogTitle>
            <DialogDescription>
              Name clashes at the destination get a numbered copy instead of overwriting.
            </DialogDescription>
          </DialogHeader>

          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="dest-bucket">Destination bucket</FieldLabel>
              <NativeSelect id="dest-bucket" value={destBucket} onChange={(e) => setDestBucket(e.target.value)} disabled={busy}>
                {bucketsData?.buckets.map((b) => (
                  <NativeSelectOption key={b} value={b}>
                    {b}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel htmlFor="dest-prefix">Destination folder</FieldLabel>
              <Input
                id="dest-prefix"
                value={destPrefix}
                onChange={(e) => setDestPrefix(e.target.value)}
                placeholder="team-a/reports"
                autoComplete="off"
                disabled={busy}
                className="font-mono"
              />
              <FieldDescription>Leave blank for the bucket root.</FieldDescription>
            </Field>
          </FieldGroup>

          {progress && (
            <Progress value={(progress.done / progress.total) * 100}>
              <ProgressLabel>{mode === "move" ? "Moving" : "Copying"}</ProgressLabel>
              <ProgressValue>{() => `${progress.done} of ${progress.total}`}</ProgressValue>
            </Progress>
          )}

          {error && (
            <Alert variant="destructive">
              <TriangleAlert />
              <AlertTitle>{verb} stopped partway</AlertTitle>
              {/* NFR-09: tree ops aren't atomic, so say plainly that some items may already be done. */}
              <AlertDescription>
                {error}
                {progress && progress.done > 0 &&
                  ` ${pluralize(progress.done, "item")} before this one ${progress.done === 1 ? "was" : "were"} already ${mode === "move" ? "moved" : "copied"}.`}
              </AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" disabled={busy} />}>Cancel</DialogClose>
            <Button type="submit" disabled={busy}>
              {busy && <Spinner data-icon="inline-start" />}
              {verb}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
