import { X } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { useUploadQueue } from "./upload-queue";

/** XFER-01: per-file progress, cancel, and visible error state for the upload queue. */
export function UploadQueuePanel() {
  const { uploads, cancel, dismiss } = useUploadQueue();
  const active = uploads.filter((u) => u.status !== "done" || Date.now() < 0);

  if (uploads.length === 0) return null;

  return (
    <div className="fixed right-4 bottom-4 z-50 w-80 rounded-lg border bg-card p-3 shadow-lg">
      <div className="mb-2 text-sm font-medium">Uploads</div>
      <div className="max-h-64 space-y-2 overflow-y-auto">
        {uploads.map((u) => {
          const pct = u.total > 0 ? Math.round((u.loaded / u.total) * 100) : 0;
          return (
            <div key={u.id} className="text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate">{u.fileName}</span>
                {u.status === "uploading" ? (
                  <button onClick={() => cancel(u.id)} aria-label={`Cancel upload of ${u.fileName}`}>
                    <X className="size-3.5" />
                  </button>
                ) : (
                  <button onClick={() => dismiss(u.id)} aria-label={`Dismiss ${u.fileName}`}>
                    <X className="size-3.5" />
                  </button>
                )}
              </div>
              {u.status === "uploading" && <Progress value={pct} className="mt-1 h-1.5" />}
              {u.status === "done" && <div className="text-green-600">Done</div>}
              {u.status === "error" && <div className="text-destructive">{u.error ?? "Upload failed"}</div>}
              {u.status === "canceled" && <div className="text-muted-foreground">Canceled</div>}
            </div>
          );
        })}
      </div>
      {active.length === 0 && (
        <Button variant="ghost" size="sm" className="mt-2 w-full" onClick={() => uploads.forEach((u) => dismiss(u.id))}>
          Clear
        </Button>
      )}
    </div>
  );
}
