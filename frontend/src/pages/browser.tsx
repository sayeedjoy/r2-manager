import { useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { FolderPlus, FolderUp, LayoutGrid, List, Upload } from "lucide-react";
import type { ObjectEntry } from "@r2-manager/shared";
import { baseName, InvalidKeyError, isEditableKind, normalizeKey, previewKindFor } from "@r2-manager/shared";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { useListing } from "@/hooks/use-listing";
import { useUploadQueue } from "@/features/upload/upload-queue";
import { DropZone } from "@/features/upload/drop-zone";
import type { DroppedFile } from "@/features/upload/file-system-entries";
import { FileBreadcrumbs } from "@/features/files/breadcrumbs";
import { FileTable, type FileAction } from "@/features/files/file-table";
import { FileGrid } from "@/features/files/file-grid";
import { BulkActionsBar } from "@/features/files/bulk-actions-bar";
import { MoveCopyDialog } from "@/features/files/move-copy-dialog";
import { ShareDialog } from "@/features/shares/share-dialog";
import { PreviewSheet } from "@/features/preview/preview-sheet";
import { EditorDialog } from "@/features/editor/editor-dialog";

export function BrowserPage() {
  const { bucket = "", "*": splat = "" } = useParams();
  const prefix = splat ? `${splat}/` : "";
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { enqueue } = useUploadQueue();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading, error } = useListing(bucket, prefix);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [shareTarget, setShareTarget] = useState<ObjectEntry | null>(null);
  const [renameTarget, setRenameTarget] = useState<ObjectEntry | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [previewTarget, setPreviewTarget] = useState<ObjectEntry | null>(null);
  const [editTarget, setEditTarget] = useState<ObjectEntry | null>(null);
  const [view, setView] = useState<"list" | "grid">("list");
  const [filter, setFilter] = useState("");
  const [moveCopyMode, setMoveCopyMode] = useState<"move" | "copy" | null>(null);

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
      navigate(`/b/${bucket}/${entry.key.replace(/\/$/, "")}`);
    } else {
      setPreviewTarget(entry);
    }
  }

  /** XFER-01/02: uploads dropped/selected files, preserving folder structure when present; rejects unsafe paths. */
  function handleFiles(files: DroppedFile[]) {
    for (const { file, relativePath } of files) {
      let key: string;
      try {
        key = normalizeKey(`${prefix}${relativePath}`);
      } catch (err) {
        if (err instanceof InvalidKeyError) {
          alert(`Skipped "${relativePath}": ${err.message}`);
          continue;
        }
        throw err;
      }
      enqueue(file, bucket, key, refresh);
    }
  }

  async function handleCreateFolder() {
    if (!newFolderName.trim()) return;
    await api.createFolder(bucket, `${prefix}${newFolderName.trim()}`);
    setNewFolderOpen(false);
    setNewFolderName("");
    refresh();
  }

  async function handleDelete(entry: ObjectEntry) {
    if (!confirm(`Delete "${baseName(entry.key)}"? This cannot be undone.`)) return;
    await api.deleteObjects(bucket, [entry.key]);
    refresh();
  }

  async function handleRenameConfirm() {
    if (!renameTarget || !renameValue.trim()) return;
    await api.rename(bucket, renameTarget.key, renameValue.trim());
    setRenameTarget(null);
    refresh();
  }

  /** FILE-05/FILE-07: bulk delete, confirming exactly what will be affected; folders run as tree-op batches. */
  async function handleBulkDelete() {
    if (!confirm(`Delete ${selectedEntries.length} item(s)? This cannot be undone.`)) return;
    const files = selectedEntries.filter((e) => e.type === "file");
    const folders = selectedEntries.filter((e) => e.type === "folder");

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
    refresh();
  }

  /** XFER-06: bulk download as a zip, within the server's configured size limit. */
  async function handleBulkDownload() {
    const files = selectedEntries.filter((e) => e.type === "file");
    if (files.length === 0) {
      alert("Select at least one file to download (folders aren't included in bulk downloads).");
      return;
    }
    try {
      await api.downloadZip(bucket, files.map((e) => e.key));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Bulk download failed.");
    }
  }

  const actions: FileAction[] = [
    { label: "Preview", onSelect: (entry) => setPreviewTarget(entry), showFor: (e) => e.type === "file" },
    {
      label: "Download",
      onSelect: (entry) => window.open(api.contentUrl(bucket, entry.key), "_blank"),
      showFor: (e) => e.type === "file",
    },
    {
      label: "Edit",
      onSelect: (entry) => {
        if (isEditableKind(previewKindFor(entry.key))) setEditTarget(entry);
        else alert("This file type isn't supported by the text editor.");
      },
      showFor: (e) => e.type === "file",
    },
    {
      label: "Rename",
      onSelect: (entry) => {
        setRenameTarget(entry);
        setRenameValue(baseName(entry.key));
      },
    },
    { label: "Share", onSelect: (entry) => setShareTarget(entry), showFor: (e) => e.type === "file" },
    { label: "Delete", onSelect: handleDelete, destructive: true },
  ];

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <div className="flex items-center justify-between gap-2">
        <FileBreadcrumbs bucket={bucket} prefix={prefix} onNavigate={(p) => navigate(`/b/${bucket}/${p.replace(/\/$/, "")}`)} />
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setNewFolderOpen(true)}>
            <FolderPlus className="mr-1 size-4" /> New folder
          </Button>
          <Button variant="outline" size="sm" onClick={() => folderInputRef.current?.click()}>
            <FolderUp className="mr-1 size-4" /> Upload folder
          </Button>
          <Button size="sm" onClick={() => fileInputRef.current?.click()}>
            <Upload className="mr-1 size-4" /> Upload
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Input
          placeholder="Filter this folder..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="max-w-xs"
        />
        <div className="ml-auto flex gap-1">
          <Button variant={view === "list" ? "secondary" : "ghost"} size="icon" onClick={() => setView("list")} aria-label="List view">
            <List className="size-4" />
          </Button>
          <Button variant={view === "grid" ? "secondary" : "ghost"} size="icon" onClick={() => setView("grid")} aria-label="Grid view">
            <LayoutGrid className="size-4" />
          </Button>
        </div>
      </div>

      <BulkActionsBar
        count={selected.size}
        onDownloadZip={handleBulkDownload}
        onMove={() => setMoveCopyMode("move")}
        onCopy={() => setMoveCopyMode("copy")}
        onDelete={handleBulkDelete}
        onClear={() => setSelected(new Set())}
      />

      <DropZone
        onFiles={handleFiles}
        pickerRef={fileInputRef}
        folderPickerRef={folderInputRef}
        className="min-h-0 flex-1 rounded-md border"
      >
        {isLoading && <div className="p-8 text-center text-sm text-muted-foreground">Loading...</div>}
        {error && <div className="p-8 text-center text-sm text-destructive">Failed to load this folder.</div>}
        {data && view === "list" && (
          <FileTable entries={filteredEntries} selected={selected} onToggleSelect={toggleSelect} onOpen={handleOpen} actions={actions} />
        )}
        {data && view === "grid" && (
          <FileGrid entries={filteredEntries} selected={selected} onToggleSelect={toggleSelect} onOpen={handleOpen} />
        )}
      </DropZone>

      <Dialog open={newFolderOpen} onOpenChange={setNewFolderOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New folder</DialogTitle>
            <DialogDescription>Create an empty folder in the current location.</DialogDescription>
          </DialogHeader>
          <Input value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} placeholder="Folder name" autoFocus />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewFolderOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateFolder}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!renameTarget} onOpenChange={(open) => !open && setRenameTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename</DialogTitle>
          </DialogHeader>
          <Input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} autoFocus />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameTarget(null)}>
              Cancel
            </Button>
            <Button onClick={handleRenameConfirm}>Rename</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {shareTarget && (
        <ShareDialog bucket={bucket} entry={shareTarget} onClose={() => setShareTarget(null)} />
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
