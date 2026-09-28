import type { ObjectEntry } from "@r2-manager/shared";
import { baseName } from "@r2-manager/shared";

export type FileCategory = "folder" | "document" | "image" | "video" | "audio" | "archive" | "code" | "other";

const EXTENSION_CATEGORY: Record<string, FileCategory> = {};
function assign(category: FileCategory, extensions: string) {
  for (const ext of extensions.split(" ")) EXTENSION_CATEGORY[ext] = category;
}
assign("document", "pdf doc docx odt rtf txt md markdown pages xls xlsx ods csv numbers ppt pptx odp key epub log");
assign("image", "png jpg jpeg gif webp svg bmp ico avif heic heif tif tiff");
assign("video", "mp4 mov webm mkv avi m4v wmv mpg mpeg");
assign("audio", "mp3 wav flac ogg oga m4a aac opus");
assign("archive", "zip tar gz tgz 7z rar bz2 xz zst");
assign("code", "ts tsx js jsx mjs cjs css scss html htm sh py go rs sql json jsonl ndjson yml yaml xml toml ini env java kt c h cpp hpp cs rb php swift");

/** Lowercase extension without the dot, or "" for folders and extensionless names (".env" counts as a name). */
export function fileExtension(entry: ObjectEntry): string {
  if (entry.type === "folder") return "";
  const name = baseName(entry.key);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

/** Groups entries for the type filter and icons: by extension first, then by stored content type. */
export function fileCategory(entry: ObjectEntry): FileCategory {
  if (entry.type === "folder") return "folder";
  const byExtension = EXTENSION_CATEGORY[fileExtension(entry)];
  if (byExtension) return byExtension;
  const contentType = entry.contentType ?? "";
  if (contentType.startsWith("image/")) return "image";
  if (contentType.startsWith("video/")) return "video";
  if (contentType.startsWith("audio/")) return "audio";
  if (contentType.startsWith("text/")) return "document";
  return "other";
}

/** What the Type column shows and sorts by: "Folder", the extension ("PDF"), or "File" when there is none. */
export function typeLabel(entry: ObjectEntry): string {
  if (entry.type === "folder") return "Folder";
  return fileExtension(entry).toUpperCase() || "File";
}

export type TypeFilter = "all" | FileCategory;

export const TYPE_FILTERS: { value: TypeFilter; label: string }[] = [
  { value: "all", label: "All types" },
  { value: "folder", label: "Folders" },
  { value: "document", label: "Documents" },
  { value: "image", label: "Images" },
  { value: "video", label: "Video" },
  { value: "audio", label: "Audio" },
  { value: "archive", label: "Archives" },
  { value: "code", label: "Code" },
  { value: "other", label: "Other" },
];
