import { Copy, Download, FolderInput, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BulkActionsBarProps {
  count: number;
  onDownloadZip: () => void;
  onMove: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onClear: () => void;
}

/** FILE-02/XFER-06: visible bulk actions for the current multi-selection. */
export function BulkActionsBar({ count, onDownloadZip, onMove, onCopy, onDelete, onClear }: BulkActionsBarProps) {
  if (count === 0) return null;

  return (
    <div className="flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm">
      <span className="font-medium">{count} selected</span>
      <div className="ml-auto flex gap-1">
        <Button variant="ghost" size="sm" onClick={onDownloadZip}>
          <Download className="mr-1 size-4" /> Download
        </Button>
        <Button variant="ghost" size="sm" onClick={onMove}>
          <FolderInput className="mr-1 size-4" /> Move
        </Button>
        <Button variant="ghost" size="sm" onClick={onCopy}>
          <Copy className="mr-1 size-4" /> Copy
        </Button>
        <Button variant="ghost" size="sm" onClick={onDelete} className="text-destructive hover:text-destructive">
          <Trash2 className="mr-1 size-4" /> Delete
        </Button>
        <Button variant="ghost" size="sm" onClick={onClear} aria-label="Clear selection">
          <X className="size-4" />
        </Button>
      </div>
    </div>
  );
}
