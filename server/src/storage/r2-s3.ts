import { AwsClient } from "aws4fetch";
import { XMLParser, XMLBuilder } from "fast-xml-parser";
import type {
  CompletedPart,
  GetOptions,
  GetResult,
  ListResult,
  MultipartUploadHandle,
  ObjectHead,
  PutOptions,
  Storage,
} from "./storage";

const xmlParser = new XMLParser({ ignoreAttributes: false });
const xmlBuilder = new XMLBuilder({ ignoreAttributes: false });

const CUSTOM_META_PREFIX = "x-amz-meta-";

export interface R2S3Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint: string;
}

/** R2's S3-compatible API implementation of the Storage interface. Buckets are addressed path-style. */
export class R2S3Storage implements Storage {
  private client: AwsClient;
  private endpoint: string;

  constructor(config: R2S3Config) {
    this.client = new AwsClient({
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      service: "s3",
      region: "auto",
    });
    this.endpoint = config.endpoint.replace(/\/$/, "");
  }

  private urlFor(bucket: string, key = "", query: Record<string, string> = {}): string {
    const encodedKey = key
      .split("/")
      .map((seg) => encodeURIComponent(seg))
      .join("/");
    const qs = new URLSearchParams(query).toString();
    return `${this.endpoint}/${bucket}/${encodedKey}${qs ? `?${qs}` : ""}`;
  }

  private async fetch(url: string, init?: RequestInit): Promise<Response> {
    const res = await this.client.fetch(url, init);
    if (!res.ok && res.status !== 404 && res.status !== 206) {
      const text = await res.text().catch(() => "");
      throw new Error(`R2 request failed: ${res.status} ${res.statusText} ${text.slice(0, 500)}`);
    }
    return res;
  }

  async list(
    bucket: string,
    prefix: string,
    opts: { cursor?: string; limit: number; delimiter?: string },
  ): Promise<ListResult> {
    const query: Record<string, string> = {
      "list-type": "2",
      prefix,
      "max-keys": String(opts.limit),
    };
    if (opts.delimiter) query.delimiter = opts.delimiter;
    if (opts.cursor) query["continuation-token"] = opts.cursor;

    const res = await this.fetch(this.urlFor(bucket, "", query));
    const xml = await res.text();
    const parsed = xmlParser.parse(xml);
    const result = parsed.ListBucketResult ?? {};

    const rawContents = result.Contents ? (Array.isArray(result.Contents) ? result.Contents : [result.Contents]) : [];
    const rawPrefixes = result.CommonPrefixes
      ? Array.isArray(result.CommonPrefixes)
        ? result.CommonPrefixes
        : [result.CommonPrefixes]
      : [];

    return {
      objects: rawContents.map((c: any) => ({
        key: String(c.Key),
        size: Number(c.Size ?? 0),
        lastModified: new Date(c.LastModified),
        etag: String(c.ETag ?? "").replace(/"/g, ""),
      })),
      commonPrefixes: rawPrefixes.map((p: any) => String(p.Prefix)),
      cursor: result.NextContinuationToken ?? null,
      truncated: result.IsTruncated === true || result.IsTruncated === "true",
    };
  }

  async head(bucket: string, key: string): Promise<ObjectHead | null> {
    const res = await this.fetch(this.urlFor(bucket, key), { method: "HEAD" });
    if (res.status === 404) return null;
    return this.headersToObjectHead(key, res);
  }

  private headersToObjectHead(key: string, res: Response): ObjectHead {
    const customMetadata: Record<string, string> = {};
    res.headers.forEach((value, name) => {
      if (name.toLowerCase().startsWith(CUSTOM_META_PREFIX)) {
        customMetadata[name.slice(CUSTOM_META_PREFIX.length)] = value;
      }
    });
    return {
      key,
      size: Number(res.headers.get("content-length") ?? 0),
      etag: (res.headers.get("etag") ?? "").replace(/"/g, ""),
      lastModified: new Date(res.headers.get("last-modified") ?? Date.now()),
      contentType: res.headers.get("content-type") ?? undefined,
      contentDisposition: res.headers.get("content-disposition") ?? undefined,
      cacheControl: res.headers.get("cache-control") ?? undefined,
      contentLanguage: res.headers.get("content-language") ?? undefined,
      customMetadata,
    };
  }

  async get(bucket: string, key: string, opts?: GetOptions): Promise<GetResult | null> {
    const headers: Record<string, string> = {};
    if (opts?.range) {
      headers.Range = `bytes=${opts.range.start}-${opts.range.end ?? ""}`;
    }
    const res = await this.fetch(this.urlFor(bucket, key), { headers });
    if (res.status === 404 || !res.body) return null;

    const head = this.headersToObjectHead(key, res);
    let range: GetResult["range"];
    const contentRange = res.headers.get("content-range");
    if (contentRange) {
      const match = /bytes (\d+)-(\d+)\/(\d+)/.exec(contentRange);
      if (match) range = { start: Number(match[1]), end: Number(match[2]), total: Number(match[3]) };
    }
    return { ...head, body: res.body, range };
  }

  async put(
    bucket: string,
    key: string,
    body: ReadableStream<Uint8Array> | Uint8Array,
    opts: PutOptions = {},
  ): Promise<{ etag: string }> {
    const headers: Record<string, string> = {};
    if (opts.contentType) headers["content-type"] = opts.contentType;
    if (opts.contentDisposition) headers["content-disposition"] = opts.contentDisposition;
    if (opts.cacheControl) headers["cache-control"] = opts.cacheControl;
    if (opts.contentLanguage) headers["content-language"] = opts.contentLanguage;
    for (const [k, v] of Object.entries(opts.customMetadata ?? {})) {
      headers[`${CUSTOM_META_PREFIX}${k}`] = v;
    }
    const res = await this.fetch(this.urlFor(bucket, key), {
      method: "PUT",
      headers,
      body: body as any,
      // Node's fetch requires this for streaming request bodies; not in the RequestInit type yet.
      duplex: body instanceof ReadableStream ? "half" : undefined,
    } as RequestInit);
    return { etag: (res.headers.get("etag") ?? "").replace(/"/g, "") };
  }

  async delete(bucket: string, key: string): Promise<void> {
    await this.fetch(this.urlFor(bucket, key), { method: "DELETE" });
  }

  async deleteMany(bucket: string, keys: string[]): Promise<void> {
    // S3 batch delete accepts up to 1000 keys per request.
    const chunks: string[][] = [];
    for (let i = 0; i < keys.length; i += 1000) chunks.push(keys.slice(i, i + 1000));

    for (const chunk of chunks) {
      const body = xmlBuilder.build({
        Delete: {
          "@_xmlns": "http://s3.amazonaws.com/doc/2006-03-01/",
          Object: chunk.map((k) => ({ Key: k })),
        },
      });
      await this.fetch(this.urlFor(bucket, "", { delete: "" }), {
        method: "POST",
        headers: { "content-type": "application/xml" },
        body,
      });
    }
  }

  async copy(sourceBucket: string, sourceKey: string, destBucket: string, destKey: string): Promise<{ etag: string }> {
    const source = `/${sourceBucket}/${sourceKey
      .split("/")
      .map((s) => encodeURIComponent(s))
      .join("/")}`;
    const res = await this.fetch(this.urlFor(destBucket, destKey), {
      method: "PUT",
      headers: { "x-amz-copy-source": source },
    });
    const xml = await res.text();
    const parsed = xmlParser.parse(xml);
    const etag = String(parsed.CopyObjectResult?.ETag ?? "").replace(/"/g, "");
    return { etag };
  }

  async createMultipartUpload(bucket: string, key: string, opts: PutOptions = {}): Promise<MultipartUploadHandle> {
    const headers: Record<string, string> = {};
    if (opts.contentType) headers["content-type"] = opts.contentType;
    const res = await this.fetch(this.urlFor(bucket, key, { uploads: "" }), { method: "POST", headers });
    const xml = await res.text();
    const parsed = xmlParser.parse(xml);
    return { uploadId: String(parsed.InitiateMultipartUploadResult.UploadId), key };
  }

  async signUploadPart(
    bucket: string,
    key: string,
    uploadId: string,
    partNumber: number,
    expiresInSeconds: number,
  ): Promise<string> {
    const url = this.urlFor(bucket, key, { partNumber: String(partNumber), uploadId });
    const signed = await this.client.sign(url, {
      method: "PUT",
      aws: { signQuery: true },
      headers: { "X-Amz-Expires": String(expiresInSeconds) },
    });
    return signed.url;
  }

  async completeMultipartUpload(
    bucket: string,
    key: string,
    uploadId: string,
    parts: CompletedPart[],
  ): Promise<{ etag: string }> {
    const body = xmlBuilder.build({
      CompleteMultipartUpload: {
        "@_xmlns": "http://s3.amazonaws.com/doc/2006-03-01/",
        Part: [...parts]
          .sort((a, b) => a.partNumber - b.partNumber)
          .map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })),
      },
    });
    const res = await this.fetch(this.urlFor(bucket, key, { uploadId }), {
      method: "POST",
      headers: { "content-type": "application/xml" },
      body,
    });
    const xml = await res.text();
    const parsed = xmlParser.parse(xml);
    const etag = String(parsed.CompleteMultipartUploadResult?.ETag ?? "").replace(/"/g, "");
    return { etag };
  }

  async abortMultipartUpload(bucket: string, key: string, uploadId: string): Promise<void> {
    await this.fetch(this.urlFor(bucket, key, { uploadId }), { method: "DELETE" });
  }

  async signGetUrl(
    bucket: string,
    key: string,
    expiresInSeconds: number,
    opts: { responseContentDisposition?: string } = {},
  ): Promise<string> {
    const query: Record<string, string> = {};
    if (opts.responseContentDisposition) query["response-content-disposition"] = opts.responseContentDisposition;
    const url = this.urlFor(bucket, key, query);
    const signed = await this.client.sign(url, {
      method: "GET",
      aws: { signQuery: true },
      headers: { "X-Amz-Expires": String(expiresInSeconds) },
    });
    return signed.url;
  }
}
