import { createElement } from "react";
import {
  File,
  FileArchive,
  FileBraces,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileType,
  Folder,
  type LucideIcon,
} from "lucide-react";
import type { ObjectEntry } from "@r2-manager/shared";
import { baseName, previewKindFor } from "@r2-manager/shared";

const CODE_EXTENSIONS = new Set(["ts", "tsx", "js", "jsx", "mjs", "cjs", "css", "html", "sh", "py", "go", "rs", "sql"]);
const ARCHIVE_EXTENSIONS = new Set(["zip", "tar", "gz", "tgz", "7z", "rar", "bz2", "xz"]);

/** One outline icon per kind of file, so a listing can be scanned by shape as well as name. */
export function FileKindIcon({ entry, className }: { entry: ObjectEntry; className?: string }) {
  return createElement(fileIconFor(entry), { className, "aria-hidden": true });
}

function fileIconFor(entry: ObjectEntry): LucideIcon {
  if (entry.type === "folder") return Folder;
  const name = baseName(entry.key);
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1).toLowerCase() : "";
  if (ARCHIVE_EXTENSIONS.has(ext)) return FileArchive;
  if (CODE_EXTENSIONS.has(ext)) return FileCode;

  switch (previewKindFor(entry.key)) {
    case "image":
      return FileImage;
    case "pdf":
    case "text":
      return FileText;
    case "markdown":
      return FileType;
    case "csv":
      return FileSpreadsheet;
    case "json":
    case "jsonl":
      return FileBraces;
    default:
      return File;
  }
}
