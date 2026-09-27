import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Download, Pencil } from "lucide-react";
import type { ObjectEntry } from "@r2-manager/shared";
import { baseName, previewKindFor, isEditableKind } from "@r2-manager/shared";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { CsvTable } from "./csv-table";
import { JsonlView } from "./jsonl-view";

interface PreviewSheetProps {
  bucket: string;
  entry: ObjectEntry;
  onClose: () => void;
  onEdit: () => void;
}

/**
 * PREV-01/02/03: previews PDF, images, text, Markdown, CSV, and JSON/JSONL
 * within the configured size limit; everything else (or anything over the
 * limit) falls back to a plain download offer. Markdown renders without raw
 * HTML, and text/CSV/JSON render as text - nothing here executes untrusted
 * content on the app's own origin.
 */
export function PreviewSheet({ bucket, entry, onClose, onEdit }: PreviewSheetProps) {
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "too-large"; size: number; limit: number }
    | { status: "error"; message: string }
    | { status: "binary"; blobUrl: string; contentType: string }
    | { status: "text"; text: string }
  >({ status: "loading" });

  const contentUrl = api.contentUrl(bucket, entry.key);
  const kind = previewKindFor(entry.key);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    async function load() {
      try {
        const [settings, metadata] = await Promise.all([api.getAppSettings(), api.getMetadata(bucket, entry.key)]);
        if (cancelled) return;

        if (metadata.size > settings.maxPreviewSizeBytes) {
          setState({ status: "too-large", size: metadata.size, limit: settings.maxPreviewSizeBytes });
          return;
        }

        if (kind === "image" || kind === "pdf") {
          const res = await fetch(contentUrl, { credentials: "include" });
          const blob = await res.blob();
          if (cancelled) return;
          objectUrl = URL.createObjectURL(blob);
          setState({ status: "binary", blobUrl: objectUrl, contentType: metadata.contentType ?? blob.type });
        } else if (kind === "unsupported") {
          setState({ status: "error", message: "Preview isn't available for this file type." });
        } else {
          const text = await api.getContent(bucket, entry.key);
          if (cancelled) return;
          setState({ status: "text", text });
        }
      } catch (err) {
        if (!cancelled) setState({ status: "error", message: err instanceof Error ? err.message : "Failed to load preview." });
      }
    }
    load();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bucket, entry.key]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{baseName(entry.key)}</DialogTitle>
          <DialogDescription className="sr-only">File preview</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-auto">
          {state.status === "loading" && <div className="p-8 text-center text-sm text-muted-foreground">Loading preview...</div>}

          {state.status === "too-large" && (
            <div className="p-8 text-center text-sm text-muted-foreground">
              This file ({(state.size / 1024 / 1024).toFixed(1)} MB) is over the {(state.limit / 1024 / 1024).toFixed(1)} MB preview
              limit. Download it to view the full contents.
            </div>
          )}

          {state.status === "error" && <div className="p-8 text-center text-sm text-muted-foreground">{state.message}</div>}

          {state.status === "binary" && kind === "image" && (
            <img src={state.blobUrl} alt={baseName(entry.key)} className="mx-auto max-h-[65vh] object-contain" />
          )}

          {state.status === "binary" && kind === "pdf" && (
            <iframe title={baseName(entry.key)} src={state.blobUrl} sandbox="allow-same-origin" className="h-[65vh] w-full rounded border" />
          )}

          {state.status === "text" && kind === "markdown" && (
            <div className="prose prose-sm dark:prose-invert max-w-none p-2">
              <ReactMarkdown>{state.text}</ReactMarkdown>
            </div>
          )}

          {state.status === "text" && kind === "csv" && <CsvTable text={state.text} />}

          {state.status === "text" && kind === "jsonl" && <JsonlView text={state.text} />}

          {state.status === "text" && kind === "json" && (
            <pre className="overflow-auto rounded-md border bg-muted/30 p-3 text-xs">
              {(() => {
                try {
                  return JSON.stringify(JSON.parse(state.text), null, 2);
                } catch {
                  return state.text;
                }
              })()}
            </pre>
          )}

          {state.status === "text" && kind === "text" && (
            <pre className="overflow-auto rounded-md border bg-muted/30 p-3 text-xs whitespace-pre-wrap">{state.text}</pre>
          )}
        </div>

        <DialogFooter>
          {isEditableKind(kind) && state.status !== "too-large" && (
            <Button variant="outline" onClick={onEdit}>
              <Pencil className="mr-1 size-4" /> Edit
            </Button>
          )}
          <Button variant="outline" onClick={() => window.open(contentUrl, "_blank")}>
            <Download className="mr-1 size-4" /> Download
          </Button>
          <Button onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
