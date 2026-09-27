import { useState, type ReactNode, type RefObject } from "react";
import { UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils";
import { filesFromDataTransfer, filesFromFileList, type DroppedFile } from "./file-system-entries";

interface DropZoneProps {
  onFiles: (files: DroppedFile[]) => void;
  children: ReactNode;
  className?: string;
  /** Exposed so a "Select files" button elsewhere can trigger the picker (NFR-05 non-drag-and-drop alternative). */
  pickerRef?: RefObject<HTMLInputElement | null>;
  /** Exposed so a "Select folder" button can trigger the folder picker (XFER-02 fallback on browsers without folder drag-and-drop). */
  folderPickerRef?: RefObject<HTMLInputElement | null>;
}

/**
 * XFER-01/02/NFR-05: drag-and-drop for both files and folders (preserving
 * the dropped hierarchy), with conventional file/folder picker fallbacks for
 * browsers or input methods that don't support drag-and-drop.
 */
export function DropZone({ onFiles, children, className, pickerRef, folderPickerRef }: DropZoneProps) {
  const [isOver, setIsOver] = useState(false);

  return (
    <div
      className={cn("relative", className)}
      onDragOver={(e) => {
        e.preventDefault();
        setIsOver(true);
      }}
      // dragleave also fires when the pointer crosses into a child element, which would make the overlay flicker.
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setIsOver(false);
      }}
      onDrop={async (e) => {
        e.preventDefault();
        setIsOver(false);
        const files = await filesFromDataTransfer(e.dataTransfer);
        if (files.length > 0) onFiles(files);
      }}
    >
      {children}
      <input
        ref={pickerRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []).map((file) => ({ file, relativePath: file.name }));
          if (files.length > 0) onFiles(files);
          e.target.value = "";
        }}
      />
      <input
        ref={folderPickerRef}
        type="file"
        // @ts-expect-error non-standard attributes, not in React's HTML input typings
        webkitdirectory=""
        directory=""
        multiple
        className="hidden"
        onChange={(e) => {
          const fileList = e.target.files;
          const files = fileList ? filesFromFileList(fileList) : [];
          if (files.length > 0) onFiles(files);
          e.target.value = "";
        }}
      />
      {isOver && (
        <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 rounded-[inherit] border-2 border-dashed border-primary bg-background/80 text-sm font-medium backdrop-blur-sm">
          <UploadCloud className="size-6 text-muted-foreground" />
          Drop files or folders to upload
        </div>
      )}
    </div>
  );
}
