/** Builds a header value without allowing filenames to inject additional disposition parameters or headers. */
export function contentDisposition(
  filename: string,
  disposition: "attachment" | "inline" = "attachment",
): string {
  const boundedFilename = filename.slice(0, 255);
  const fallback =
    boundedFilename
      .replace(/[^\x20-\x7e]/g, "_")
      .replace(/["\\]/g, "_")
      .slice(0, 180) || "download";
  const encoded = encodeURIComponent(boundedFilename).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `${disposition}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

export function applyUntrustedContentHeaders(headers: Headers): void {
  headers.set(
    "content-security-policy",
    "sandbox; default-src 'none'; frame-ancestors 'none'",
  );
  headers.set("cross-origin-resource-policy", "same-origin");
  headers.set("x-content-type-options", "nosniff");
}
