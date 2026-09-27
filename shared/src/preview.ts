import { baseName } from "./keys";

export type PreviewKind = "image" | "pdf" | "markdown" | "csv" | "json" | "jsonl" | "text" | "unsupported";

const EXT_KIND: Record<string, PreviewKind> = {
  png: "image",
  jpg: "image",
  jpeg: "image",
  gif: "image",
  webp: "image",
  svg: "image",
  bmp: "image",
  ico: "image",
  pdf: "pdf",
  md: "markdown",
  markdown: "markdown",
  csv: "csv",
  json: "json",
  jsonl: "jsonl",
  ndjson: "jsonl",
  txt: "text",
  log: "text",
  yml: "text",
  yaml: "text",
  xml: "text",
  ts: "text",
  tsx: "text",
  js: "text",
  jsx: "text",
  css: "text",
  html: "text",
  sh: "text",
  env: "text",
  toml: "text",
  ini: "text",
};

/** PREV-01/02: decides which viewer to use, from extension first and content-type as a fallback. */
export function previewKindFor(key: string, contentType?: string): PreviewKind {
  const name = baseName(key);
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
  if (ext in EXT_KIND) return EXT_KIND[ext]!;

  if (contentType) {
    if (contentType.startsWith("image/")) return "image";
    if (contentType === "application/pdf") return "pdf";
    if (contentType === "application/json") return "json";
    if (contentType === "text/csv") return "csv";
    if (contentType === "text/markdown") return "markdown";
    if (contentType.startsWith("text/")) return "text";
  }
  return "unsupported";
}

/** EDIT-01: which preview kinds the in-browser text editor supports. */
export function isEditableKind(kind: PreviewKind): boolean {
  return kind === "text" || kind === "markdown" || kind === "csv" || kind === "json" || kind === "jsonl";
}
