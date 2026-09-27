import { useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { FolderPlus, Upload } from "lucide-react";
import type { ObjectEntry } from "@r2-manager/shared";
import { baseName, isEditableKind, previewKindFor } from "@r2-manager/shared";
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
import { FileBreadcrumbs } from "@/features/files/breadcrumbs";
import { FileTable, type FileAction } from "@/features/files/file-table";
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

  const { data, isLoading, error } = useListing(bucket, prefix);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [shareTarget, setShareTarget] = useState<ObjectEntry | null>(null);
  const [renameTarget, setRenameTarget] = useState<ObjectEntry | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [previewTarget, setPreviewTarget] = useState<ObjectEntry | null>(null);
  const [editTarget, setEditTarget] = useState<ObjectEntry | null>(null);

  function refresh() {
    qc.invalidateQueries({ queryKey: ["listing", bucket, prefix] });
  }

  function handleOpen(entry: ObjectEntry) {
    if (entry.type === "folder") {
      navigate(`/b/${bucket}/${entry.key.replace(/\/$/, "")}`);
    } else {
      setPreviewTarget(entry);
    }
  }

  function handleFiles(files: File[]) {
    for (const file of files) {
      enqueue(file, bucket, `${prefix}${file.name}`, refresh);
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
          <Button size="sm" onClick={() => fileInputRef.current?.click()}>
            <Upload className="mr-1 size-4" /> Upload
          </Button>
        </div>
      </div>

      <DropZone onFiles={handleFiles} pickerRef={fileInputRef} className="min-h-0 flex-1 rounded-md border">
        {isLoading && <div className="p-8 text-center text-sm text-muted-foreground">Loading...</div>}
        {error && <div className="p-8 text-center text-sm text-destructive">Failed to load this folder.</div>}
        {data && (
          <FileTable entries={data.entries} selected={selected} onToggleSelect={(key) => {
            setSelected((prev) => {
              const next = new Set(prev);
              if (next.has(key)) next.delete(key);
              else next.add(key);
              return next;
            });
          }} onOpen={handleOpen} actions={actions} />
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
