import { ArrowDown, ArrowUp, ChevronsUpDown, EllipsisVertical, type LucideIcon } from "lucide-react";
import type { ObjectEntry } from "@r2-manager/shared";
import { baseName } from "@r2-manager/shared";
import { Badge } from "@/components/ui/badge";
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
import { typeLabel } from "./file-kind";
import type { Density, DisplayProperty, SortColumn, SortState } from "./view-options";

export interface FileAction {
  label: string;
  icon?: LucideIcon;
  onSelect: (entry: ObjectEntry) => void;
  destructive?: boolean;
  /** Restricts the action to matching entries (e.g. files only). Shown for everything when omitted. */
  showFor?: (entry: ObjectEntry) => boolean;
}

interface FileTableProps {
  /** Already sorted by the page (view-options.ts sortEntries), so the table, grid and folder cards agree. */
  entries: ObjectEntry[];
  selected: Set<string>;
  onToggleSelect: (key: string) => void;
  onSelectAll: (checked: boolean) => void;
  onOpen: (entry: ObjectEntry) => void;
  actions: FileAction[];
  sort: SortState;
  onSort: (column: SortColumn) => void;
  properties: Record<DisplayProperty, boolean>;
  density: Density;
}

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
export function FileTable({
  entries,
  selected,
  onToggleSelect,
  onSelectAll,
  onOpen,
  actions,
  sort,
  onSort,
  properties,
  density,
}: FileTableProps) {
  const selectedCount = entries.filter((e) => selected.has(e.key)).length;
  const allSelected = selectedCount === entries.length;
  const sortProps = { sort, onSort };

  return (
    // The Table's own wrapper scrolls horizontally, which would trap the sticky header. Let the listing scroll instead.
    <div
      className={cn(
        "[&>[data-slot=table-container]]:overflow-visible",
        density === "comfortable" && "[&_tbody_td]:py-3.5",
      )}
    >
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
            {properties.type && <SortableHead label="Type" column="type" className="hidden w-28 sm:table-cell" {...sortProps} />}
            {properties.size && <SortableHead label="Size" column="size" className="w-28" {...sortProps} />}
            {properties.modified && (
              <SortableHead label="Modified" column="modified" className="hidden w-36 md:table-cell" {...sortProps} />
            )}
            <TableHead className="w-12 pr-3">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map((entry) => {
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
                      <span className="truncate font-medium">{name}</span>
                    </button>
                  </TableCell>
                  {properties.type && (
                    <TableCell className="hidden sm:table-cell">
                      <Badge variant="outline" className="rounded-sm px-1.5 text-[0.6875rem] text-muted-foreground">
                        {typeLabel(entry)}
                      </Badge>
                    </TableCell>
                  )}
                  {properties.size && (
                    <TableCell className="text-muted-foreground tabular-nums">
                      {entry.type === "file" ? formatBytes(entry.size) : "—"}
                    </TableCell>
                  )}
                  {properties.modified && (
                    <TableCell className="hidden text-muted-foreground md:table-cell">
                      {entry.lastModified ? <RelativeTime value={entry.lastModified} /> : "—"}
                    </TableCell>
                  )}
                  <TableCell className="pr-3 text-right" onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${name}`} />}>
                        <EllipsisVertical />
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
  column: SortColumn;
  sort: SortState;
  onSort: (column: SortColumn) => void;
  className?: string;
}

/** Inactive columns show a faint up-down glyph so every header reads as sortable, not just the active one. */
function SortableHead({ label, column, sort, onSort, className }: SortableHeadProps) {
  const active = column === sort.column;
  const Icon = !active ? ChevronsUpDown : sort.dir === 1 ? ArrowUp : ArrowDown;

  return (
    <TableHead className={className} aria-sort={active ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        onClick={() => onSort(column)}
        className={cn(
          "group/sort inline-flex items-center gap-1 rounded-sm font-normal text-muted-foreground transition-colors duration-150 outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
          active && "text-foreground",
        )}
      >
        {label}
        <Icon className={cn("size-3.5 transition-opacity duration-150", !active && "opacity-50 group-hover/sort:opacity-100")} aria-hidden />
      </button>
    </TableHead>
  );
}
