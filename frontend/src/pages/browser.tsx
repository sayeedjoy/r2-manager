import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  Download,
  Eye,
  File as FileIcon,
  FolderOpen,
  FolderPlus,
  FolderUp,
  LayoutGrid,
  Link2,
  List,
  Pencil,
  Search,
  SearchX,
  Tags,
  TextCursorInput,
  Trash2,
  TriangleAlert,
  Upload,
  X,
} from "lucide-react";
import type { ObjectEntry } from "@r2-manager/shared";
import { baseName, InvalidKeyError, isEditableKind, normalizeKey, previewKindFor } from "@r2-manager/shared";
import { Button } from "@/components/ui/button";
import { ButtonGroup, ButtonGroupSeparator } from "@/components/ui/button-group";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Kbd } from "@/components/ui/kbd";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { toast } from "@/components/ui/toast";
import { PageHeader } from "@/components/layout/page-header";
import { bucketPath } from "@/components/layout/nav";
import { useConfirm } from "@/components/confirm-dialog";
import { api } from "@/lib/api";
import { formatBytes, pluralize } from "@/lib/format";
import { notifyError, notifyInfo } from "@/lib/notify";
import { useListing } from "@/hooks/use-listing";
import { useUploadQueue } from "@/features/upload/upload-queue";
import { DropZone } from "@/features/upload/drop-zone";
import type { DroppedFile } from "@/features/upload/file-system-entries";
import { FileTable, type FileAction } from "@/features/files/file-table";
import { FileGrid } from "@/features/files/file-grid";
import { BulkActionsBar } from "@/features/files/bulk-actions-bar";
import { MoveCopyDialog } from "@/features/files/move-copy-dialog";
import { ShareDialog } from "@/features/shares/share-dialog";
import { PreviewSheet } from "@/features/preview/preview-sheet";
import { EditorDialog } from "@/features/editor/editor-dialog";
import { MetadataDialog } from "@/features/metadata/metadata-dialog";

type ViewMode = "list" | "grid";
const VIEW_STORAGE_KEY = "r2-manager:browser-view";

/** The list/grid choice is a per-browser convenience, so storage failing (private mode, blocked site data) just means the default. */
function readViewPreference(): ViewMode {
  try {
    return localStorage.getItem(VIEW_STORAGE_KEY) === "grid" ? "grid" : "list";
  } catch {
    return "list";
  }
}

function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || !!target.closest("input, textarea, select"));
}

export function BrowserPage() {
  const { bucket = "", "*": splat = "" } = useParams();
  const prefix = splat ? `${splat}/` : "";
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { enqueue } = useUploadQueue();
  const confirm = useConfirm();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const filterInputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading, error, refetch } = useListing(bucket, prefix);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [shareTarget, setShareTarget] = useState<ObjectEntry | null>(null);
  const [renameTarget, setRenameTarget] = useState<ObjectEntry | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [previewTarget, setPreviewTarget] = useState<ObjectEntry | null>(null);
  const [editTarget, setEditTarget] = useState<ObjectEntry | null>(null);
  const [metadataTarget, setMetadataTarget] = useState<ObjectEntry | null>(null);
  const [view, setView] = useState<ViewMode>(readViewPreference);
  const [filter, setFilter] = useState("");
  const [moveCopyMode, setMoveCopyMode] = useState<"move" | "copy" | null>(null);
  const [dialogBusy, setDialogBusy] = useState(false);

  // Selection and filter belong to one folder. Reset them during render when the folder changes, so the bulk bar
  // never offers to act on rows from the folder the user just left.
  const location = `${bucket}/${prefix}`;
  const [scope, setScope] = useState(location);
  if (scope !== location) {
    setScope(location);
    setSelected(new Set());
    setFilter("");
  }

  // "/" jumps to the filter, as in most file and code browsers.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey || isEditableTarget(event.target)) return;
      event.preventDefault();
      filterInputRef.current?.focus();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function changeView(next: ViewMode) {
    setView(next);
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, next);
    } catch {
      // Not persisting the preference is fine.
    }
  }

  function refresh() {
    qc.invalidateQueries({ queryKey: ["listing", bucket, prefix] });
    setSelected(new Set());
  }

  const filteredEntries = useMemo(() => {
    if (!data) return [];
    if (!filter.trim()) return data.entries;
    // FILE-02: name filtering within the current (already loaded) location.
    const needle = filter.trim().toLowerCase();
    return data.entries.filter((e) => baseName(e.key).toLowerCase().includes(needle));
  }, [data, filter]);

  const selectedEntries = useMemo(
    () => filteredEntries.filter((e) => selected.has(e.key)),
    [filteredEntries, selected],
  );

  const summary = useMemo(() => {
    if (!data) return null;
    const files = data.entries.filter((e) => e.type === "file");
    const parts = [pluralize(data.entries.length - files.length, "folder"), pluralize(files.length, "file")];
    if (files.length > 0) parts.push(formatBytes(files.reduce((total, e) => total + (e.size ?? 0), 0)));
    if (data.truncated) parts.push("more not shown");
    return parts.join(" · ");
  }, [data]);

  function setAllSelected(checked: boolean) {
    setSelected(checked ? new Set(filteredEntries.map((e) => e.key)) : new Set());
  }

  function toggleSelect(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function handleOpen(entry: ObjectEntry) {
    if (entry.type === "folder") {
      navigate(bucketPath(bucket, entry.key));
    } else {
      setPreviewTarget(entry);
    }
  }

  /** XFER-01/02: uploads dropped/selected files, preserving folder structure when present; rejects unsafe paths. */
  function handleFiles(files: DroppedFile[]) {
    const skipped: string[] = [];
    for (const { file, relativePath } of files) {
      let key: string;
      try {
        key = normalizeKey(`${prefix}${relativePath}`);
      } catch (err) {
        if (err instanceof InvalidKeyError) {
          skipped.push(`"${relativePath}": ${err.message}`);
          continue;
        }
        throw err;
      }
      enqueue(file, bucket, key, refresh);
    }
    if (skipped.length > 0) {
      toast.add({
        type: "warning",
        title: `Skipped ${skipped.length} ${skipped.length === 1 ? "item" : "items"} with unsafe names`,
        description: skipped.slice(0, 3).join("; ") + (skipped.length > 3 ? "; …" : ""),
      });
    }
  }

  async function handleCreateFolder(event: FormEvent) {
    event.preventDefault();
    if (!newFolderName.trim()) return;
    setDialogBusy(true);
    try {
      await api.createFolder(bucket, `${prefix}${newFolderName.trim()}`);
    } catch (err) {
      notifyError("Couldn't create the folder", err);
      return;
    } finally {
      setDialogBusy(false);
    }
    setNewFolderOpen(false);
    setNewFolderName("");
    refresh();
  }

  async function handleRenameConfirm(event: FormEvent) {
    event.preventDefault();
    if (!renameTarget || !renameValue.trim()) return;
    setDialogBusy(true);
    try {
      await api.rename(bucket, renameTarget.key, renameValue.trim());
    } catch (err) {
      notifyError("Couldn't rename", err);
      return;
    } finally {
      setDialogBusy(false);
    }
    setRenameTarget(null);
    refresh();
  }

  /**
   * FILE-05/FILE-07: deletes files and folders after confirming exactly what will be affected. Folders run as
   * cursor-batched tree ops, because deleting a folder's own key only removes its placeholder, not its contents.
   */
  async function deleteEntries(entries: ObjectEntry[]) {
    const ok = await confirm({
      title: entries.length === 1 ? `Delete "${baseName(entries[0].key)}"?` : `Delete ${entries.length} items?`,
      description: entries.some((e) => e.type === "folder")
        ? "Folders are deleted with everything inside them. This can't be undone."
        : "This can't be undone.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    const files = entries.filter((e) => e.type === "file");
    const folders = entries.filter((e) => e.type === "folder");

    try {
      if (files.length > 0) await api.deleteObjects(bucket, files.map((e) => e.key));
      for (const folder of folders) {
        let cursor: string | undefined;
        for (;;) {
          const result = await api.treeOp({ op: "delete", sourceBucket: bucket, sourcePrefix: folder.key, cursor });
          if (result.done) break;
          cursor = result.cursor ?? undefined;
        }
        await api.deleteObjects(bucket, [folder.key]); // remove the now-empty folder placeholder itself
      }
    } catch (err) {
      // NFR-09: folder deletes aren't atomic, so some items may already be gone. The refresh below shows what's left.
      notifyError("Delete stopped partway", err);
    }
    refresh();
  }

  /** XFER-06: bulk download as a zip, within the server's configured size limit. */
  async function handleBulkDownload() {
    const files = selectedEntries.filter((e) => e.type === "file");
    if (files.length === 0) {
      notifyInfo("Select at least one file to download", "Folders aren't included in bulk downloads.");
      return;
    }
    try {
      await api.downloadZip(bucket, files.map((e) => e.key));
    } catch (err) {
      notifyError("Bulk download failed", err);
    }
  }

  const actions: FileAction[] = [
    { label: "Preview", icon: Eye, onSelect: (entry) => setPreviewTarget(entry), showFor: (e) => e.type === "file" },
    {
      label: "Download",
      icon: Download,
      onSelect: (entry) => window.open(api.contentUrl(bucket, entry.key), "_blank"),
      showFor: (e) => e.type === "file",
    },
    {
      label: "Edit",
      icon: Pencil,
      onSelect: (entry) => {
        if (isEditableKind(previewKindFor(entry.key))) setEditTarget(entry);
        else notifyInfo("This file type can't be opened in the text editor");
      },
      showFor: (e) => e.type === "file",
    },
    {
      label: "Rename",
      icon: TextCursorInput,
      onSelect: (entry) => {
        setRenameTarget(entry);
        setRenameValue(baseName(entry.key));
      },
    },
    { label: "Share", icon: Link2, onSelect: (entry) => setShareTarget(entry), showFor: (e) => e.type === "file" },
    { label: "Metadata", icon: Tags, onSelect: (entry) => setMetadataTarget(entry), showFor: (e) => e.type === "file" },
    { label: "Delete", icon: Trash2, onSelect: (entry) => deleteEntries([entry]), destructive: true },
  ];

  const folderName = splat ? splat.split("/").pop()! : bucket;

  let listing;
  if (isLoading) {
    listing = <ListingSkeleton />;
  } else if (error) {
    listing = (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <TriangleAlert />
          </EmptyMedia>
          <EmptyTitle>Couldn't load this folder</EmptyTitle>
          <EmptyDescription>{error.message}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button variant="outline" onClick={() => refetch()}>
            Try again
          </Button>
        </EmptyContent>
      </Empty>
    );
  } else if (data && data.entries.length === 0) {
    listing = (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FolderOpen />
          </EmptyMedia>
          <EmptyTitle>This folder is empty</EmptyTitle>
          <EmptyDescription>Drag files or folders here, or upload them from your computer.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button onClick={() => fileInputRef.current?.click()}>
            <Upload data-icon="inline-start" />
            Upload files
          </Button>
        </EmptyContent>
      </Empty>
    );
  } else if (filteredEntries.length === 0) {
    listing = (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <SearchX />
          </EmptyMedia>
          <EmptyTitle>Nothing matches “{filter.trim()}”</EmptyTitle>
          <EmptyDescription>The filter only searches names in this folder.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button variant="outline" onClick={() => setFilter("")}>
            Clear filter
          </Button>
        </EmptyContent>
      </Empty>
    );
  } else if (view === "list") {
    listing = (
      <FileTable
        entries={filteredEntries}
        selected={selected}
        onToggleSelect={toggleSelect}
        onSelectAll={setAllSelected}
        onOpen={handleOpen}
        actions={actions}
      />
    );
  } else {
    listing = <FileGrid bucket={bucket} entries={filteredEntries} selected={selected} onToggleSelect={toggleSelect} onOpen={handleOpen} />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 md:p-6">
      <PageHeader
        title={folderName}
        description={summary ?? "Loading…"}
        actions={
          <>
            <Button variant="outline" onClick={() => setNewFolderOpen(true)}>
              <FolderPlus data-icon="inline-start" />
              New folder
            </Button>
            <ButtonGroup>
              <Button onClick={() => fileInputRef.current?.click()}>
                <Upload data-icon="inline-start" />
                Upload
              </Button>
              <ButtonGroupSeparator />
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button size="icon" aria-label="More upload options" />}>
                  <ChevronDown />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuGroup>
                    <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
                      <FileIcon />
                      Upload files
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => folderInputRef.current?.click()}>
                      <FolderUp />
                      Upload folder
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </ButtonGroup>
          </>
        }
      />

      <div className="flex items-center gap-2">
        <InputGroup className="max-w-xs">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            ref={filterInputRef}
            placeholder="Filter this folder"
            aria-label="Filter this folder by name"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setFilter("")}
          />
          <InputGroupAddon align="inline-end">
            {filter ? (
              <InputGroupButton size="icon-xs" aria-label="Clear filter" onClick={() => setFilter("")}>
                <X />
              </InputGroupButton>
            ) : (
              <Kbd className="hidden sm:inline-flex">/</Kbd>
            )}
          </InputGroupAddon>
        </InputGroup>
        <ToggleGroup
          variant="outline"
          spacing={0}
          className="ml-auto"
          aria-label="Layout"
          value={[view]}
          onValueChange={(value) => value[0] && changeView(value[0] as ViewMode)}
        >
          <ToggleGroupItem value="list" aria-label="List view">
            <List />
          </ToggleGroupItem>
          <ToggleGroupItem value="grid" aria-label="Grid view">
            <LayoutGrid />
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col">
        <DropZone
          onFiles={handleFiles}
          pickerRef={fileInputRef}
          folderPickerRef={folderInputRef}
          className="flex min-h-0 flex-1 flex-col overflow-auto rounded-xl bg-card ring-1 ring-foreground/10"
        >
          {listing}
        </DropZone>
        <BulkActionsBar
          count={selectedEntries.length}
          onDownloadZip={handleBulkDownload}
          onMove={() => setMoveCopyMode("move")}
          onCopy={() => setMoveCopyMode("copy")}
          onDelete={() => deleteEntries(selectedEntries)}
          onClear={() => setSelected(new Set())}
        />
      </div>

      <Dialog
        open={newFolderOpen}
        onOpenChange={(open) => {
          setNewFolderOpen(open);
          if (!open) setNewFolderName("");
        }}
      >
        <DialogContent>
          <form onSubmit={handleCreateFolder} className="contents">
            <DialogHeader>
              <DialogTitle>New folder</DialogTitle>
              <DialogDescription>Creates an empty folder in {folderName}.</DialogDescription>
            </DialogHeader>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="new-folder-name">Name</FieldLabel>
                <Input
                  id="new-folder-name"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  autoComplete="off"
                  autoFocus
                />
              </Field>
            </FieldGroup>
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
              <Button type="submit" disabled={dialogBusy || !newFolderName.trim()}>
                Create folder
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!renameTarget} onOpenChange={(open) => !open && setRenameTarget(null)}>
        <DialogContent>
          <form onSubmit={handleRenameConfirm} className="contents">
            <DialogHeader>
              <DialogTitle>Rename</DialogTitle>
              <DialogDescription className="line-clamp-2 wrap-anywhere" title={renameTarget ? baseName(renameTarget.key) : undefined}>
                {renameTarget && baseName(renameTarget.key)}
              </DialogDescription>
            </DialogHeader>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="rename-value">New name</FieldLabel>
                <Input
                  id="rename-value"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  autoComplete="off"
                  autoFocus
                  // Select the name without its extension, which is almost always the part being changed.
                  onFocus={(e) => {
                    const dot = e.currentTarget.value.lastIndexOf(".");
                    const end = renameTarget?.type === "file" && dot > 0 ? dot : e.currentTarget.value.length;
                    e.currentTarget.setSelectionRange(0, end);
                  }}
                />
              </Field>
            </FieldGroup>
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
              <Button type="submit" disabled={dialogBusy || !renameValue.trim()}>
                Rename
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {shareTarget && (
        <ShareDialog bucket={bucket} entry={shareTarget} onClose={() => setShareTarget(null)} />
      )}

      {metadataTarget && (
        <MetadataDialog
          bucket={bucket}
          entry={metadataTarget}
          onClose={() => setMetadataTarget(null)}
          onSaved={() => {
            setMetadataTarget(null);
            refresh();
          }}
        />
      )}

      {moveCopyMode && (
        <MoveCopyDialog
          mode={moveCopyMode}
          sourceBucket={bucket}
          entries={selectedEntries}
          onClose={() => setMoveCopyMode(null)}
          onDone={() => {
            setMoveCopyMode(null);
            refresh();
          }}
        />
      )}

      {previewTarget && (
        <PreviewSheet
          bucket={bucket}
          entry={previewTarget}
          onClose={() => setPreviewTarget(null)}
          onEdit={() => {
            setEditTarget(previewTarget);
            setPreviewTarget(null);
          }}
        />
      )}

      {editTarget && (
        <EditorDialog
          bucket={bucket}
          entry={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => {
            setEditTarget(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function ListingSkeleton() {
  return (
    <div className="flex flex-col gap-1 p-3" aria-busy="true" aria-label="Loading folder">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="flex h-10 items-center gap-3 px-2">
          <Skeleton className="size-4" />
          <Skeleton className="size-4" />
          <Skeleton className="h-4 max-w-64 flex-1" />
          <Skeleton className="ml-auto h-4 w-16" />
          <Skeleton className="h-4 w-28" />
        </div>
      ))}
    </div>
  );
}
