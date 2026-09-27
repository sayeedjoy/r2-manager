import { useMemo, useState } from "react";
import type { ObjectEntry } from "@r2-manager/shared";
import { baseName, previewKindFor } from "@r2-manager/shared";
import { Checkbox } from "@/components/ui/checkbox";
import { api } from "@/lib/api";
import { formatBytes } from "@/lib/format";
import { FileKindIcon } from "./file-icon";

interface FileGridProps {
  bucket: string;
  entries: ObjectEntry[];
  selected: Set<string>;
  onToggleSelect: (key: string) => void;
  onOpen: (entry: ObjectEntry) => void;
}

/** Thumbnails fetch the whole object, so skip them for images too large to be worth it in a grid. */
const MAX_THUMBNAIL_BYTES = 5 * 1024 * 1024;

/** FILE-02: grid view, as an alternative to the list view in file-table.tsx. */
export function FileGrid({ bucket, entries, selected, onToggleSelect, onOpen }: FileGridProps) {
  const sorted = useMemo(
    () =>
      [...entries].sort((a, b) =>
        a.type === b.type ? baseName(a.key).localeCompare(baseName(b.key)) : a.type === "folder" ? -1 : 1,
      ),
    [entries],
  );

  return (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-3 p-3">
      {sorted.map((entry) => {
        const name = baseName(entry.key);
        const isSelected = selected.has(entry.key);

        return (
          <li key={entry.key} className="group/tile relative">
            {/* Radius is concentric: rounded-xl tile minus p-1.5 padding gives the rounded-md preview inside it. */}
            <button
              type="button"
              onClick={() => onOpen(entry)}
              data-selected={isSelected || undefined}
              className="flex w-full flex-col gap-2 rounded-xl p-1.5 pb-2.5 text-left ring-1 ring-foreground/10 transition-colors outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 data-selected:bg-muted data-selected:ring-2 data-selected:ring-primary"
            >
              <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-md bg-muted">
                <TilePreview bucket={bucket} entry={entry} />
              </div>
              <div className="min-w-0 px-1">
                <p className="truncate text-sm font-medium" title={name}>
                  {name}
                </p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {entry.type === "folder" ? "Folder" : formatBytes(entry.size)}
                </p>
              </div>
            </button>
            {/* A sibling rather than a child: a checkbox can't be nested inside the tile's button. */}
            <Checkbox
              className="absolute top-3 left-3 bg-background opacity-0 transition-opacity group-hover/tile:opacity-100 focus-visible:opacity-100 data-checked:opacity-100 pointer-coarse:opacity-100"
              checked={isSelected}
              onCheckedChange={() => onToggleSelect(entry.key)}
              aria-label={`Select ${name}`}
            />
          </li>
        );
      })}
    </ul>
  );
}

function TilePreview({ bucket, entry }: { bucket: string; entry: ObjectEntry }) {
  const [failed, setFailed] = useState(false);
  const showThumbnail =
    !failed && entry.type === "file" && previewKindFor(entry.key) === "image" && (entry.size ?? 0) <= MAX_THUMBNAIL_BYTES;

  if (!showThumbnail) return <FileKindIcon entry={entry} className="size-8 text-muted-foreground" />;

  return (
    <img
      src={api.contentUrl(bucket, entry.key)}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className="size-full rounded-md object-cover outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10"
    />
  );
}
