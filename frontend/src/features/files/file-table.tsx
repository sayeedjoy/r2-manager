import { useMemo, useState } from "react";
import { Folder, File as FileIcon, MoreHorizontal } from "lucide-react";
import type { ObjectEntry } from "@r2-manager/shared";
import { baseName } from "@r2-manager/shared";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "@/components/ui/context-menu";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

export interface FileAction {
  label: string;
  onSelect: (entry: ObjectEntry) => void;
  destructive?: boolean;
}

interface FileTableProps {
  entries: ObjectEntry[];
  selected: Set<string>;
  onToggleSelect: (key: string) => void;
  onOpen: (entry: ObjectEntry) => void;
  actions: FileAction[];
}

type SortKey = "name" | "size" | "lastModified";

function formatSize(bytes?: number): string {
  if (bytes === undefined) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}

/**
 * FILE-02/FILE-06: sortable list view with multi-select, a right-click
 * context menu, and an always-visible "more actions" menu so the same
 * actions work for touch, keyboard, and assistive technology users.
 */
export function FileTable({ entries, selected, onToggleSelect, onOpen, actions }: FileTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<1 | -1>(1);

  const sorted = useMemo(() => {
    const copy = [...entries];
    copy.sort((a, b) => {
      if (sortKey === "size") return ((a.size ?? -1) - (b.size ?? -1)) * sortDir;
      if (sortKey === "lastModified") return ((a.lastModified ?? "") < (b.lastModified ?? "") ? -1 : 1) * sortDir;
      return baseName(a.key).localeCompare(baseName(b.key)) * sortDir;
    });
    // Folders first regardless of sort column, matching familiar file-manager behavior.
    copy.sort((a, b) => (a.type === b.type ? 0 : a.type === "folder" ? -1 : 1));
    return copy;
  }, [entries, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === 1 ? -1 : 1));
    else {
      setSortKey(key);
      setSortDir(1);
    }
  }

  if (entries.length === 0) {
    return <div className="p-8 text-center text-sm text-muted-foreground">This folder is empty.</div>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10" />
          <TableHead className="cursor-pointer" onClick={() => toggleSort("name")}>
            Name
          </TableHead>
          <TableHead className="w-28 cursor-pointer" onClick={() => toggleSort("size")}>
            Size
          </TableHead>
          <TableHead className="w-48 cursor-pointer" onClick={() => toggleSort("lastModified")}>
            Last modified
          </TableHead>
          <TableHead className="w-10" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((entry) => (
          <ContextMenu key={entry.key}>
            <ContextMenuTrigger
              render={
                <TableRow
                  className="cursor-pointer"
                  onDoubleClick={() => onOpen(entry)}
                  data-selected={selected.has(entry.key)}
                />
              }
            >
              <TableCell onClick={(e) => e.stopPropagation()}>
                <Checkbox checked={selected.has(entry.key)} onCheckedChange={() => onToggleSelect(entry.key)} aria-label={`Select ${baseName(entry.key)}`} />
              </TableCell>
              <TableCell onClick={() => onOpen(entry)} className="flex items-center gap-2">
                {entry.type === "folder" ? <Folder className="size-4 text-muted-foreground" /> : <FileIcon className="size-4 text-muted-foreground" />}
                {baseName(entry.key)}
              </TableCell>
              <TableCell>{entry.type === "file" ? formatSize(entry.size) : "—"}</TableCell>
              <TableCell>{entry.lastModified ? new Date(entry.lastModified).toLocaleString() : "—"}</TableCell>
              <TableCell onClick={(e) => e.stopPropagation()}>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={<Button variant="ghost" size="icon" aria-label={`Actions for ${baseName(entry.key)}`} />}
                  >
                    <MoreHorizontal className="size-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {actions.map((action) => (
                      <DropdownMenuItem
                        key={action.label}
                        variant={action.destructive ? "destructive" : "default"}
                        onSelect={() => action.onSelect(entry)}
                      >
                        {action.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </ContextMenuTrigger>
            <ContextMenuContent>
              {actions.map((action) => (
                <ContextMenuItem key={action.label} variant={action.destructive ? "destructive" : "default"} onSelect={() => action.onSelect(entry)}>
                  {action.label}
                </ContextMenuItem>
              ))}
            </ContextMenuContent>
          </ContextMenu>
        ))}
      </TableBody>
    </Table>
  );
}
