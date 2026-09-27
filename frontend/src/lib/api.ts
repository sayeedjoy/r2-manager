import type {
  ApiErrorBody,
  AppSettings,
  ListObjectsResponse,
  ObjectMetadata,
  Role,
  Share,
  TreeOperationResponse,
  UserRecord,
} from "@r2-manager/shared";

export class ApiError extends Error {
  readonly body: ApiErrorBody;
  readonly status: number;

  constructor(body: ApiErrorBody, status: number) {
    super(body.error.message);
    this.body = body;
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: "include",
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
    if (body?.error) throw new ApiError(body, res.status);
    throw new Error(`Request failed with status ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

const json = (body: unknown) => JSON.stringify(body);

export interface Me {
  id: string;
  identity: string;
  displayName: string;
  role: Role;
}

/** Mirrors server/src/db/schema.ts mail_messages as the mail routes return it. */
export interface MailMessage {
  id: string;
  externalMessageId: string | null;
  sender: string;
  recipient: string;
  subject: string | null;
  receivedAt: string;
  status: "processed" | "rejected" | "failed";
  reason: string | null;
}

export interface MailAttachment {
  id: string;
  messageId: string;
  displayFilename: string;
  mimeType: string | null;
  size: number | null;
  status: "stored" | "rejected";
}

export interface AuditEvent {
  id: string;
  actorId: string | null;
  action: string;
  target: string | null;
  outcome: "success" | "failure";
  correlationId: string;
  details: unknown;
  createdAt: string;
}

export interface UpsertUserBody {
  identity: string;
  displayName: string;
  role: Role;
  grants: { bucket: string; prefix: string }[];
}

export const api = {
  me: () => request<Me>("/api/v1/me"),

  listBuckets: () => request<{ buckets: string[] }>("/api/v1/buckets"),

  listObjects: (params: { bucket: string; prefix: string; cursor?: string; limit?: number }) => {
    const qs = new URLSearchParams({ bucket: params.bucket, prefix: params.prefix });
    if (params.cursor) qs.set("cursor", params.cursor);
    if (params.limit) qs.set("limit", String(params.limit));
    return request<ListObjectsResponse>(`/api/v1/objects?${qs.toString()}`);
  },

  contentUrl: (bucket: string, key: string) =>
    `/api/v1/objects/content?${new URLSearchParams({ bucket, key }).toString()}`,

  createFolder: (bucket: string, key: string) =>
    request("/api/v1/folders", { method: "POST", body: json({ bucket, key }) }),

  rename: (bucket: string, key: string, newName: string, onConflict: "fail" | "overwrite" | "rename" = "fail") =>
    request("/api/v1/objects/rename", { method: "POST", body: json({ bucket, key, newName, onConflict }) }),

  copy: (
    sourceBucket: string,
    sourceKey: string,
    destBucket: string,
    destKey: string,
    onConflict: "fail" | "overwrite" | "rename" = "fail",
  ) => request("/api/v1/objects/copy", { method: "POST", body: json({ sourceBucket, sourceKey, destBucket, destKey, onConflict }) }),

  move: (
    sourceBucket: string,
    sourceKey: string,
    destBucket: string,
    destKey: string,
    onConflict: "fail" | "overwrite" | "rename" = "fail",
  ) => request("/api/v1/objects/move", { method: "POST", body: json({ sourceBucket, sourceKey, destBucket, destKey, onConflict }) }),

  deleteObjects: (bucket: string, keys: string[]) =>
    request("/api/v1/objects/delete", { method: "POST", body: json({ bucket, keys }) }),

  getContent: async (bucket: string, key: string): Promise<string> => {
    const res = await fetch(`/api/v1/objects/content?${new URLSearchParams({ bucket, key }).toString()}`, {
      credentials: "include",
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
      if (body?.error) throw new ApiError(body, res.status);
      throw new Error(`Request failed with status ${res.status}`);
    }
    return res.text();
  },

  updateContent: (body: { bucket: string; key: string; ifMatch: string; content: string; contentType?: string }) =>
    request<{ bucket: string; key: string; etag: string; size: number }>("/api/v1/objects/content", {
      method: "PUT",
      body: json(body),
    }),

  downloadZip: async (bucket: string, keys: string[], archiveName = "download.zip"): Promise<void> => {
    const res = await fetch("/api/v1/objects/zip", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: json({ bucket, keys, archiveName }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
      if (body?.error) throw new ApiError(body, res.status);
      throw new Error(`Request failed with status ${res.status}`);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = archiveName;
    a.click();
    URL.revokeObjectURL(url);
  },

  treeOp: (body: {
    op: "copy" | "move" | "delete";
    sourceBucket: string;
    sourcePrefix: string;
    destBucket?: string;
    destPrefix?: string;
    onConflict?: "fail" | "overwrite" | "rename";
    cursor?: string;
  }) => request<TreeOperationResponse>("/api/v1/folders/tree-op", { method: "POST", body: json(body) }),

  getMetadata: (bucket: string, key: string) =>
    request<ObjectMetadata>(`/api/v1/metadata?${new URLSearchParams({ bucket, key }).toString()}`),

  updateMetadata: (body: {
    bucket: string;
    key: string;
    ifMatch: string;
    contentType?: string;
    contentDisposition?: string;
    cacheControl?: string;
    contentLanguage?: string;
    customMetadata?: Record<string, string>;
  }) => request("/api/v1/metadata", { method: "PUT", body: json(body) }),

  createUpload: (body: { bucket: string; key: string; size: number; contentType?: string; onConflict?: "fail" | "overwrite" | "rename" }) =>
    request<{ uploadId: string; bucket: string; key: string; partSize: number; totalParts: number }>("/api/v1/uploads", {
      method: "POST",
      body: json(body),
    }),

  signPart: (uploadId: string, partNumber: number) =>
    request<{ url: string; partNumber: number; expiresAt: string }>("/api/v1/uploads/sign-part", {
      method: "POST",
      body: json({ uploadId, partNumber }),
    }),

  completeUpload: (uploadId: string, parts: { partNumber: number; etag: string }[]) =>
    request<{ bucket: string; key: string; etag: string; size: number }>("/api/v1/uploads/complete", {
      method: "POST",
      body: json({ uploadId, parts }),
    }),

  abortUpload: (uploadId: string) => request("/api/v1/uploads/abort", { method: "POST", body: json({ uploadId }) }),

  /** Read-only limits (preview/editor/upload size ceilings) any authenticated user may read. */
  getAppSettings: () => request<AppSettings>("/api/v1/settings"),

  createShare: (body: {
    bucket: string;
    key: string;
    password?: string;
    expiresAt?: string;
    maxDownloads?: number;
    deliveryMode?: "stream" | "redirect";
    inlinePreview?: boolean;
  }) => request<Share>("/api/v1/shares", { method: "POST", body: json(body) }),

  listShares: (bucket: string, key: string) =>
    request<{ shares: Share[] }>(`/api/v1/shares?${new URLSearchParams({ bucket, key }).toString()}`),

  revokeShare: (id: string) => request(`/api/v1/shares/${id}/revoke`, { method: "POST" }),

  listMailMessages: () => request<{ messages: MailMessage[] }>("/api/v1/mail/messages"),
  getMailMessage: (id: string) => request<{ message: MailMessage; attachments: MailAttachment[] }>(`/api/v1/mail/messages/${id}`),
  attachmentContentUrl: (id: string) => `/api/v1/mail/attachments/${id}/content`,
  copyAttachmentToFolder: (attachmentId: string, destBucket: string, destKey: string) =>
    request<{ bucket: string; key: string; etag: string }>(`/api/v1/mail/attachments/${attachmentId}/copy-to-folder`, {
      method: "POST",
      body: json({ destBucket, destKey }),
    }),

  listUsers: () => request<{ users: UserRecord[] }>("/api/v1/admin/users"),
  upsertUser: (body: UpsertUserBody) => request<{ id: string }>("/api/v1/admin/users", { method: "POST", body: json(body) }),
  disableUser: (id: string) => request(`/api/v1/admin/users/${id}/disable`, { method: "POST" }),
  getSettings: () => request<AppSettings>("/api/v1/admin/settings"),
  updateSettings: (body: Partial<AppSettings>) =>
    request<AppSettings>("/api/v1/admin/settings", { method: "PUT", body: json(body) }),
  getAudit: () => request<{ events: AuditEvent[] }>("/api/v1/admin/audit"),
  getHealth: () => request<{ checks: Record<string, string>; buckets: string[] }>("/api/v1/admin/health"),
};
