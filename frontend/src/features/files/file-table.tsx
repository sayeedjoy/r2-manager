import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, MoreHorizontal, type LucideIcon } from "lucide-react";
import type { ObjectEntry } from "@r2-manager/shared";
import { baseName } from "@r2-manager/shared";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { RelativeTime } from "@/components/relative-time";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";
import { FileKindIcon } from "./file-icon";

export interface FileAction {
  label: string;
  icon?: LucideIcon;
  onSelect: (entry: ObjectEntry) => void;
  destructive?: boolean;
  /** Restricts the action to matching entries (e.g. files only). Shown for everything when omitted. */
  showFor?: (entry: ObjectEntry) => boolean;
}

interface FileTableProps {
  entries: ObjectEntry[];
  selected: Set<string>;
  onToggleSelect: (key: string) => void;
  onSelectAll: (checked: boolean) => void;
  onOpen: (entry: ObjectEntry) => void;
  actions: FileAction[];
}

type SortKey = "name" | "size" | "lastModified";

/** Splits an entry's actions so destructive ones sit in their own group, after a separator. */
function actionGroups(actions: FileAction[], entry: ObjectEntry): FileAction[][] {
  const visible = actions.filter((action) => !action.showFor || action.showFor(entry));
  return [visible.filter((a) => !a.destructive), visible.filter((a) => a.destructive)].filter((group) => group.length > 0);
}

/**
 * FILE-02/FILE-06: sortable list view with multi-select, a right-click
 * context menu, and an always-visible "more actions" menu so the same
 * actions work for touch, keyboard, and assistive technology users.
 */
export function FileTable({ entries, selected, onToggleSelect, onSelectAll, onOpen, actions }: FileTableProps) {
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

  const selectedCount = entries.filter((e) => selected.has(e.key)).length;
  const allSelected = selectedCount === entries.length;
  const sortProps = { sortKey, sortDir, onSort: toggleSort };

  return (
    // The Table's own wrapper scrolls horizontally, which would trap the sticky header. Let the listing scroll instead.
    <div className="[&>[data-slot=table-container]]:overflow-visible">
      <Table>
        <TableHeader className="[&_tr]:border-b-0 [&_tr]:hover:bg-transparent">
          <TableRow className="[&>th]:sticky [&>th]:top-0 [&>th]:z-10 [&>th]:bg-card [&>th]:shadow-[inset_0_-1px_0_var(--color-border)]">
            <TableHead className="w-10 pl-3">
              <Checkbox
                checked={allSelected}
                indeterminate={selectedCount > 0 && !allSelected}
                onCheckedChange={() => onSelectAll(!allSelected)}
                aria-label="Select all"
              />
            </TableHead>
            <SortableHead label="Name" column="name" {...sortProps} />
            <SortableHead label="Size" column="size" className="w-24 text-right" alignEnd {...sortProps} />
            <SortableHead label="Modified" column="lastModified" className="hidden w-36 md:table-cell" {...sortProps} />
            <TableHead className="w-12 pr-3">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((entry) => {
            const name = baseName(entry.key);
            const isSelected = selected.has(entry.key);
            const groups = actionGroups(actions, entry);

            return (
              <ContextMenu key={entry.key}>
                <ContextMenuTrigger
                  render={
                    <TableRow data-state={isSelected ? "selected" : undefined} onDoubleClick={() => onOpen(entry)} />
                  }
                >
                  <TableCell className="pl-3" onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
                    <Checkbox checked={isSelected} onCheckedChange={() => onToggleSelect(entry.key)} aria-label={`Select ${name}`} />
                  </TableCell>
                  {/* max-w-0 + w-full lets the name column take the leftover width and truncate instead of widening the table. */}
                  <TableCell className="w-full max-w-0">
                    <button
                      type="button"
                      title={name}
                      onClick={() => onOpen(entry)}
                      className="flex max-w-full items-center gap-2.5 rounded-sm text-left underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      <FileKindIcon entry={entry} className="size-4 shrink-0 text-muted-foreground" />
                      <span className="truncate">{name}</span>
                    </button>
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground tabular-nums">
                    {entry.type === "file" ? formatBytes(entry.size) : "—"}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">
                    {entry.lastModified ? <RelativeTime value={entry.lastModified} /> : "—"}
                  </TableCell>
                  <TableCell className="pr-3 text-right" onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${name}`} />}>
                        <MoreHorizontal />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        {groups.map((group, i) => (
                          <DropdownMenuGroup key={i}>
                            {i > 0 && <DropdownMenuSeparator />}
                            {group.map(({ label, icon: ActionIcon, destructive, onSelect }) => (
                              <DropdownMenuItem key={label} variant={destructive ? "destructive" : "default"} onClick={() => onSelect(entry)}>
                                {ActionIcon && <ActionIcon />}
                                {label}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuGroup>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </ContextMenuTrigger>
                <ContextMenuContent className="w-44">
                  {groups.map((group, i) => (
                    <ContextMenuGroup key={i}>
                      {i > 0 && <ContextMenuSeparator />}
                      {group.map(({ label, icon: ActionIcon, destructive, onSelect }) => (
                        <ContextMenuItem key={label} variant={destructive ? "destructive" : "default"} onClick={() => onSelect(entry)}>
                          {ActionIcon && <ActionIcon />}
                          {label}
                        </ContextMenuItem>
                      ))}
                    </ContextMenuGroup>
                  ))}
                </ContextMenuContent>
              </ContextMenu>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

interface SortableHeadProps {
  label: string;
  column: SortKey;
  sortKey: SortKey;
  sortDir: 1 | -1;
  onSort: (column: SortKey) => void;
  className?: string;
  /** Right-aligned numeric columns put the arrow before the label so the label stays flush with the numbers. */
  alignEnd?: boolean;
}

function SortableHead({ label, column, sortKey, sortDir, onSort, className, alignEnd }: SortableHeadProps) {
  const active = column === sortKey;
  const Arrow = sortDir === 1 ? ArrowUp : ArrowDown;

  return (
    <TableHead className={className} aria-sort={active ? (sortDir === 1 ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        onClick={() => onSort(column)}
        className={cn(
          "inline-flex items-center gap-1 rounded-sm outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
          !active && "text-muted-foreground",
          alignEnd && "flex-row-reverse",
        )}
      >
        {label}
        <Arrow className={cn("size-3.5", !active && "invisible")} aria-hidden />
      </button>
    </TableHead>
  );
}
