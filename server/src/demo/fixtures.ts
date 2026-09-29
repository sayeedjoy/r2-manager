import { deflateSync } from "node:zlib";

/** One object in the demo bucket. Keys ending in "/" are empty folder placeholders. */
export interface DemoFile {
  key: string;
  contentType: string;
  body: Uint8Array;
  /** How long before server start the file was "last modified", so the date filter has something to show. */
  ageDays: number;
  customMetadata?: Record<string, string>;
}

const text = (s: string) => new TextEncoder().encode(s);

const README = `# Welcome to the R2 Manager demo

This is a **read-only** demo with sample files kept in memory. Nothing here is a real bucket.

Things to try:

- Open files to preview them: Markdown, PDF, CSV, JSON Lines, images and source code all have viewers.
- Switch between the table and grid views, sort, and filter by name or date.
- Look inside \`logs/\` to see pagination.
- Select a few files and download them one by one.

Uploads, edits, renames, moves, deletes and share links are turned off here. Buttons for them
are still shown so you can see what the app offers, but the server refuses the change.

To run your own copy, see the project README.
`;

const GETTING_STARTED = `# Getting started

R2 Manager is a self-hosted file manager for Cloudflare R2 buckets.

## Deploy

1. Create an R2 API token with access to the buckets you want to manage.
2. Provision Postgres.
3. Deploy the Docker image (Dokploy) or the Vercel project and set the environment variables.
4. Open the app and register the first admin account.

## Roles

| Role   | Can do                                              |
| ------ | --------------------------------------------------- |
| admin  | Everything, including users and settings            |
| editor | Upload, edit, move, delete and share in their grants |
| viewer | Browse, preview and download in their grants        |

> Tip: uploads go straight from the browser to R2 with presigned multipart URLs.
`;

const RELEASE_NOTES = `R2 Manager release notes
========================

0.3.0
  - Date range filter and pagination in the file browser
  - Grid view with image thumbnails

0.2.0
  - Password sign-in with optional TOTP two-factor authentication
  - Password reset over SMTP, configured from the admin panel

0.1.0
  - First release: browse, upload, preview, edit and share
`;

const REGIONS = ["North America", "Europe", "Asia Pacific", "Latin America"];
const PRODUCTS = ["Starter", "Team", "Business", "Enterprise"];

function salesCsv(): string {
  const rows = ["month,region,product,units,revenue_usd"];
  for (let m = 1; m <= 9; m++) {
    REGIONS.forEach((region, r) => {
      const product = PRODUCTS[(m + r) % PRODUCTS.length]!;
      const units = 40 + ((m * 37 + r * 91) % 160);
      const price = [19, 49, 129, 499][(m + r) % 4]!;
      rows.push(`2026-${String(m).padStart(2, "0")},${region},${product},${units},${units * price}`);
    });
  }
  return rows.join("\n") + "\n";
}

function eventsJsonl(): string {
  const kinds = ["object.upload", "object.download", "share.create", "object.rename", "folder.create"];
  const lines: string[] = [];
  for (let i = 0; i < 25; i++) {
    lines.push(
      JSON.stringify({
        id: i + 1,
        at: new Date(Date.UTC(2026, 8, 1 + (i % 28), 8 + (i % 10), (i * 7) % 60)).toISOString(),
        action: kinds[i % kinds.length],
        actor: ["ana@example.com", "li@example.com", "sam@example.com"][i % 3],
        bytes: (i * 7919) % 500_000,
      }),
    );
  }
  return lines.join("\n") + "\n";
}

const APP_CONFIG = {
  name: "r2-manager",
  uploads: { multipart: true, partSizeMiB: 10, maxConcurrentParts: 4 },
  previews: { maxSizeMiB: 25, kinds: ["image", "pdf", "markdown", "csv", "json", "jsonl", "text"] },
  shares: { defaultExpiryHours: 168, deliveryModes: ["stream", "redirect"] },
};

const SETTINGS_YAML = `# Example deployment settings
app:
  base_url: https://files.example.com
  auth_mode: password
storage:
  buckets:
    - media
    - backups
limits:
  max_upload_gib: 5
  max_preview_mib: 25
`;

const APP_TS = `import { Hono } from "hono";

const app = new Hono();

app.get("/healthz", (c) => c.text("ok"));

app.get("/api/v1/buckets", async (c) => {
  const buckets = ["media", "backups"];
  return c.json({ buckets });
});

export default app;
`;

const STYLES_CSS = `:root {
  --radius: 0.625rem;
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
}

.file-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(10rem, 1fr));
  gap: 1rem;
}
`;

const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="240" height="240">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f6821f"/>
      <stop offset="1" stop-color="#fbad41"/>
    </linearGradient>
  </defs>
  <rect width="120" height="120" rx="26" fill="url(#g)"/>
  <path d="M30 78c0-11 9-20 20-20 3-10 12-17 23-17 13 0 24 11 24 24v1c6 1 10 6 10 12H30z" fill="#fff" opacity=".95"/>
  <text x="60" y="104" font-family="system-ui, sans-serif" font-size="16" font-weight="700" fill="#fff" text-anchor="middle">R2</text>
</svg>
`;

function barChartSvg(): string {
  const values = [42, 58, 51, 73, 66, 88, 94, 81, 102];
  const bars = values
    .map((v, i) => `  <rect x="${30 + i * 40}" y="${220 - v * 1.8}" width="26" height="${v * 1.8}" rx="4" fill="#3b82f6"/>`)
    .join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 260" width="800" height="520">
  <rect width="400" height="260" fill="#f8fafc"/>
  <text x="20" y="28" font-family="system-ui, sans-serif" font-size="16" font-weight="600" fill="#0f172a">Monthly uploads, 2026</text>
  <line x1="20" y1="220" x2="390" y2="220" stroke="#cbd5e1"/>
${bars}
</svg>
`;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(text(type), 4);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** A small gradient PNG, generated so the demo has a raster image without shipping a binary asset. */
function gradientPng(width: number, height: number): Uint8Array {
  const raw = new Uint8Array(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    const row = y * (1 + width * 3);
    raw[row] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const i = row + 1 + x * 3;
      raw[i] = Math.round(30 + (225 * x) / width);
      raw[i + 1] = Math.round(80 + (120 * y) / height);
      raw[i + 2] = Math.round(220 - (160 * x) / width);
    }
  }
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header.set([8, 2, 0, 0, 0], 8); // 8-bit RGB
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", new Uint8Array()),
  ];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

/** A one-page PDF with correct xref offsets, built by hand so the PDF viewer has something to open. */
function samplePdf(): string {
  const lines = [
    "BT /F1 24 Tf 72 720 Td (R2 Manager demo) Tj ET",
    "BT /F1 12 Tf 72 690 Td (This PDF is generated in memory for the read-only demo.) Tj ET",
    "BT /F1 12 Tf 72 672 Td (Real deployments stream PDFs straight from your R2 bucket.) Tj ET",
  ].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${lines.length} >>\nstream\n${lines}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return pdf;
}

function logFiles(): DemoFile[] {
  const levels = ["INFO", "INFO", "INFO", "WARN", "INFO", "ERROR"];
  const messages = [
    "listed objects prefix=photos/ count=200",
    "multipart upload completed key=videos/launch.mp4 parts=12",
    "share link opened token=*** delivery=stream",
    "presigned part URL expired, client retried part=4",
    "folder copy batch finished items=250 cursor=next",
    "upstream timeout talking to storage, retrying",
  ];
  return Array.from({ length: 30 }, (_, i) => {
    const day = 30 - i;
    const date = `2026-09-${String(day).padStart(2, "0")}`;
    const body = Array.from({ length: 12 }, (_, j) => {
      const n = (i * 12 + j) % messages.length;
      return `${date}T${String(8 + j).padStart(2, "0")}:${String((i * 13 + j * 7) % 60).padStart(2, "0")}:00Z ${levels[n]} ${messages[n]}`;
    }).join("\n");
    return { key: `logs/app-${date}.log`, contentType: "text/plain; charset=utf-8", body: text(body + "\n"), ageDays: i };
  });
}

/** Builds the demo bucket's contents. Called once at startup; every configured bucket shares the same set. */
export function demoFiles(): DemoFile[] {
  return [
    { key: "README.md", contentType: "text/markdown; charset=utf-8", body: text(README), ageDays: 0 },
    { key: "documents/getting-started.md", contentType: "text/markdown; charset=utf-8", body: text(GETTING_STARTED), ageDays: 3 },
    { key: "documents/release-notes.txt", contentType: "text/plain; charset=utf-8", body: text(RELEASE_NOTES), ageDays: 12 },
    { key: "documents/overview.pdf", contentType: "application/pdf", body: text(samplePdf()), ageDays: 40 },
    { key: "data/sales-2026.csv", contentType: "text/csv; charset=utf-8", body: text(salesCsv()), ageDays: 5 },
    { key: "data/events.jsonl", contentType: "application/x-ndjson", body: text(eventsJsonl()), ageDays: 1 },
    {
      key: "data/app-config.json",
      contentType: "application/json",
      body: text(JSON.stringify(APP_CONFIG, null, 2) + "\n"),
      ageDays: 20,
      customMetadata: { owner: "platform-team", environment: "demo" },
    },
    { key: "images/logo.svg", contentType: "image/svg+xml", body: text(LOGO_SVG), ageDays: 90 },
    { key: "images/uploads-chart.svg", contentType: "image/svg+xml", body: text(barChartSvg()), ageDays: 8 },
    { key: "images/gradient.png", contentType: "image/png", body: gradientPng(320, 200), ageDays: 60, customMetadata: { generated: "true" } },
    { key: "code/app.ts", contentType: "text/plain; charset=utf-8", body: text(APP_TS), ageDays: 15 },
    { key: "code/styles.css", contentType: "text/css; charset=utf-8", body: text(STYLES_CSS), ageDays: 15 },
    { key: "code/settings.yaml", contentType: "text/plain; charset=utf-8", body: text(SETTINGS_YAML), ageDays: 25 },
    { key: "archive/", contentType: "application/x-directory", body: new Uint8Array(), ageDays: 120 },
    ...logFiles(),
  ];
}
