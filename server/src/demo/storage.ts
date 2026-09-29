import { createHash } from "node:crypto";
import { AppError } from "@r2-manager/shared";
import {
  RangeNotSatisfiableError,
  type GetOptions,
  type GetResult,
  type ListResult,
  type ObjectHead,
  type Storage,
} from "../storage/storage";
import { demoFiles, type DemoFile } from "./fixtures";

export const DEMO_READ_ONLY_MESSAGE =
  "This is a read-only demo, so uploads, edits, moves, deletes and share links are turned off";

interface StoredObject extends ObjectHead {
  body: Uint8Array;
}

function readOnly(): never {
  throw new AppError("UNAUTHORIZED", DEMO_READ_ONLY_MESSAGE);
}

function toStored(file: DemoFile, now: number): StoredObject {
  return {
    key: file.key,
    size: file.body.byteLength,
    etag: createHash("md5").update(file.body).digest("hex"),
    lastModified: new Date(now - file.ageDays * 86_400_000),
    contentType: file.contentType,
    customMetadata: file.customMetadata ?? {},
    body: file.body,
  };
}

function streamOf(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

/**
 * DEMO_MODE storage: the sample files from fixtures.ts, held in memory and served for every configured bucket.
 * Reads behave like R2's S3 API (delimiter listing, ranges); every write throws, so the demo stays read-only
 * even if a request gets past the demo middleware.
 */
export class DemoStorage implements Storage {
  private readonly objects: StoredObject[];

  constructor(files: DemoFile[] = demoFiles(), now = Date.now()) {
    this.objects = files.map((f) => toStored(f, now)).sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  }

  private find(key: string): StoredObject | undefined {
    return this.objects.find((o) => o.key === key);
  }

  async list(_bucket: string, prefix: string, opts: { cursor?: string; limit: number; delimiter?: string }): Promise<ListResult> {
    // Collapse keys under the delimiter into common prefixes, in key order, then page through that list.
    // The static data never changes, so the cursor can simply be an offset.
    const entries: ({ kind: "object"; object: StoredObject } | { kind: "prefix"; prefix: string })[] = [];
    const seen = new Set<string>();
    for (const object of this.objects) {
      if (!object.key.startsWith(prefix)) continue;
      const rest = object.key.slice(prefix.length);
      const cut = opts.delimiter ? rest.indexOf(opts.delimiter) : -1;
      if (cut === -1) {
        entries.push({ kind: "object", object });
      } else {
        const common = prefix + rest.slice(0, cut + opts.delimiter!.length);
        if (!seen.has(common)) {
          seen.add(common);
          entries.push({ kind: "prefix", prefix: common });
        }
      }
    }

    const start = opts.cursor ? Math.max(0, Number.parseInt(opts.cursor, 10) || 0) : 0;
    const page = entries.slice(start, start + opts.limit);
    const next = start + page.length;
    const truncated = next < entries.length;

    return {
      objects: page.flatMap((e) =>
        e.kind === "object" ? [{ key: e.object.key, size: e.object.size, lastModified: e.object.lastModified, etag: e.object.etag }] : [],
      ),
      commonPrefixes: page.flatMap((e) => (e.kind === "prefix" ? [e.prefix] : [])),
      cursor: truncated ? String(next) : null,
      truncated,
    };
  }

  async head(_bucket: string, key: string): Promise<ObjectHead | null> {
    const object = this.find(key);
    if (!object) return null;
    const { body: _body, ...head } = object;
    return { ...head, customMetadata: { ...head.customMetadata } };
  }

  async get(_bucket: string, key: string, opts?: GetOptions): Promise<GetResult | null> {
    const object = this.find(key);
    if (!object) return null;
    const { body, ...head } = object;
    const total = body.byteLength;

    if (opts?.range) {
      const start = opts.range.start;
      const end = Math.min(opts.range.end ?? total - 1, total - 1);
      if (total === 0 || start >= total || end < start) {
        throw new RangeNotSatisfiableError(total);
      }
      return {
        ...head,
        customMetadata: { ...head.customMetadata },
        body: streamOf(body.slice(start, end + 1)),
        range: { start, end, total },
      };
    }
    return { ...head, customMetadata: { ...head.customMetadata }, body: streamOf(body.slice()) };
  }

  async put(): Promise<{ etag: string }> {
    return readOnly();
  }
  async delete(): Promise<void> {
    return readOnly();
  }
  async deleteMany(): Promise<void> {
    return readOnly();
  }
  async copy(): Promise<{ etag: string }> {
    return readOnly();
  }
  async createMultipartUpload(): Promise<never> {
    return readOnly();
  }
  async signUploadPart(): Promise<string> {
    return readOnly();
  }
  async completeMultipartUpload(): Promise<{ etag: string }> {
    return readOnly();
  }
  async abortMultipartUpload(): Promise<void> {
    return readOnly();
  }
  async signGetUrl(): Promise<string> {
    return readOnly();
  }
}
