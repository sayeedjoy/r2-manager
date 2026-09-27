import { Copy, Download, FolderInput, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface BulkActionsBarProps {
  count: number;
  onDownloadZip: () => void;
  onMove: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onClear: () => void;
}

/**
 * FILE-02/XFER-06: bulk actions for the current multi-selection. It floats over the bottom of the listing so
 * selecting rows doesn't push the table down. It enters with @starting-style, which needs no mount effect.
 */
export function BulkActionsBar({ count, onDownloadZip, onMove, onCopy, onDelete, onClear }: BulkActionsBarProps) {
  if (count === 0) return null;

  return (
    <div
      role="toolbar"
      aria-label="Bulk actions"
      className="absolute inset-x-0 bottom-4 z-10 mx-auto flex w-fit max-w-[calc(100%-2rem)] items-center gap-1 overflow-x-auto rounded-xl bg-popover p-1.5 pl-3.5 text-popover-foreground shadow-lg ring-1 ring-foreground/10 transition-[opacity,translate] duration-200 ease-out-strong starting:opacity-0 motion-safe:starting:translate-y-2"
    >
      <span className="text-sm font-medium whitespace-nowrap tabular-nums">{count} selected</span>
      <Separator orientation="vertical" className="mx-1.5 data-vertical:h-5 data-vertical:self-auto" />
      <Button variant="ghost" size="sm" onClick={onDownloadZip}>
        <Download data-icon="inline-start" />
        <span className="max-sm:sr-only">Download</span>
      </Button>
      <Button variant="ghost" size="sm" onClick={onMove}>
        <FolderInput data-icon="inline-start" />
        <span className="max-sm:sr-only">Move</span>
      </Button>
      <Button variant="ghost" size="sm" onClick={onCopy}>
        <Copy data-icon="inline-start" />
        <span className="max-sm:sr-only">Copy</span>
      </Button>
      <Button variant="destructive" size="sm" onClick={onDelete}>
        <Trash2 data-icon="inline-start" />
        <span className="max-sm:sr-only">Delete</span>
      </Button>
      <Tooltip>
        <TooltipTrigger render={<Button variant="ghost" size="icon-sm" onClick={onClear} aria-label="Clear selection" />}>
          <X />
        </TooltipTrigger>
        <TooltipContent>Clear selection</TooltipContent>
      </Tooltip>
    </div>
  );
}
