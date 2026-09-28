import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AttachmentUpload,
  type AttachmentUploadItem,
  type AttachmentUploadKind,
} from "@/components/motion/attachment-upload";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/components/toaster";
import { api } from "@/lib/api";
import { formatBytes, pluralize } from "@/lib/format";
import { useUploadQueue, type QueuedUpload } from "./upload-queue";

interface UploadDialogProps {
  folderName: string;
  /** Starts uploads into the current folder and returns each file's queue id, or null where it was skipped. */
  onUpload: (files: File[]) => (string | null)[];
  onClose: () => void;
}

const STATUS: Record<QueuedUpload["status"], AttachmentUploadItem["status"]> = {
  uploading: "uploading",
  done: "complete",
  error: "failed",
  canceled: "failed",
};

/**
 * XFER-01/XFER-03: picks or drops files into the current folder, showing the per-file size limit from the admin
 * settings up front. Rows follow the real upload queue, so progress and failures are the server's, and uploads
 * keep going (in the corner panel) after the dialog closes.
 */
export function UploadDialog({ folderName, onUpload, onClose }: UploadDialogProps) {
  const { uploads } = useUploadQueue();
  const settings = useQuery({ queryKey: ["settings"], queryFn: api.getAppSettings, staleTime: 60_000 });
  // Queue ids started from this dialog, with how each row should look.
  const [started, setStarted] = useState<Map<string, AttachmentUploadKind>>(() => new Map());

  const maxBytes = settings.data?.maxUploadSizeBytes;
  const items: AttachmentUploadItem[] = uploads
    .filter((u) => started.has(u.id))
    .map((u) => ({
      id: u.id,
      name: u.fileName,
      kind: started.get(u.id)!,
      size: u.total,
      status: STATUS[u.status],
      progress: u.total > 0 ? u.loaded / u.total : undefined,
      error: u.status === "canceled" ? "Canceled" : u.error,
    }));

  function handleFilesAdded(added: AttachmentUploadItem[], files: File[]) {
    const ids = onUpload(files);
    setStarted((prev) => {
      const next = new Map(prev);
      ids.forEach((id, i) => {
        // Images get a plain icon rather than the component's click-to-enlarge preview: that preview opens outside
        // this dialog, and clicking it would count as clicking away and close the dialog.
        if (id) next.set(id, added[i]?.kind === "image" ? "image" : "file");
      });
      return next;
    });
  }

  function handleRejected(files: File[]) {
    toast.add({
      status: "warning",
      title: `${pluralize(files.length, "file")} over the ${formatBytes(maxBytes)} limit`,
      description: files.map((f) => f.name).join(", "),
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload files</DialogTitle>
          <DialogDescription className="line-clamp-2 wrap-anywhere">
            Into {folderName}. Uploads keep going if you close this.
          </DialogDescription>
        </DialogHeader>
        <AttachmentUpload
          value={items}
          onFilesAdded={handleFilesAdded}
          onFilesRejected={handleRejected}
          maxFiles={Number.POSITIVE_INFINITY}
          maxFileSize={maxBytes}
          accept={settings.data?.allowedUploadTypes?.join(",")}
          disabled={!settings.data}
          title={settings.isError ? "Couldn't load the upload limits" : undefined}
          attachmentsLabel="Uploading now"
          classNames={{ list: "max-h-64 overflow-y-auto" }}
        />
      </DialogContent>
    </Dialog>
  );
}
