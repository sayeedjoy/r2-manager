import type {
  ApiErrorBody,
  AppSettings,
  AuthMode,
  AuthStatus,
  ListObjectsResponse,
  LoginResponse,
  ObjectMetadata,
  RecoveryCodesResponse,
  Role,
  SessionInfo,
  Share,
  SmtpSettings,
  TotpSetupResponse,
  TreeOperationResponse,
  UpdateSmtpSettings,
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

/** Fired when the API says the session is gone, so RequireAuth can send the user back to the sign-in page. */
export const UNAUTHENTICATED_EVENT = "r2m:unauthenticated";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: "include",
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  if (res.status === 401 && !path.startsWith("/api/v1/auth/")) window.dispatchEvent(new Event(UNAUTHENTICATED_EVENT));
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
  authMode: AuthMode;
  hasPassword: boolean;
  twoFactorEnabled: boolean;
  recoveryCodesRemaining: number;
  /** DEMO_MODE's shared visitor: an admin over sample data, whose every change the server refuses. */
  demo?: boolean;
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
  password?: string;
}

export const api = {
  // Sign-in, first-run setup and password reset (no session needed).
  authStatus: () => request<AuthStatus>("/api/v1/auth/status"),
  setup: (body: { email?: string; displayName: string; password?: string; setupToken?: string }) =>
    request<{ ok: true }>("/api/v1/auth/setup", { method: "POST", body: json(body) }),
  login: (email: string, password: string) =>
    request<LoginResponse>("/api/v1/auth/login", { method: "POST", body: json({ email, password }) }),
  verifyLogin: (body: { code: string } | { recoveryCode: string }) =>
    request<{ ok: true }>("/api/v1/auth/login/verify", { method: "POST", body: json(body) }),
  logout: () => request<void>("/api/v1/auth/logout", { method: "POST" }),
  forgotPassword: (email: string) =>
    request<{ ok: true }>("/api/v1/auth/password/forgot", { method: "POST", body: json({ email }) }),
  resetPassword: (token: string, password: string) =>
    request<{ ok: true }>("/api/v1/auth/password/reset", { method: "POST", body: json({ token, password }) }),

  me: () => request<Me>("/api/v1/me"),

  // The signed-in user's own password, 2FA and sessions.
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ ok: true }>("/api/v1/account/password", { method: "POST", body: json({ currentPassword, newPassword }) }),
  startTotpSetup: () => request<TotpSetupResponse>("/api/v1/account/2fa/setup", { method: "POST" }),
  enableTotp: (code: string) =>
    request<RecoveryCodesResponse>("/api/v1/account/2fa/enable", { method: "POST", body: json({ code }) }),
  disableTotp: (password: string, code: string) =>
    request<{ ok: true }>("/api/v1/account/2fa/disable", { method: "POST", body: json({ password, code }) }),
  regenerateRecoveryCodes: (password: string) =>
    request<RecoveryCodesResponse>("/api/v1/account/2fa/recovery-codes", { method: "POST", body: json({ password }) }),
  listSessions: () => request<{ sessions: SessionInfo[] }>("/api/v1/account/sessions"),
  revokeSession: (id: string) => request<{ ok: true }>(`/api/v1/account/sessions/${id}`, { method: "DELETE" }),
  revokeOtherSessions: () => request<{ ok: true }>("/api/v1/account/sessions/revoke-others", { method: "POST" }),

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

  listUsers: () => request<{ users: UserRecord[] }>("/api/v1/admin/users"),
  upsertUser: (body: UpsertUserBody) => request<{ id: string }>("/api/v1/admin/users", { method: "POST", body: json(body) }),
  disableUser: (id: string) => request(`/api/v1/admin/users/${id}/disable`, { method: "POST" }),
  setUserPassword: (id: string, password: string) =>
    request<{ ok: true }>(`/api/v1/admin/users/${id}/password`, { method: "POST", body: json({ password }) }),
  sendUserPasswordReset: (id: string) =>
    request<{ ok: true; purpose: "reset" | "invite" }>(`/api/v1/admin/users/${id}/send-reset`, { method: "POST" }),
  disableUserTotp: (id: string) => request<{ ok: true }>(`/api/v1/admin/users/${id}/disable-2fa`, { method: "POST" }),
  getSmtp: () => request<SmtpSettings>("/api/v1/admin/smtp"),
  updateSmtp: (body: UpdateSmtpSettings) => request<SmtpSettings>("/api/v1/admin/smtp", { method: "PUT", body: json(body) }),
  sendTestEmail: (to: string) => request<{ ok: true }>("/api/v1/admin/smtp/test", { method: "POST", body: json({ to }) }),
  getSettings: () => request<AppSettings>("/api/v1/admin/settings"),
  updateSettings: (body: Partial<AppSettings>) =>
    request<AppSettings>("/api/v1/admin/settings", { method: "PUT", body: json(body) }),
  getAudit: (params: { limit: number; offset: number; outcome?: AuditEvent["outcome"]; q?: string }) => {
    const qs = new URLSearchParams({ limit: String(params.limit), offset: String(params.offset) });
    if (params.outcome) qs.set("outcome", params.outcome);
    if (params.q) qs.set("q", params.q);
    return request<{ events: AuditEvent[]; total: number; limit: number; offset: number }>(`/api/v1/admin/audit?${qs.toString()}`);
  },
  getHealth: () => request<{ checks: Record<string, string>; buckets: string[] }>("/api/v1/admin/health"),
};
