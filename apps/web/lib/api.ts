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

/** True when running standalone without a backend (demo mode). */
export const isDemoMode = () =>
  typeof window !== "undefined" &&
  localStorage.getItem("bhumi.access") === "demo-session-token";

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

/* ── Demo-mode resolver ──────────────────────────────────────────── */
import * as mock from "./mock-data";

function demo<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), 60));
}

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
};

/* ── Intake ──────────────────────────────────────────────────────── */
export const intakeApi = {
  createBatch: (payload: Record<string, unknown>) =>
    isDemoMode() ? demo({ ...mock.MOCK_BATCHES[3], label: String((payload as {label?: string}).label ?? "New Batch") } as Batch) : post<Batch>("/batches", payload),
  listBatches: (_query?: RequestOptions["query"]) =>
    isDemoMode() ? demo(mock.MOCK_BATCHES) : get<Batch[]>("/batches", _query),
  getBatch: (id: string) =>
    isDemoMode() ? demo(mock.MOCK_BATCHES.find((b) => b.id === id) ?? mock.MOCK_BATCHES[0]) : get<Batch>(`/batches/${id}`),
  presign: (files: { filename: string; mime_type: string; size_bytes: number }[], batch_id?: string) =>
    isDemoMode()
      ? demo({ uploads: files.map((f) => ({ url: "#demo", key: `demo/${f.filename}`, filename: f.filename })), expires_in: 3600 })
      : post<{ uploads: { url: string; key: string; filename: string }[]; expires_in: number }>("/documents/presign", { batch_id, files }),
  register: (documents: { filename: string; storage_key: string; content_sha256: string; mime_type: string; size_bytes: number }[], _batch_id?: string) =>
    isDemoMode()
      ? demo({ registered: documents.length, queued: documents.length, duplicates: [], document_ids: documents.map((_, i) => `d_new_${i}`) })
      : post<{ registered: number; queued: number; duplicates: { filename: string; existing_document_id: string }[]; document_ids: string[] }>("/documents/register", { batch_id: _batch_id, documents }),
  listDocuments: (_query?: RequestOptions["query"]) =>
    isDemoMode() ? demo(mock.MOCK_DOCUMENTS) : get<DocumentItem[]>("/documents", _query),
  getDocument: (id: string) =>
    isDemoMode() ? demo(mock.MOCK_DOCUMENTS.find((d) => d.id === id) ?? mock.MOCK_DOCUMENTS[0]) : get<DocumentItem>(`/documents/${id}`),
  getPages: (id: string) =>
    isDemoMode() ? demo(mock.MOCK_PAGES) : get<DocumentPage[]>(`/documents/${id}/pages`),
  reprocess: (_id: string) =>
    isDemoMode() ? demo({ status: "queued" }) : post<{ status: string }>(`/documents/${_id}/reprocess`),
  streamUrl: (batchId: string) => `${BASE}${PREFIX}/batches/${batchId}/stream`,
};

/* ── Records ─────────────────────────────────────────────────────── */
export const recordsApi = {
  search: (_query?: RequestOptions["query"]) =>
    isDemoMode() ? demo(mock.MOCK_RECORDS) : get<RecordSummary[]>("/records", _query),
  get: (id: string) =>
    isDemoMode() ? demo(id === "r1" ? mock.MOCK_RECORD_DETAIL : ({ ...mock.MOCK_RECORD_DETAIL, id }) as RecordDetail) : get<RecordDetail>(`/records/${id}`),
  update: (id: string, fields: { field_name: string; value?: string | null; flag?: string; note?: string }[]) =>
    isDemoMode() ? demo(mock.MOCK_RECORD_DETAIL) : patch<RecordDetail>(`/records/${id}`, { fields }),
  history: (_id: string) =>
    isDemoMode() ? demo(mock.MOCK_AUDIT) : get<AuditEntry[]>(`/records/${_id}/history`),
  validation: (_id: string) =>
    isDemoMode()
      ? demo({ record_id: _id, summary: { PASSED: 14, WARNING: 1 }, passed: 14, results: [] })
      : get<{ record_id: string; summary: Record<string, number>; passed: number; results: unknown[] }>(`/records/${_id}/validation`),
  fieldSchema: () =>
    isDemoMode()
      ? demo({ groups: [{ key: "identity", label: "Identity", fields: [{ name: "survey_number", label: "Survey Number", mandatory: true }, { name: "owner_name", label: "Owner Name", mandatory: true }] }], mandatory: ["survey_number", "owner_name"] })
      : get<{ groups: { key: string; label: string; fields: { name: string; label: string; mandatory: boolean }[] }[]; mandatory: string[] }>("/records/meta/field-schema"),
  stats: () =>
    isDemoMode() ? demo({ by_status: { VERIFIED: 381, OPEN: 34, ESCALATED: 3, FAILED: 10 } }) : get<{ by_status: Record<string, number> }>("/records/meta/stats"),
};

/* ── Review ──────────────────────────────────────────────────────── */
export const reviewApi = {
  queue: (_query?: RequestOptions["query"]) =>
    isDemoMode() ? demo(mock.MOCK_QUEUE) : get<QueueItem[]>("/review/queue", _query),
  stats: () =>
    isDemoMode() ? demo(mock.MOCK_QUEUE_STATS) : get<QueueStats>("/review/queue/stats"),
  next: (_queue_type?: string) =>
    isDemoMode() ? demo(mock.MOCK_QUEUE[0] ?? null) : get<QueueItem | null>("/review/queue/next", { queue_type: _queue_type }),
  claim: (_recordId: string) =>
    isDemoMode() ? demo({ locked_until: new Date(Date.now() + 30 * 60000).toISOString() }) : post<{ locked_until: string }>(`/review/${_recordId}/claim`),
  heartbeat: (_recordId: string) =>
    isDemoMode() ? demo({ locked_until: new Date(Date.now() + 30 * 60000).toISOString() }) : post<{ locked_until: string }>(`/review/${_recordId}/heartbeat`),
  release: (_recordId: string) =>
    isDemoMode() ? demo(undefined as void) : post<void>(`/review/${_recordId}/release`),
  approve: (_recordId: string, _payload: { comment?: string; duration_ms?: number; override_blocking?: boolean }) =>
    isDemoMode()
      ? demo({ status: "VERIFIED", verified_at: new Date().toISOString(), corrections_applied: 0, message: "Demo: approved." })
      : post<{ status: string; verified_at: string; corrections_applied: number; message?: string }>(`/review/${_recordId}/approve`, _payload),
  reject: (_recordId: string, _payload: { reason_code: string; reason: string; duration_ms?: number }) =>
    isDemoMode() ? demo({ status: "REJECTED" }) : post<{ status: string }>(`/review/${_recordId}/reject`, _payload),
  escalate: (_recordId: string, _payload: { reason: string }) =>
    isDemoMode() ? demo({ status: "ESCALATED", priority: 1 }) : post<{ status: string; priority: number }>(`/review/${_recordId}/escalate`, _payload),
  bulkApprove: (_payload: { batch_id?: string; min_confidence?: number; limit?: number }) =>
    isDemoMode() ? demo({ approved: 12, threshold: 0.95 }) : post<{ approved: number; threshold: number }>("/review/bulk-approve", _payload),
};

/* ── Insights ────────────────────────────────────────────────────── */
export const insightsApi = {
  overview: (_days = 30) =>
    isDemoMode() ? demo(mock.MOCK_OVERVIEW) : get<Overview>("/analytics/overview", { days: _days }),
  progress: (level: string, parent_id?: string) =>
    isDemoMode()
      ? demo({ level, items: mock.MOCK_PROGRESS })
      : get<{ level: string; items: ProgressItem[] }>("/analytics/progress", { level, parent_id }),
  accuracy: (_days = 90) =>
    isDemoMode() ? demo(mock.MOCK_ACCURACY) : get<typeof mock.MOCK_ACCURACY>("/analytics/accuracy", { days: _days }),
  operations: (_days = 7) =>
    isDemoMode() ? demo(mock.MOCK_OPERATIONS) : get<typeof mock.MOCK_OPERATIONS>("/analytics/operations", { days: _days }),
  verification: (_days = 30) =>
    isDemoMode()
      ? demo({ verifiers: [
          { user_id: "tehsildar.rahata",  records_completed: 87,  avg_handling_seconds: 248 },
          { user_id: "talathi.shirdi",    records_completed: 63,  avg_handling_seconds: 312 },
          { user_id: "collector.nashik",  records_completed: 41,  avg_handling_seconds: 195 },
          { user_id: "operator1",         records_completed: 28,  avg_handling_seconds: 420 },
          { user_id: "gis.nashik",        records_completed: 15,  avg_handling_seconds: 380 },
        ], sla_breaches: 3, queue_aging: { "0-24h": 28, "24-72h": 7, "72h+": 3 }, field_edits: 213 })
      : get<{ verifiers: { user_id: string | null; records_completed: number; avg_handling_seconds: number | null }[]; sla_breaches: number; queue_aging: Record<string, number>; field_edits: number }>("/analytics/verification", { days: _days }),
  errors: (_days = 30) =>
    isDemoMode()
      ? demo({ top_validation_failures: [{ rule: "AREA_RANGE_CHECK", severity: "ERROR", count: 9 }, { rule: "DUPLICATE_SURVEY", severity: "ERROR", count: 7 }], documents_needing_rescan: 4 })
      : get<{ top_validation_failures: { rule: string; severity: string; count: number }[]; documents_needing_rescan: number }>("/analytics/errors", { days: _days }),
};

/* ── Mapping ─────────────────────────────────────────────────────── */
export const mappingApi = {
  parcels: (_query?: RequestOptions["query"]) =>
    isDemoMode() ? demo(mock.MOCK_PARCELS) : get<Parcel[]>("/gis/parcels", _query),
  parcel: (id: string) =>
    isDemoMode() ? demo(mock.MOCK_PARCELS.find((p) => p.id === id) ?? mock.MOCK_PARCELS[0]) : get<Parcel>(`/gis/parcels/${id}`),
  tileUrl: () => `${BASE}${PREFIX}/gis/tiles/{z}/{x}/{y}.mvt`,
  villageSummary: (villageId: string) =>
    isDemoMode()
      ? demo({ parcels: 48, parcels_linked: 41, parcels_orphaned: 7, records: 48, records_orphaned: 3, link_coverage_pct: 85 })
      : get<{
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
    isDemoMode() ? demo(mock.MOCK_RULES) : get<typeof mock.MOCK_RULES>("/rules", _query),
  testRule: (_payload: unknown) =>
    isDemoMode() ? demo({ valid: true, status: "pass", message: "Demo: rule passed." }) : post<{ valid: boolean; status?: string; message?: string; error?: string }>("/rules/test", _payload),
  revalidate: (_recordId: string) =>
    isDemoMode() ? demo({ summary: { PASSED: 14, WARNING: 1 } }) : post<{ summary: Record<string, number> }>(`/records/${_recordId}/revalidate`),
  duplicates: () =>
    isDemoMode() ? demo(mock.MOCK_DUPLICATES) : get<{ id: string; cluster_key: string; match_type: string; score: number; record_ids: string[] }[]>("/duplicates"),
  resolveDuplicate: (_clusterId: string, _payload: unknown) =>
    isDemoMode() ? demo({ status: "RESOLVED" }) : post<{ status: string }>(`/duplicates/${_clusterId}/resolve`, _payload),
};

/* ── Vault ───────────────────────────────────────────────────────── */
export const vaultApi = {
  audit: (_query?: RequestOptions["query"]) =>
    isDemoMode() ? demo(mock.MOCK_AUDIT) : get<AuditEntry[]>("/audit", _query),
  verifyChain: () =>
    isDemoMode()
      ? demo(mock.MOCK_CHAIN_VERIFICATION)
      : get<ChainVerification>("/audit/verify-chain"),
  auditSummary: (_days = 30) =>
    isDemoMode()
      ? demo({ total_entries: 4, head_chain_hash: "jkl012", failed_logins: 0, by_action: [{ action: "RECORD_VERIFIED", count: 1 }, { action: "FIELD_CORRECTION", count: 1 }], daily: [] })
      : get<{ total_entries: number; head_chain_hash: string | null; failed_logins: number; by_action: { action: string; count: number }[]; daily: { date: string; count: number }[] }>("/audit/summary", { days: _days }),
  stats: () =>
    isDemoMode()
      ? demo({ documents_stored: 529, pages_stored: 2116, storage_gb: 4.7, duplicates_prevented: 8 })
      : get<{ documents_stored: number; pages_stored: number; storage_gb: number; duplicates_prevented: number }>("/vault/stats"),
};

/* ── Integrations ────────────────────────────────────────────────── */
export const integrationsApi = {
  list: () =>
    isDemoMode() ? demo(mock.MOCK_INTEGRATIONS) : get<typeof mock.MOCK_INTEGRATIONS>("/integrations"),
  health: (key: string) =>
    isDemoMode()
      ? demo({ healthy: key !== "bhulekh_up", latency_ms: key === "bhulekh_up" ? null : 142, message: key === "bhulekh_up" ? "Service degraded." : "OK" })
      : post<{ healthy: boolean; latency_ms: number | null; message: string }>(`/integrations/${key}/health`),
  sync: (_key: string, _query?: RequestOptions["query"]) =>
    isDemoMode() ? demo({ queued: 5 }) : post<{ queued: number }>(`/integrations/${_key}/sync`, undefined, _query),
  syncJobs: (_query?: RequestOptions["query"]) =>
    isDemoMode() ? demo([
      { id: "sj1", integration: "dilrmp",      record_id: "r1", status: "COMPLETED", external_id: "DLR-2024-001234", attempts: 1, error: null,                           created_at: new Date(Date.now() - 3600_000).toISOString() },
      { id: "sj2", integration: "mahabhulekh", record_id: "r3", status: "COMPLETED", external_id: "MBL-78-001",      attempts: 1, error: null,                           created_at: new Date(Date.now() - 7200_000).toISOString() },
      { id: "sj3", integration: "bhulekh_up",  record_id: "r2", status: "FAILED",    external_id: null,              attempts: 3, error: "503 Service Unavailable",       created_at: new Date(Date.now() - 14400_000).toISOString() },
      { id: "sj4", integration: "dilrmp",      record_id: "r4", status: "RETRYING",  external_id: null,              attempts: 2, error: "timeout after 30s",             created_at: new Date(Date.now() - 1800_000).toISOString() },
    ]) : get<{ id: string; integration: string; record_id: string | null; status: string; external_id: string | null; attempts: number; error: string | null; created_at: string }[]>("/integrations/sync-jobs", _query),
  retry: (_jobId: string) =>
    isDemoMode() ? demo({ status: "queued" }) : post<{ status: string }>(`/integrations/sync-jobs/${_jobId}/retry`),
  toggle: (key: string, enabled: boolean) =>
    isDemoMode() ? demo({ key, is_enabled: enabled }) : post<{ key: string; is_enabled: boolean }>(`/integrations/${key}/toggle`, { enabled }),
  reset: (key: string) =>
    isDemoMode() ? demo({ key, circuit_open: false }) : post<{ key: string; circuit_open: boolean }>(`/integrations/${key}/reset`),
  create: (payload: { name: string; key: string; base_url?: string; kind: string }) =>
    isDemoMode() ? demo({ id: `demo-${Date.now()}`, ...payload, is_enabled: true, health_status: "UNKNOWN", circuit_open: false, success_count: 0, failure_count: 0 }) : post<unknown>("/integrations", payload),
};

/* ── Learning ────────────────────────────────────────────────────── */
export const learningApi = {
  models: (_query?: RequestOptions["query"]) =>
    isDemoMode() ? demo(mock.MOCK_MODELS) : get<typeof mock.MOCK_MODELS>("/models", _query),
  history: (_modelKey: string) =>
    isDemoMode()
      ? demo({ model_key: _modelKey, versions: 2, series: [], primary_metric: "mAP50", improvement_points: 2, active_version: "v2.1.0" })
      : get<{ model_key: string; versions: number; series: Record<string, unknown>[]; primary_metric: string; improvement_points: number | null; active_version: string | null }>(`/models/${_modelKey}/history`),
  promote: (_modelId: string, traffic_pct = 100) =>
    isDemoMode() ? demo({ status: "promoted", version: "v2.2.0" }) : post<{ status: string; version: string }>(`/models/${_modelId}/promote`, undefined, { traffic_pct }),
  correctionStats: (_days = 90) =>
    isDemoMode()
      ? demo({ total_corrections: 312, unused_for_training: 87, handwritten_share_pct: 61, by_field: mock.MOCK_ACCURACY.fields.map((f) => ({ field: f.field, count: f.corrected })), by_language: mock.MOCK_ACCURACY.by_language.map((l) => ({ language: l.language, count: l.corrections, avg_ai_confidence: 0.78 })), daily: [], ready_to_train: true, message: "87 new corrections ready." })
      : get<{ total_corrections: number; unused_for_training: number; handwritten_share_pct: number; by_field: { field: string; count: number }[]; by_language: { language: string; count: number; avg_ai_confidence: number | null }[]; daily: { date: string; count: number }[]; ready_to_train: boolean; message: string }>("/models/corrections/stats", { days: _days }),
  train: (_model_key: string) =>
    isDemoMode() ? demo({ run_id: "demo-run-001" }) : post<{ run_id: string }>("/models/training/trigger", undefined, { model_key: _model_key }),
};

/* ── Outbound Notifications (SMS / Email / Push) ─────────────────── */
export const notificationsApi = {
  /** List inbound notification items for the current user. */
  list: (_query?: RequestOptions["query"]) =>
    isDemoMode()
      ? demo([
          { id: "n-001", title: "Record approved",            body: "Land record for Ramesh Kumar (Survey 142/3) has been approved.", severity: "SUCCESS", read_at: null, created_at: new Date(Date.now() - 3 * 3600_000).toISOString() },
          { id: "n-002", title: "SLA breach warning",         body: "12 records are at risk of breaching their 24-hour SLA.", severity: "WARNING", read_at: null, created_at: new Date(Date.now() - 6 * 3600_000).toISOString() },
          { id: "n-003", title: "Batch processing complete",  body: "Batch UP/2025/K/0019 has finished. 512 documents ready for review.", severity: "INFO", read_at: null, created_at: new Date(Date.now() - 18 * 3600_000).toISOString() },
        ])
      : get<{ id: string; title: string; body: string; severity: string; read_at: string | null; created_at: string }[]>("/notifications", _query),

  /** Mark a notification as read. */
  markRead: (id: string) =>
    isDemoMode() ? demo({ id, read: true }) : post<{ id: string; read: boolean }>(`/notifications/${id}/read`),

  /** Mark all notifications as read. */
  markAllRead: () =>
    isDemoMode() ? demo({ count: 3 }) : post<{ count: number }>("/notifications/mark-all-read"),

  /** Dispatch an outbound SMS notification via SMS gateway (NIC/Bhashini). */
  sendSms: (payload: { mobile: string; message: string; template_id?: string }) =>
    isDemoMode()
      ? demo({ message_id: `sms-demo-${Date.now()}`, status: "QUEUED" })
      : post<{ message_id: string; status: string }>("/notifications/sms", payload),

  /** Dispatch an outbound email notification. */
  sendEmail: (payload: { to: string; subject: string; body_text: string; body_html?: string }) =>
    isDemoMode()
      ? demo({ message_id: `email-demo-${Date.now()}`, status: "QUEUED" })
      : post<{ message_id: string; status: string }>("/notifications/email", payload),

  /** Send a push notification to a registered device token. */
  sendPush: (payload: { user_id: string; title: string; body: string; data?: Record<string, string> }) =>
    isDemoMode()
      ? demo({ message_id: `push-demo-${Date.now()}`, status: "QUEUED" })
      : post<{ message_id: string; status: string }>("/notifications/push", payload),

  /** Get outbound dispatch log (for admin monitoring). */
  dispatchLog: (_query?: RequestOptions["query"]) =>
    isDemoMode()
      ? demo({ total: 1284, delivered: 1248, failed: 12, pending: 24, last_24h: 86 })
      : get<{ total: number; delivered: number; failed: number; pending: number; last_24h: number }>("/notifications/dispatch-log", _query),
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
