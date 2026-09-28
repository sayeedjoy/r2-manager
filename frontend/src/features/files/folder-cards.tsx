import { Folder } from "lucide-react";
import type { ObjectEntry } from "@r2-manager/shared";
import { baseName } from "@r2-manager/shared";

interface FolderCardsProps {
  folders: ObjectEntry[];
  onOpen: (folder: ObjectEntry) => void;
}

/** Enough to fill two rows on a wide screen without pushing the list off it. */
export const MAX_FOLDER_CARDS = 8;

/**
 * Quick-open shortcuts to the first folders in the current sort. The list below still has every folder with its
 * actions, so each card stays a single tap target.
 */
export function FolderCards({ folders, onOpen }: FolderCardsProps) {
  return (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(15rem,100%),1fr))] gap-2">
      {folders.slice(0, MAX_FOLDER_CARDS).map((folder) => {
        const name = baseName(folder.key);
        return (
          <li key={folder.key}>
            {/* Concentric radii: rounded-xl card minus p-2 padding gives the rounded-sm icon tile. */}
            <button
              type="button"
              title={name}
              onClick={() => onOpen(folder)}
              className="flex w-full items-center gap-3 rounded-xl bg-card p-2 pr-3 text-left ring-1 ring-foreground/10 transition-[background-color,box-shadow,scale] duration-150 ease-out outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 motion-safe:active:scale-96"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-sm bg-muted text-muted-foreground">
                <Folder className="size-4" aria-hidden />
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium">{name}</span>
                <span className="text-xs text-muted-foreground">Folder</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
