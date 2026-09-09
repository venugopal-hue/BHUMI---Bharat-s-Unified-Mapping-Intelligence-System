/**
 * API client.
 *
 * Handles token storage, transparent refresh on 401, and turning FastAPI's
 * error shapes into a message a Tehsildar can act on. Error text is the
 * product: "Village 'Shirdee' was not found in the LGD directory" is useful;
 * "Request failed with status code 422" is not.
 */

import type {
  AuditEntry,
  Batch,
  ChainVerification,
  DocumentItem,
  DocumentPage,
  Overview,
  Parcel,
  ProgressItem,
  QueueItem,
  QueueStats,
  RecordDetail,
  RecordSummary,
  User,
} from "./types";

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const PREFIX = "/api/v1";

const ACCESS_KEY = "bhumi.access";
const REFRESH_KEY = "bhumi.refresh";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly detail?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const tokens = {
  access: () => (typeof window === "undefined" ? null : localStorage.getItem(ACCESS_KEY)),
  refresh: () => (typeof window === "undefined" ? null : localStorage.getItem(REFRESH_KEY)),
  set(access: string, refresh: string) {
    localStorage.setItem(ACCESS_KEY, access);
    localStorage.setItem(REFRESH_KEY, refresh);
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

/** FastAPI returns detail as a string, an object, or a validation array. */
function readErrorMessage(body: unknown, status: number): string {
  if (typeof body === "string" && body) return body;

  if (body && typeof body === "object") {
    const detail = (body as { detail?: unknown }).detail;
    if (typeof detail === "string") return detail;

    if (Array.isArray(detail)) {
      const first = detail[0] as { loc?: string[]; msg?: string } | undefined;
      if (first?.msg) {
        const field = first.loc?.filter((p) => p !== "body").join(".");
        return field ? `${field}: ${first.msg}` : first.msg;
      }
    }

    if (detail && typeof detail === "object") {
      const d = detail as { message?: string; error?: string; issues?: string[] };
      if (d.message) return d.message;
      if (d.issues?.length) return d.issues.join(" ");
      if (d.error) return d.error;
    }

    const message = (body as { message?: string }).message;
    if (message) return message;
  }

  if (status === 401) return "Your session has expired. Please sign in again.";
  if (status === 403) return "Your role does not allow this action.";
  if (status === 404) return "Not found.";
  if (status === 409) return "This conflicts with a change someone else made.";
  if (status >= 500) return "The server ran into a problem. Please try again.";
  return `Request failed (${status}).`;
}

let refreshInFlight: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  const refresh = tokens.refresh();
  if (!refresh) return false;

  // Several requests can 401 at once; only one refresh should actually run.
  refreshInFlight ??= (async () => {
    try {
      const response = await fetch(`${BASE}${PREFIX}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refresh }),
      });
      if (!response.ok) {
        tokens.clear();
        return false;
      }
      const data = await response.json();
      tokens.set(data.access_token, data.refresh_token);
      return true;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  skipAuth?: boolean;
  retryOn401?: boolean;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, query, skipAuth, retryOn401 = true, ...rest } = options;

  const url = new URL(`${BASE}${PREFIX}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const headers = new Headers(rest.headers);
  if (body !== undefined) headers.set("Content-Type", "application/json");
  if (!skipAuth) {
    const access = tokens.access();
    if (access) headers.set("Authorization", `Bearer ${access}`);
  }

  const response = await fetch(url.toString(), {
    ...rest,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (response.status === 401 && retryOn401 && !skipAuth) {
    if (await refreshSession()) {
      return request<T>(path, { ...options, retryOn401: false });
    }
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
      window.location.href = "/login";
    }
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!response.ok) {
    throw new ApiError(readErrorMessage(payload, response.status), response.status, payload);
  }
  return payload as T;
}

const get = <T,>(path: string, query?: RequestOptions["query"]) =>
  request<T>(path, { method: "GET", query });
const post = <T,>(path: string, body?: unknown, query?: RequestOptions["query"]) =>
  request<T>(path, { method: "POST", body, query });
const patch = <T,>(path: string, body?: unknown) =>
  request<T>(path, { method: "PATCH", body });

/* ── Auth ────────────────────────────────────────────────────────── */
export const authApi = {
  login: (username: string, password: string, mfa_code?: string) =>
    request<{
      access_token: string;
      refresh_token: string;
      expires_in: number;
      must_change_password: boolean;
    }>("/auth/login", {
      method: "POST",
      body: { username, password, mfa_code },
      skipAuth: true,
    }),
  me: () => get<User>("/auth/me"),
  logout: () => {
    const refresh = tokens.refresh();
    tokens.clear();
    return refresh
      ? request<void>("/auth/logout", { method: "POST", body: { refresh_token: refresh } }).catch(
          () => undefined,
        )
      : Promise.resolve();
  },
  changePassword: (current_password: string, new_password: string) =>
    post<void>("/auth/change-password", { current_password, new_password }),
  updateProfile: (data: { full_name?: string; email?: string }) =>
    patch<User>("/auth/me", data),
  sessions: () =>
    get<{
      login_at: string; logout_at: string | null; duration_s: number | null;
      ip: string; device: string; device_type: "desktop" | "mobile";
      status: "ACTIVE" | "CLOSED" | "FAILED"; close_reason?: string;
    }[]>("/auth/sessions"),
  revokeOtherSessions: () =>
    request<void>("/auth/sessions", { method: "DELETE" }),
};

/* ── Intake ──────────────────────────────────────────────────────── */
export const intakeApi = {
  createBatch: (payload: Record<string, unknown>) =>
    post<Batch>("/batches", payload),
  listBatches: (_query?: RequestOptions["query"]) =>
    get<Batch[]>("/batches", _query),
  getBatch: (id: string) =>
    get<Batch>(`/batches/${id}`),
  presign: (files: { filename: string; mime_type: string; size_bytes: number }[], batch_id?: string) =>
    post<{ uploads: { url: string; key: string; filename: string }[]; expires_in: number }>("/documents/presign", { batch_id, files }),
  register: (documents: { filename: string; storage_key: string; content_sha256: string; mime_type: string; size_bytes: number }[], _batch_id?: string) =>
    post<{ registered: number; queued: number; duplicates: { filename: string; existing_document_id: string }[]; document_ids: string[] }>("/documents/register", { batch_id: _batch_id, documents }),
  listDocuments: (_query?: RequestOptions["query"]) =>
    get<DocumentItem[]>("/documents", _query),
  getDocument: (id: string) =>
    get<DocumentItem>(`/documents/${id}`),
  getPages: (id: string) =>
    get<DocumentPage[]>(`/documents/${id}/pages`),
  reprocess: (_id: string) =>
    post<{ status: string }>(`/documents/${_id}/reprocess`),
  streamUrl: (batchId: string) => `${BASE}${PREFIX}/batches/${batchId}/stream`,
};

/* ── Records ─────────────────────────────────────────────────────── */
export const recordsApi = {
  search: (_query?: RequestOptions["query"]) =>
    get<RecordSummary[]>("/records", _query),
  get: (id: string) =>
    get<RecordDetail>(`/records/${id}`),
  update: (id: string, fields: { field_name: string; value?: string | null; flag?: string; note?: string }[]) =>
    patch<RecordDetail>(`/records/${id}`, { fields }),
  history: (_id: string) =>
    get<AuditEntry[]>(`/records/${_id}/history`),
  validation: (_id: string) =>
    get<{ record_id: string; summary: Record<string, number>; passed: number; results: unknown[] }>(`/records/${_id}/validation`),
  fieldSchema: () =>
    get<{ groups: { key: string; label: string; fields: { name: string; label: string; mandatory: boolean }[] }[]; mandatory: string[] }>("/records/meta/field-schema"),
  stats: () =>
    get<{ by_status: Record<string, number> }>("/records/meta/stats"),
};

/* ── Review ──────────────────────────────────────────────────────── */
export const reviewApi = {
  queue: (_query?: RequestOptions["query"]) =>
    get<QueueItem[]>("/review/queue", _query),
  stats: () =>
    get<QueueStats>("/review/queue/stats"),
  next: (_queue_type?: string) =>
    get<QueueItem | null>("/review/queue/next", { queue_type: _queue_type }),
  claim: (_recordId: string) =>
    post<{ locked_until: string }>(`/review/${_recordId}/claim`),
  heartbeat: (_recordId: string) =>
    post<{ locked_until: string }>(`/review/${_recordId}/heartbeat`),
  release: (_recordId: string) =>
    post<void>(`/review/${_recordId}/release`),
  approve: (_recordId: string, _payload: { comment?: string; duration_ms?: number; override_blocking?: boolean }) =>
    post<{ status: string; verified_at: string; corrections_applied: number; message?: string }>(`/review/${_recordId}/approve`, _payload),
  reject: (_recordId: string, _payload: { reason_code: string; reason: string; duration_ms?: number }) =>
    post<{ status: string }>(`/review/${_recordId}/reject`, _payload),
  escalate: (_recordId: string, _payload: { reason: string }) =>
    post<{ status: string; priority: number }>(`/review/${_recordId}/escalate`, _payload),
  bulkApprove: (_payload: { batch_id?: string; min_confidence?: number; limit?: number }) =>
    post<{ approved: number; threshold: number }>("/review/bulk-approve", _payload),
};

/* ── Insights ────────────────────────────────────────────────────── */
export const insightsApi = {
  overview: (_days = 30) =>
    get<Overview>("/analytics/overview", { days: _days }),
  progress: (level: string, parent_id?: string) =>
    get<{ level: string; items: ProgressItem[] }>("/analytics/progress", { level, parent_id }),
  accuracy: (_days = 90) =>
    get<Record<string, unknown>>("/analytics/accuracy", { days: _days }),
  operations: (_days = 7) =>
    get<Record<string, unknown>>("/analytics/operations", { days: _days }),
  verification: (_days = 30) =>
    get<{ verifiers: { user_id: string | null; records_completed: number; avg_handling_seconds: number | null }[]; sla_breaches: number; queue_aging: Record<string, number>; field_edits: number }>("/analytics/verification", { days: _days }),
  errors: (_days = 30) =>
    get<{ top_validation_failures: { rule: string; severity: string; count: number }[]; documents_needing_rescan: number }>("/analytics/errors", { days: _days }),
};

/* ── Mapping ─────────────────────────────────────────────────────── */
export const mappingApi = {
  parcels: (_query?: RequestOptions["query"]) =>
    get<Parcel[]>("/gis/parcels", _query),
  parcel: (id: string) =>
    get<Parcel>(`/gis/parcels/${id}`),
  tileUrl: () => `${BASE}${PREFIX}/gis/tiles/{z}/{x}/{y}.mvt`,
  villageSummary: (villageId: string) =>
    get<{
      parcels: number;
      parcels_linked: number;
      parcels_orphaned: number;
      records: number;
      records_orphaned: number;
      link_coverage_pct: number;
    }>(`/gis/villages/${villageId}/summary`),
  validateTopology: (villageId: string) =>
    get<{
      issues_found: number;
      clean: boolean;
      invalid_geometry: unknown[];
      overlaps: unknown[];
      slivers: unknown[];
    }>(`/gis/validate/${villageId}`),
  mapSheets: (query?: RequestOptions["query"]) =>
    get<
      {
        id: string;
        sheet_ref: string | null;
        status: string;
        rms_error_m: number | null;
        parcels_extracted: number;
        gcp_count: number;
        url: string | null;
      }[]
    >("/gis/mapsheets", query),
  georeference: (sheetId: string, payload: unknown) =>
    post<{ rms_error_m: number; quality: string; message: string }>(
      `/gis/mapsheets/${sheetId}/georeference`,
      payload,
    ),
  vectorize: (sheetId: string) => post<{ status: string }>(`/gis/mapsheets/${sheetId}/vectorize`),
  linkParcel: (parcelId: string, record_id: string) =>
    post<{ area_delta_pct: number | null; within_tolerance: boolean }>(
      `/gis/parcels/${parcelId}/link`,
      { record_id },
    ),
};

/* ── Validation ──────────────────────────────────────────────────── */
export const validationApi = {
  rules: (_query?: RequestOptions["query"]) =>
    get<{ id: string; rule_key: string; name: string; category: string; severity: string; expression: string; message_en: string; fix_hint: string; is_enabled: boolean }[]>("/rules", _query),
  testRule: (_payload: unknown) =>
    post<{ valid: boolean; status?: string; message?: string; error?: string }>("/rules/test", _payload),
  revalidate: (_recordId: string) =>
    post<{ summary: Record<string, number> }>(`/records/${_recordId}/revalidate`),
  duplicates: () =>
    get<{ id: string; cluster_key: string; match_type: string; score: number; record_ids: string[] }[]>("/duplicates"),
  resolveDuplicate: (_clusterId: string, _payload: unknown) =>
    post<{ status: string }>(`/duplicates/${_clusterId}/resolve`, _payload),
};

/* ── Vault ───────────────────────────────────────────────────────── */
export const vaultApi = {
  audit: (_query?: RequestOptions["query"]) =>
    get<AuditEntry[]>("/audit", _query),
  verifyChain: () =>
    get<ChainVerification>("/audit/verify-chain"),
  auditSummary: (_days = 30) =>
    get<{ total_entries: number; head_chain_hash: string | null; failed_logins: number; by_action: { action: string; count: number }[]; daily: { date: string; count: number }[] }>("/audit/summary", { days: _days }),
  stats: () =>
    get<{ documents_stored: number; pages_stored: number; storage_gb: number; duplicates_prevented: number }>("/vault/stats"),
};

/* ── Integrations ────────────────────────────────────────────────── */
export const integrationsApi = {
  list: () =>
    get<{ key: string; name: string; kind: string; is_enabled: boolean; health_status: string; circuit_open: boolean; success_count: number; failure_count: number; mapped_fields?: number }[]>("/integrations"),
  health: (key: string) =>
    post<{ healthy: boolean; latency_ms: number | null; message: string }>(`/integrations/${key}/health`),
  sync: (_key: string, _query?: RequestOptions["query"]) =>
    post<{ queued: number }>(`/integrations/${_key}/sync`, undefined, _query),
  syncJobs: (_query?: RequestOptions["query"]) =>
    get<{ id: string; integration: string; record_id: string | null; status: string; external_id: string | null; attempts: number; error: string | null; created_at: string }[]>("/integrations/sync-jobs", _query),
  retry: (_jobId: string) =>
    post<{ status: string }>(`/integrations/sync-jobs/${_jobId}/retry`),
  toggle: (key: string, enabled: boolean) =>
    post<{ key: string; is_enabled: boolean }>(`/integrations/${key}/toggle`, { enabled }),
  reset: (key: string) =>
    post<{ key: string; circuit_open: boolean }>(`/integrations/${key}/reset`),
  create: (payload: { name: string; key: string; base_url?: string; kind: string }) =>
    post<unknown>("/integrations", payload),
};

/* ── Learning ────────────────────────────────────────────────────── */
export const learningApi = {
  models: (_query?: RequestOptions["query"]) =>
    get<{ id: string; key: string; model_key: string; name: string; version: string; status: string; accuracy: number | null; last_trained_at: string | null; metrics: Record<string, unknown> }[]>("/models", _query),
  history: (_modelKey: string) =>
    get<{ model_key: string; versions: number; series: Record<string, unknown>[]; primary_metric: string; improvement_points: number | null; active_version: string | null }>(`/models/${_modelKey}/history`),
  promote: (_modelId: string, traffic_pct = 100) =>
    post<{ status: string; version: string }>(`/models/${_modelId}/promote`, undefined, { traffic_pct }),
  correctionStats: (_days = 90) =>
    get<{ total_corrections: number; unused_for_training: number; handwritten_share_pct: number; by_field: { field: string; count: number }[]; by_language: { language: string; count: number; avg_ai_confidence: number | null }[]; daily: { date: string; count: number }[]; ready_to_train: boolean; message: string }>("/models/corrections/stats", { days: _days }),
  train: (_model_key: string) =>
    post<{ run_id: string }>("/models/training/trigger", undefined, { model_key: _model_key }),
};

/* ── Outbound Notifications (SMS / Email / Push) ─────────────────── */
export const notificationsApi = {
  list: (_query?: RequestOptions["query"]) =>
    get<{ id: string; title: string; body: string; severity: string; read_at: string | null; created_at: string }[]>("/notifications", _query),
  markRead: (id: string) =>
    post<{ id: string; read: boolean }>(`/notifications/${id}/read`),
  markAllRead: () =>
    post<{ count: number }>("/notifications/mark-all-read"),
  sendSms: (payload: { mobile: string; message: string; template_id?: string }) =>
    post<{ message_id: string; status: string }>("/notifications/sms", payload),
  sendEmail: (payload: { to: string; subject: string; body_text: string; body_html?: string }) =>
    post<{ message_id: string; status: string }>("/notifications/email", payload),
  sendPush: (payload: { user_id: string; title: string; body: string; data?: Record<string, string> }) =>
    post<{ message_id: string; status: string }>("/notifications/push", payload),
  dispatchLog: (_query?: RequestOptions["query"]) =>
    get<{ total: number; delivered: number; failed: number; pending: number; last_24h: number }>("/notifications/dispatch-log", _query),
};

export const usersApi = {
  changeRequest: (field: string, reason: string) =>
    post<{ id: string; status: string }>("/users/change-request", { field, reason }),
};

export interface AdminUser {
  id: string;
  username: string;
  full_name: string;
  email: string;
  designation: string;
  domain: "platform" | "government";
  roles: string[];
  permissions: string[];
  jurisdictions: { level: string; code: string; label: string }[];
  status: "pending" | "active" | "suspended" | "rejected";
  created_at: string;
  approved_at?: string | null;
  approved_by?: string | null;
}

export const adminApi = {
  listUsers: (query?: RequestOptions["query"]) =>
    get<AdminUser[]>("/users", query),
  updateUserStatus: (id: string, status: AdminUser["status"]) =>
    patch<AdminUser>(`/users/${id}/status`, { status }),
  updateUserRole: (id: string, designation: string) =>
    patch<AdminUser>(`/users/${id}/role`, { designation }),
  inviteUser: (payload: { full_name: string; email: string; role: string; state?: string; district?: string }) =>
    post<{ id: string; status: string }>("/users/invite", payload),
};

export const publicApi = {
  search: (query: RequestOptions["query"]) =>
    request<{ count: number; masked: boolean; results: Record<string, unknown>[] }>(
      "/public/records/search",
      { method: "GET", query, skipAuth: true },
    ),
  stats: () =>
    request<{ records_digitized: number; records_verified: number; verification_rate_pct: number }>(
      "/public/stats",
      { method: "GET", skipAuth: true },
    ),
};
