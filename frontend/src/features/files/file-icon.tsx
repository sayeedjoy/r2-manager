import { createElement } from "react";
import {
  File,
  FileArchive,
  FileBraces,
  FileCode,
  FileHeadphone,
  FileImage,
  FilePlay,
  FileSpreadsheet,
  FileText,
  FileType,
  Folder,
  type LucideIcon,
} from "lucide-react";
import type { ObjectEntry } from "@r2-manager/shared";
import { fileCategory, fileExtension } from "./file-kind";

const SPREADSHEET_EXTENSIONS = new Set(["csv", "xls", "xlsx", "ods", "numbers"]);
const JSON_EXTENSIONS = new Set(["json", "jsonl", "ndjson"]);

/** One outline icon per kind of file, so a listing can be scanned by shape as well as name. */
export function FileKindIcon({ entry, className }: { entry: ObjectEntry; className?: string }) {
  return createElement(fileIconFor(entry), { className, "aria-hidden": true });
}

function fileIconFor(entry: ObjectEntry): LucideIcon {
  const ext = fileExtension(entry);
  if (JSON_EXTENSIONS.has(ext)) return FileBraces;
  if (SPREADSHEET_EXTENSIONS.has(ext)) return FileSpreadsheet;
  if (ext === "md" || ext === "markdown") return FileType;

  switch (fileCategory(entry)) {
    case "folder":
      return Folder;
    case "image":
      return FileImage;
    case "video":
      return FilePlay;
    case "audio":
      return FileHeadphone;
    case "archive":
      return FileArchive;
    case "code":
      return FileCode;
    case "document":
      return FileText;
    default:
      return File;
  }
}
