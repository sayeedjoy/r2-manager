import { useEffect, useEffectEvent, useState, type ReactNode } from "react"
import ReactMarkdown from "react-markdown"
import { useQueryClient } from "@tanstack/react-query"
import { ChevronLeft, ChevronRight, Download, Pencil } from "lucide-react"
import type { ObjectEntry } from "@r2-manager/shared"
import { baseName, previewKindFor, isEditableKind } from "@r2-manager/shared"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { api } from "@/lib/api"
import { CsvTable } from "./csv-table"
import { JsonlView } from "./jsonl-view"

interface PreviewSheetProps {
  bucket: string
  entry: ObjectEntry
  onClose: () => void
  onEdit: () => void
  /** The current folder's images, in display order, that an image preview can step through. */
  gallery?: ObjectEntry[]
  onNavigate?: (entry: ObjectEntry) => void
}

type PreviewState =
  | { status: "loading" }
  | { status: "too-large"; size: number; limit: number }
  | { status: "error"; message: string }
  | { status: "binary"; blobUrl: string; contentType: string }
  | { status: "text"; text: string }

/**
 * PREV-01/02/03: previews PDF, images, text, Markdown, CSV, and JSON/JSONL
 * within the configured size limit; everything else (or anything over the
 * limit) falls back to a plain download offer. Markdown renders without raw
 * HTML, and text/CSV/JSON render as text - nothing here executes untrusted
 * content on the app's own origin.
 *
 * Images open in a larger stage that steps through the folder's other images
 * with the arrow buttons or the Left/Right keys.
 */
export function PreviewSheet({
  bucket,
  entry,
  onClose,
  onEdit,
  gallery = [],
  onNavigate,
}: PreviewSheetProps) {
  const qc = useQueryClient()
  const [state, setState] = useState<PreviewState>({ status: "loading" })

  const contentUrl = api.contentUrl(bucket, entry.key)
  const kind = previewKindFor(entry.key)
  const isImage = kind === "image"

  // Stepping to another image reuses this dialog, so drop the old image during
  // render: its blob URL is revoked as soon as the next load starts.
  const [shownKey, setShownKey] = useState(entry.key)
  if (shownKey !== entry.key) {
    setShownKey(entry.key)
    setState({ status: "loading" })
  }

  const index = isImage ? gallery.findIndex((e) => e.key === entry.key) : -1
  const prev = index > 0 ? gallery[index - 1] : undefined
  const next =
    index >= 0 && index < gallery.length - 1 ? gallery[index + 1] : undefined
  const canNavigate = index >= 0 && gallery.length > 1 && !!onNavigate

  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (!canNavigate || event.altKey || event.ctrlKey || event.metaKey) return
    const target =
      event.key === "ArrowLeft"
        ? prev
        : event.key === "ArrowRight"
          ? next
          : undefined
    if (!target) return
    event.preventDefault()
    onNavigate?.(target)
  })

  useEffect(() => {
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  useEffect(() => {
    let cancelled = false
    let objectUrl: string | null = null

    async function load() {
      try {
        const [settings, metadata] = await Promise.all([
          // Cached, so stepping through images doesn't refetch the settings.
          qc.fetchQuery({
            queryKey: ["settings"],
            queryFn: api.getAppSettings,
            staleTime: 60_000,
          }),
          api.getMetadata(bucket, entry.key),
        ])
        if (cancelled) return

        if (metadata.size > settings.maxPreviewSizeBytes) {
          setState({
            status: "too-large",
            size: metadata.size,
            limit: settings.maxPreviewSizeBytes,
          })
          return
        }

        if (kind === "image" || kind === "pdf") {
          const res = await fetch(contentUrl, { credentials: "include" })
          if (!res.ok) throw new Error("Failed to load preview.")
          let blob = await res.blob()
          if (cancelled) return
          // PREV-01: pin the PDF blob's type so the browser always hands it to
          // its PDF viewer and never renders it as HTML on our origin, whatever
          // content type the object was stored with. That makes an iframe
          // sandbox unnecessary (Chrome refuses to show PDFs in sandboxed frames).
          if (kind === "pdf")
            blob = new Blob([blob], { type: "application/pdf" })
          objectUrl = URL.createObjectURL(blob)
          setState({
            status: "binary",
            blobUrl: objectUrl,
            contentType: metadata.contentType ?? blob.type,
          })
        } else if (kind === "unsupported") {
          setState({
            status: "error",
            message: "Preview isn't available for this file type.",
          })
        } else {
          const text = await api.getContent(bucket, entry.key)
          if (cancelled) return
          setState({ status: "text", text })
        }
      } catch (err) {
        if (!cancelled)
          setState({
            status: "error",
            message:
              err instanceof Error ? err.message : "Failed to load preview.",
          })
      }
    }
    load()

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bucket, entry.key])

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className={
          isImage
            ? "flex h-[min(90vh,960px)] flex-col sm:max-w-5xl"
            : "flex max-h-[85vh] flex-col sm:max-w-3xl"
        }
      >
        <DialogHeader className="gap-1 pr-8">
          <DialogTitle
            className="truncate leading-normal"
            title={baseName(entry.key)}
          >
            {baseName(entry.key)}
          </DialogTitle>
          <DialogDescription
            className={canNavigate ? "tabular-nums" : "sr-only"}
          >
            {canNavigate
              ? `Image ${index + 1} of ${gallery.length}`
              : "File preview"}
          </DialogDescription>
        </DialogHeader>

        {isImage ? (
          <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-lg bg-muted/60 ring-1 ring-foreground/5">
            {state.status === "binary" ? (
              <img
                src={state.blobUrl}
                alt={baseName(entry.key)}
                className="max-h-full max-w-full object-contain"
              />
            ) : (
              <StatusMessage state={state} />
            )}

            {canNavigate && (
              <>
                <StageButton
                  side="left"
                  label="Previous image"
                  disabled={!prev}
                  onClick={() => prev && onNavigate?.(prev)}
                >
                  <ChevronLeft />
                </StageButton>
                <StageButton
                  side="right"
                  label="Next image"
                  disabled={!next}
                  onClick={() => next && onNavigate?.(next)}
                >
                  <ChevronRight />
                </StageButton>
              </>
            )}
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-auto">
            <StatusMessage state={state} />

            {state.status === "binary" && kind === "pdf" && (
              <iframe
                title={baseName(entry.key)}
                src={state.blobUrl}
                className="h-[65vh] w-full rounded border"
              />
            )}

            {state.status === "text" && kind === "markdown" && (
              <div className="prose prose-sm dark:prose-invert max-w-none p-2">
                <ReactMarkdown>{state.text}</ReactMarkdown>
              </div>
            )}

            {state.status === "text" && kind === "csv" && (
              <CsvTable text={state.text} />
            )}

            {state.status === "text" && kind === "jsonl" && (
              <JsonlView text={state.text} />
            )}

            {state.status === "text" && kind === "json" && (
              <pre className="overflow-auto rounded-md border bg-muted/30 p-3 text-xs">
                {(() => {
                  try {
                    return JSON.stringify(JSON.parse(state.text), null, 2)
                  } catch {
                    return state.text
                  }
                })()}
              </pre>
            )}

            {state.status === "text" && kind === "text" && (
              <pre className="overflow-auto rounded-md border bg-muted/30 p-3 text-xs whitespace-pre-wrap">
                {state.text}
              </pre>
            )}
          </div>
        )}

        <DialogFooter>
          {isEditableKind(kind) && state.status !== "too-large" && (
            <Button variant="outline" onClick={onEdit}>
              <Pencil className="mr-1 size-4" /> Edit
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() =>
              window.open(contentUrl, "_blank", "noopener,noreferrer")
            }
          >
            <Download className="mr-1 size-4" /> Download
          </Button>
          <Button onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Loading, error and over-the-limit messages; renders nothing once content is ready. */
function StatusMessage({ state }: { state: PreviewState }) {
  if (state.status === "binary" || state.status === "text") return null
  return (
    <div className="p-8 text-center text-sm text-muted-foreground">
      {state.status === "loading" && "Loading preview..."}
      {state.status === "error" && state.message}
      {state.status === "too-large" && (
        <>
          This file ({(state.size / 1024 / 1024).toFixed(1)} MB) is over the{" "}
          {(state.limit / 1024 / 1024).toFixed(1)} MB preview limit. Download
          it to view the full contents.
        </>
      )}
    </div>
  )
}

/** Previous/next arrow floating over the image stage; hidden at either end. */
function StageButton({
  side,
  label,
  disabled,
  onClick,
  children,
}: {
  side: "left" | "right"
  label: string
  disabled: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <Button
      variant="outline"
      size="icon"
      aria-label={label}
      aria-keyshortcuts={side === "left" ? "ArrowLeft" : "ArrowRight"}
      title={`${label} (${side === "left" ? "←" : "→"})`}
      disabled={disabled}
      onClick={onClick}
      className={`absolute top-1/2 size-9 -translate-y-1/2 rounded-full bg-background/85 shadow-sm backdrop-blur-sm disabled:invisible ${side === "left" ? "left-3" : "right-3"}`}
    >
      {children}
    </Button>
  )
}
