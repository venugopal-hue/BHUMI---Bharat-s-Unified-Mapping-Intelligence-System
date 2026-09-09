/** Shared types, mirroring the FastAPI schemas. */

export type ConfidenceBand = "high" | "good" | "medium" | "low";

export type VerificationStatus =
  | "AUTO_APPROVED"
  | "PENDING_REVIEW"
  | "IN_REVIEW"
  | "VERIFIED"
  | "REJECTED"
  | "DUPLICATE"
  | "ON_HOLD";

export type DocumentStatus =
  | "UPLOADED"
  | "QUEUED"
  | "PREPROCESSING"
  | "EXTRACTING"
  | "VALIDATING"
  | "PENDING_REVIEW"
  | "VERIFIED"
  | "PUBLISHED"
  | "FAILED"
  | "REJECTED"
  | "RESCAN_NEEDED";

export type QueueType =
  | "STANDARD"
  | "PRIORITY"
  | "EXCEPTION"
  | "DUPLICATE"
  | "QA_SAMPLE"
  | "MAKER_CHECKER";

export type Severity = "BLOCKING" | "ERROR" | "WARNING" | "REVIEW" | "INFO";

export interface Jurisdiction {
  level: "NATIONAL" | "STATE" | "DISTRICT" | "TEHSIL" | "VILLAGE";
  ref_id: string | null;
  label: string | null;
}

export interface User {
  id: string;
  username: string;
  full_name: string;
  full_name_local?: string | null;
  designation?: string | null;
  email?: string | null;
  preferred_locale: string;
  mfa_enabled: boolean;
  roles: string[];
  permissions: string[];
  jurisdictions: Jurisdiction[];
  last_login_at?: string | null;
}

export interface BBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RecordField {
  name: string;
  label: string;
  group: string | null;
  value: string | null;
  value_roman?: string | null;
  raw_text?: string | null;
  confidence: number;
  confidence_band: ConfidenceBand;
  confidence_breakdown?: Record<string, number> | null;
  source: string | null;
  engine?: string | null;
  page_no: number | null;
  bbox: BBox | null;
  alternatives?: string[] | null;
  is_mandatory: boolean;
  is_corrected: boolean;
  original_value?: string | null;
  flag?: string | null;
  note?: string | null;
}

export interface ValidationResult {
  rule: string;
  status: "PASS" | "FAIL" | "WARN" | "SKIPPED" | "ERROR";
  severity: Severity;
  message?: string | null;
  fix_hint?: string | null;
  affected_fields: string[];
  observed?: Record<string, unknown> | null;
}

export interface PageRef {
  id: string;
  page_no: number;
  width: number | null;
  height: number | null;
  url: string | null;
  url_thumb: string | null;
  detected_script: string | null;
  has_handwriting: boolean;
}

export interface CoOwner {
  name: string;
  name_roman?: string | null;
  relation?: string | null;
  share?: number | null;
  share_text?: string | null;
  confidence: number;
}

export interface RecordSummary {
  id: string;
  document_id: string;
  survey_number: string | null;
  khasra_number: string | null;
  khata_number: string | null;
  mutation_number: string | null;
  registration_number: string | null;
  owner_name: string | null;
  owner_name_roman: string | null;
  village_id: string | null;
  tehsil_id: string | null;
  district_id: string | null;
  plot_area_sqm: number | null;
  land_classification: string | null;
  document_type: string | null;
  record_year: number | null;
  source_language: string | null;
  confidence_overall: number;
  confidence_band: ConfidenceBand;
  verification_status: VerificationStatus;
  validation_status: string | null;
  blocking_failures: number;
  created_at: string;
}

export interface RecordDetail extends RecordSummary {
  fields: RecordField[];
  field_groups: { key: string; label: string; label_hi: string; fields: string[] }[];
  co_owners: CoOwner[];
  validation: ValidationResult[];
  validation_summary: Record<string, number>;
  pages: PageRef[];
  parcel_id: string | null;
  area_delta_pct: number | null;
  model_version: string | null;
  correction_count: number;
  extracted_at: string | null;
  verified_at: string | null;
  queue_type_open: QueueType | null;
  original_filename: string | null;
  document_type_confidence: number | null;
}

export interface QueueItem {
  id: string;
  record_id: string;
  document_id: string | null;
  batch_id: string | null;
  queue_type: QueueType;
  priority: number;
  reason: string | null;
  low_confidence_fields: string[];
  confidence_overall: number | null;
  status: string;
  locked_by: string | null;
  locked_until: string | null;
  sla_due_at: string | null;
  is_sla_breached: boolean;
  requires_second_approval: boolean;
  created_at: string;
  survey_number: string | null;
  owner_name: string | null;
  village_id: string | null;
  document_type: string | null;
  source_language: string | null;
  blocking_failures: number;
}

export interface QueueStats {
  by_type: Record<string, { count: number; avg_confidence: number }>;
  total_open: number;
  sla_breaches: number;
  avg_handling_seconds: number | null;
}

export interface Batch {
  id: string;
  name: string;
  reference_no: string | null;
  district_id: string | null;
  tehsil_id: string | null;
  village_id: string | null;
  record_year: number | null;
  document_type: string | null;
  source_office: string | null;
  status: string;
  total_documents: number;
  processed_documents: number;
  failed_documents: number;
  total_pages: number;
  progress_pct: number;
  created_at: string;
  completed_at: string | null;
}

export interface DocumentItem {
  id: string;
  batch_id: string | null;
  original_filename: string;
  content_sha256: string;
  mime_type: string;
  size_bytes: number;
  page_count: number;
  document_type: string;
  document_type_confidence: number | null;
  detected_languages: string[];
  quality_score: number | null;
  quality_issues: string[];
  status: DocumentStatus;
  current_stage: string | null;
  error_code: string | null;
  error_message: string | null;
  is_duplicate_of: string | null;
  created_at: string;
  processing_started_at: string | null;
  processing_finished_at: string | null;
}

export interface DocumentPage {
  id: string;
  page_no: number;
  width: number | null;
  height: number | null;
  dpi: number | null;
  quality_score: number | null;
  quality_issues: string[];
  skew_angle: number | null;
  detected_script: string | null;
  has_handwriting: boolean;
  is_map_page: boolean;
  url_raw: string | null;
  url_clean: string | null;
  url_thumb: string | null;
}

export interface Overview {
  documents_processed: number;
  pages_processed: number;
  records_extracted: number;
  records_verified: number;
  records_pending: number;
  documents_failed: number;
  straight_through_rate_pct: number;
  verification_rate_pct: number;
  avg_confidence: number;
  period_days: number;
  records_this_period: number;
  records_prior_period: number;
  trend_pct: number | null;
  generated_at: string;
}

export interface ProgressItem {
  id: string;
  name: string;
  name_local: string | null;
  lgd_code: string;
  total: number;
  verified: number;
  pending: number;
  progress_pct: number;
  avg_confidence: number | null;
}

export interface Parcel {
  id: string;
  village_id: string | null;
  survey_number: string | null;
  khasra_number: string | null;
  area_sqm: number | null;
  land_classification: string | null;
  source: string;
  is_validated: boolean;
  topology_issues: string[];
  geometry: { type: string; coordinates: unknown } | null;
}

export interface AuditEntry {
  id: number;
  at: string;
  actor: string | null;
  actor_roles: string[];
  actor_ip: string | null;
  entity_type: string;
  entity_id: string | null;
  action: string;
  payload: Record<string, unknown> | null;
  chain_hash: string;
  prev_hash: string | null;
}

export interface ChainVerification {
  intact: boolean;
  checked: number;
  first_id?: number;
  last_id?: number;
  head_hash?: string;
  message: string;
  broken_at_id?: number;
  reason?: string;
  elapsed_ms: number;
}
