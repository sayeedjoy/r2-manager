import { useMemo, useState, type FormEvent } from "react"
import { TriangleAlert } from "lucide-react"
import type { ObjectEntry } from "@r2-manager/shared"
import { baseName, parentPrefix } from "@r2-manager/shared"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from "@/components/ui/progress"
import { Spinner } from "@/components/ui/spinner"
import { pluralize } from "@/lib/format"
import { useBuckets } from "@/hooks/use-listing"
import { FolderPicker } from "./folder-picker"
import { transferEntries } from "./transfer"

interface MoveCopyDialogProps {
  mode: "move" | "copy"
  sourceBucket: string
  entries: ObjectEntry[]
  onClose: () => void
  onDone: () => void
}

/**
 * FILE-04/FILE-05: moves or copies a multi-select of files and folders to a
 * destination bucket/prefix, with visible progress (see transfer.ts).
 */
export function MoveCopyDialog({
  mode,
  sourceBucket,
  entries,
  onClose,
  onDone,
}: MoveCopyDialogProps) {
  const { data: bucketsData } = useBuckets()
  const [destBucket, setDestBucket] = useState(sourceBucket)
  // Open the picker where the selection lives, like a file manager's "Move to".
  const [destPrefix, setDestPrefix] = useState(() =>
    entries[0] ? parentPrefix(entries[0].key) : ""
  )
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<{
    done: number
    total: number
  } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const verb = mode === "move" ? "Move" : "Copy"
  const summary =
    entries.length === 1
      ? `"${baseName(entries[0].key)}"`
      : pluralize(entries.length, "item")

  // A folder can't be moved or copied into itself, so the picker won't open it.
  const blockedKeys = useMemo(
    () =>
      new Set(
        destBucket === sourceBucket
          ? entries.filter((e) => e.type === "folder").map((e) => e.key)
          : []
      ),
    [destBucket, sourceBucket, entries]
  )
  // Moving to the folder the items are already in would only rename them to numbered copies.
  const alreadyHere =
    mode === "move" &&
    destBucket === sourceBucket &&
    entries.every((e) => parentPrefix(e.key) === destPrefix)

  async function handleConfirm(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setProgress({ done: 0, total: entries.length })
    try {
      await transferEntries({
        mode,
        sourceBucket,
        entries,
        destBucket,
        destPrefix,
        onProgress: (done) => setProgress({ done, total: entries.length }),
      })
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Operation failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="sm:max-w-lg lg:max-w-2xl">
        <form onSubmit={handleConfirm} className="contents">
          <DialogHeader>
            <DialogTitle className="truncate pr-6" title={`${verb} ${summary}`}>
              {verb} {summary}
            </DialogTitle>
            <DialogDescription>
              Name clashes at the destination get a numbered copy instead of
              overwriting.
            </DialogDescription>
          </DialogHeader>

          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="dest-bucket">Destination bucket</FieldLabel>
              <NativeSelect
                id="dest-bucket"
                className="w-full"
                value={destBucket}
                onChange={(e) => {
                  setDestBucket(e.target.value)
                  setDestPrefix("")
                }}
                disabled={busy}
              >
                {bucketsData?.buckets.map((b) => (
                  <NativeSelectOption key={b} value={b}>
                    {b}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel>Destination folder</FieldLabel>
              <FolderPicker
                bucket={destBucket}
                prefix={destPrefix}
                onPrefixChange={setDestPrefix}
                blockedKeys={blockedKeys}
                disabled={busy}
              />
              <FieldDescription className="truncate">
                {alreadyHere
                  ? "Already in this folder. Pick another one."
                  : `${verb} to ${destBucket}/${destPrefix}`}
              </FieldDescription>
            </Field>
          </FieldGroup>

          {progress && (
            <Progress value={(progress.done / progress.total) * 100}>
              <ProgressLabel>
                {mode === "move" ? "Moving" : "Copying"}
              </ProgressLabel>
              <ProgressValue>
                {() => `${progress.done} of ${progress.total}`}
              </ProgressValue>
            </Progress>
          )}

          {error && (
            <Alert variant="destructive">
              <TriangleAlert />
              <AlertTitle>{verb} stopped partway</AlertTitle>
              {/* NFR-09: tree ops aren't atomic, so say plainly that some items may already be done. */}
              <AlertDescription>
                {error}
                {progress &&
                  progress.done > 0 &&
                  ` ${pluralize(progress.done, "item")} before this one ${progress.done === 1 ? "was" : "were"} already ${mode === "move" ? "moved" : "copied"}.`}
              </AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <DialogClose
              render={
                <Button type="button" variant="outline" disabled={busy} />
              }
            >
              Cancel
            </DialogClose>
            <Button type="submit" disabled={busy || alreadyHere}>
              {busy && <Spinner data-icon="inline-start" />}
              {verb}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
