export interface ObjectSummary {
  key: string;
  size: number;
  lastModified: Date;
  etag: string;
}

export interface ListResult {
  objects: ObjectSummary[];
  commonPrefixes: string[];
  cursor: string | null;
  truncated: boolean;
}

export interface ObjectHead {
  key: string;
  size: number;
  etag: string;
  lastModified: Date;
  contentType?: string;
  contentDisposition?: string;
  cacheControl?: string;
  contentLanguage?: string;
  customMetadata: Record<string, string>;
}

export interface GetOptions {
  range?: { start: number; end?: number };
}

/** The requested byte range cannot be served for an object of `total` bytes. */
export class RangeNotSatisfiableError extends Error {
  constructor(readonly total: number) {
    super("Requested range is not satisfiable");
    this.name = "RangeNotSatisfiableError";
  }
}

export interface GetResult extends ObjectHead {
  body: ReadableStream<Uint8Array>;
  range?: { start: number; end: number; total: number };
}

export interface PutOptions {
  contentType?: string;
  contentDisposition?: string;
  cacheControl?: string;
  contentLanguage?: string;
  customMetadata?: Record<string, string>;
}

export interface MultipartUploadHandle {
  uploadId: string;
  key: string;
}

export interface CompletedPart {
  partNumber: number;
  etag: string;
}

/**
 * Storage abstraction over a single R2 bucket, implemented via the S3 API
 * (see server/src/storage/r2-s3.ts). Every method takes/returns plain data so
 * routes never touch the underlying SDK.
 */
export interface Storage {
  list(bucket: string, prefix: string, opts: { cursor?: string; limit: number; delimiter?: string }): Promise<ListResult>;
  head(bucket: string, key: string): Promise<ObjectHead | null>;
  get(bucket: string, key: string, opts?: GetOptions): Promise<GetResult | null>;
  put(bucket: string, key: string, body: ReadableStream<Uint8Array> | Uint8Array, opts?: PutOptions): Promise<{ etag: string }>;
  delete(bucket: string, key: string): Promise<void>;
  deleteMany(bucket: string, keys: string[]): Promise<void>;
  copy(sourceBucket: string, sourceKey: string, destBucket: string, destKey: string): Promise<{ etag: string }>;

  createMultipartUpload(bucket: string, key: string, opts?: PutOptions): Promise<MultipartUploadHandle>;
  signUploadPart(bucket: string, key: string, uploadId: string, partNumber: number, expiresInSeconds: number): Promise<string>;
  completeMultipartUpload(bucket: string, key: string, uploadId: string, parts: CompletedPart[]): Promise<{ etag: string }>;
  abortMultipartUpload(bucket: string, key: string, uploadId: string): Promise<void>;

  signGetUrl(bucket: string, key: string, expiresInSeconds: number, opts?: { responseContentDisposition?: string }): Promise<string>;
}
