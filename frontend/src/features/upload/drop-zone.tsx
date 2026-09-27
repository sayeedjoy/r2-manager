import { useState, type ReactNode, type RefObject } from "react";
import { cn } from "@/lib/utils";

interface DropZoneProps {
  onFiles: (files: File[]) => void;
  children: ReactNode;
  className?: string;
  /** Exposed so a "Select files" button elsewhere can trigger the picker (NFR-05 non-drag-and-drop alternative). */
  pickerRef?: RefObject<HTMLInputElement | null>;
}

/** XFER-01/NFR-05: drag-and-drop with a conventional file-picker fallback for unsupported browsers/touch. */
export function DropZone({ onFiles, children, className, pickerRef }: DropZoneProps) {
  const [isOver, setIsOver] = useState(false);

  return (
    <div
      className={cn("relative", className)}
      onDragOver={(e) => {
        e.preventDefault();
        setIsOver(true);
      }}
      onDragLeave={() => setIsOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsOver(false);
        const files = Array.from(e.dataTransfer.files);
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
          const files = Array.from(e.target.files ?? []);
          if (files.length > 0) onFiles(files);
          e.target.value = "";
        }}
      />
      {isOver && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-md border-2 border-dashed border-primary bg-primary/5 text-sm font-medium text-primary">
          Drop files to upload
        </div>
      )}
    </div>
  );
}
