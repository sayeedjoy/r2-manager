import { Folder, File as FileIcon } from "lucide-react";
import type { ObjectEntry } from "@r2-manager/shared";
import { baseName } from "@r2-manager/shared";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

interface FileGridProps {
  entries: ObjectEntry[];
  selected: Set<string>;
  onToggleSelect: (key: string) => void;
  onOpen: (entry: ObjectEntry) => void;
}

/** FILE-02: grid view, as an alternative to the list view in file-table.tsx. */
export function FileGrid({ entries, selected, onToggleSelect, onOpen }: FileGridProps) {
  if (entries.length === 0) {
    return <div className="p-8 text-center text-sm text-muted-foreground">This folder is empty.</div>;
  }

  const sorted = [...entries].sort((a, b) => (a.type === b.type ? 0 : a.type === "folder" ? -1 : 1));

  return (
    <div className="grid grid-cols-2 gap-3 p-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
      {sorted.map((entry) => (
        <div
          key={entry.key}
          className={cn(
            "group relative flex cursor-pointer flex-col items-center gap-1.5 rounded-md border p-3 text-center hover:bg-accent",
            selected.has(entry.key) && "border-primary bg-accent",
          )}
          onDoubleClick={() => onOpen(entry)}
          onClick={() => onOpen(entry)}
        >
          <Checkbox
            className="absolute top-1.5 left-1.5 opacity-0 group-hover:opacity-100 data-[state=checked]:opacity-100"
            checked={selected.has(entry.key)}
            onCheckedChange={() => onToggleSelect(entry.key)}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Select ${baseName(entry.key)}`}
          />
          {entry.type === "folder" ? (
            <Folder className="size-10 text-muted-foreground" />
          ) : (
            <FileIcon className="size-10 text-muted-foreground" />
          )}
          <span className="w-full truncate text-xs" title={baseName(entry.key)}>
            {baseName(entry.key)}
          </span>
        </div>
      ))}
    </div>
  );
}
