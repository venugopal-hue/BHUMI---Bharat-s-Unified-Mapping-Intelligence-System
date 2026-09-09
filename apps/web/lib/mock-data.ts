/**
 * Demo-mode mock data — matched to the actual TypeScript types in types.ts.
 * Returned instantly when the user logs in via the demo fallback.
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
} from "./types";

const ago = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();

/* ── Batches ─────────────────────────────────────────────────────── */
export const MOCK_BATCHES: Batch[] = [
  { id: "b1", name: "Nashik-Rahata Block-A", reference_no: "NR/2024/001", district_id: "d1", tehsil_id: "t1", village_id: null, record_year: 2024, document_type: "PATTA", source_office: "Rahata Tehsil Office", status: "COMPLETED", total_documents: 142, processed_documents: 142, failed_documents: 3, total_pages: 568, progress_pct: 100, created_at: daysAgo(14), completed_at: daysAgo(12) },
  { id: "b2", name: "Nashik-Sinnar Block-B", reference_no: "NS/2024/002", district_id: "d1", tehsil_id: "t2", village_id: null, record_year: 2024, document_type: "PATTA", source_office: "Sinnar Tehsil Office", status: "PROCESSING", total_documents: 89, processed_documents: 76, failed_documents: 0, total_pages: 312, progress_pct: 85, created_at: daysAgo(3), completed_at: null },
  { id: "b3", name: "Varanasi-Pindra Khatauni", reference_no: "VP/2024/001", district_id: "d2", tehsil_id: "t3", village_id: null, record_year: 2024, document_type: "KHATAUNI", source_office: "Pindra Tehsil Office", status: "PENDING_REVIEW", total_documents: 210, processed_documents: 210, failed_documents: 1, total_pages: 840, progress_pct: 100, created_at: daysAgo(21), completed_at: daysAgo(18) },
  { id: "b4", name: "Thanjavur-Patta 2024", reference_no: "TH/2024/001", district_id: "d3", tehsil_id: "t4", village_id: null, record_year: 2024, document_type: "PATTA", source_office: "Thanjavur Collectorate", status: "OPEN", total_documents: 55, processed_documents: 0, failed_documents: 0, total_pages: 0, progress_pct: 0, created_at: ago(2), completed_at: null },
  { id: "b5", name: "Pune-Haveli RTC Scan", reference_no: "PH/2024/003", district_id: "d4", tehsil_id: "t5", village_id: null, record_year: 2023, document_type: "RTC", source_office: "Haveli Taluka", status: "FAILED", total_documents: 33, processed_documents: 12, failed_documents: 6, total_pages: 130, progress_pct: 36, created_at: daysAgo(5), completed_at: null },
];

/* ── Documents ───────────────────────────────────────────────────── */
export const MOCK_DOCUMENTS: DocumentItem[] = [
  { id: "d1", batch_id: "b1", original_filename: "nashik_rahata_001.pdf", content_sha256: "abc", mime_type: "application/pdf", size_bytes: 4_200_000, page_count: 4, document_type: "PATTA", document_type_confidence: 0.99, detected_languages: ["mar"], quality_score: 0.94, quality_issues: [], status: "VERIFIED", current_stage: null, error_code: null, error_message: null, is_duplicate_of: null, created_at: daysAgo(14), processing_started_at: daysAgo(14), processing_finished_at: daysAgo(14) },
  { id: "d2", batch_id: "b1", original_filename: "nashik_rahata_002.pdf", content_sha256: "def", mime_type: "application/pdf", size_bytes: 3_800_000, page_count: 4, document_type: "PATTA", document_type_confidence: 0.97, detected_languages: ["mar"], quality_score: 0.81, quality_issues: [], status: "PENDING_REVIEW", current_stage: null, error_code: null, error_message: null, is_duplicate_of: null, created_at: daysAgo(13), processing_started_at: daysAgo(13), processing_finished_at: daysAgo(13) },
  { id: "d3", batch_id: "b2", original_filename: "sinnar_block_b_001.pdf", content_sha256: "ghi", mime_type: "application/pdf", size_bytes: 5_100_000, page_count: 4, document_type: "PATTA", document_type_confidence: null, detected_languages: ["mar"], quality_score: null, quality_issues: [], status: "EXTRACTING", current_stage: "ocr", error_code: null, error_message: null, is_duplicate_of: null, created_at: ago(6), processing_started_at: ago(2), processing_finished_at: null },
  { id: "d4", batch_id: "b3", original_filename: "varanasi_khatauni_001.pdf", content_sha256: "jkl", mime_type: "application/pdf", size_bytes: 2_900_000, page_count: 4, document_type: "KHATAUNI", document_type_confidence: 0.98, detected_languages: ["hin"], quality_score: 0.92, quality_issues: [], status: "VERIFIED", current_stage: null, error_code: null, error_message: null, is_duplicate_of: null, created_at: daysAgo(20), processing_started_at: daysAgo(20), processing_finished_at: daysAgo(20) },
  { id: "d5", batch_id: "b5", original_filename: "pune_haveli_bad_scan.pdf", content_sha256: "mno", mime_type: "application/pdf", size_bytes: 1_200_000, page_count: 2, document_type: "RTC", document_type_confidence: null, detected_languages: [], quality_score: 0.21, quality_issues: ["LOW_DPI"], status: "FAILED", current_stage: null, error_code: "LOW_IMAGE_QUALITY", error_message: "Image quality too low (DPI: 72). Minimum 200 DPI required.", is_duplicate_of: null, created_at: daysAgo(5), processing_started_at: daysAgo(5), processing_finished_at: daysAgo(5) },
  { id: "d6", batch_id: "b1", original_filename: "nashik_rahata_003.pdf", content_sha256: "pqr", mime_type: "application/pdf", size_bytes: 4_500_000, page_count: 4, document_type: "PATTA", document_type_confidence: 0.99, detected_languages: ["mar"], quality_score: 0.88, quality_issues: [], status: "VERIFIED", current_stage: null, error_code: null, error_message: null, is_duplicate_of: null, created_at: daysAgo(13), processing_started_at: daysAgo(13), processing_finished_at: daysAgo(13) },
];

/* ── Records ─────────────────────────────────────────────────────── */
export const MOCK_RECORDS: RecordSummary[] = [
  { id: "r1", document_id: "d1", survey_number: "123/A", khasra_number: null,  khata_number: "KH/2024/0081", mutation_number: "MUT/2024/4421", registration_number: null,          owner_name: "Ramesh Ganesh Pawar",    owner_name_roman: "Ramesh Ganesh Pawar",    village_id: "v1", tehsil_id: "t1", district_id: "d1", plot_area_sqm: 4047.0, land_classification: "Agricultural", document_type: "PATTA",    record_year: 2024, source_language: "mar", confidence_overall: 0.97, confidence_band: "high",   verification_status: "VERIFIED",       validation_status: "PASSED",   blocking_failures: 0, created_at: daysAgo(14) },
  { id: "r2", document_id: "d2", survey_number: "45/B",  khasra_number: null,  khata_number: "KH/2024/0042", mutation_number: null,             registration_number: null,          owner_name: "Sunita Maruti Jadhav",   owner_name_roman: "Sunita Maruti Jadhav",   village_id: "v2", tehsil_id: "t1", district_id: "d1", plot_area_sqm: 2023.5, land_classification: "Agricultural", document_type: "PATTA",    record_year: 2024, source_language: "mar", confidence_overall: 0.72, confidence_band: "medium", verification_status: "PENDING_REVIEW", validation_status: "WARNINGS", blocking_failures: 0, created_at: daysAgo(13) },
  { id: "r3", document_id: "d4", survey_number: "78/1",  khasra_number: "78",  khata_number: "KH/2024/0117", mutation_number: "MUT/2024/1103", registration_number: "REG/2024/0512", owner_name: "राम प्रसाद यादव",       owner_name_roman: "Ram Prasad Yadav",       village_id: "v3", tehsil_id: "t3", district_id: "d2", plot_area_sqm: 2529.0, land_classification: "Agricultural", document_type: "KHATAUNI", record_year: 2024, source_language: "hin", confidence_overall: 0.91, confidence_band: "good",   verification_status: "VERIFIED",       validation_status: "PASSED",   blocking_failures: 0, created_at: daysAgo(20) },
  { id: "r4", document_id: "d6", survey_number: "201/C", khasra_number: null,  khata_number: null,           mutation_number: null,             registration_number: null,          owner_name: "Vijay Kisan Bhosale",    owner_name_roman: "Vijay Kisan Bhosale",    village_id: "v1", tehsil_id: "t1", district_id: "d1", plot_area_sqm: 1214.1, land_classification: "Agricultural", document_type: "PATTA",    record_year: 2024, source_language: "mar", confidence_overall: 0.88, confidence_band: "good",   verification_status: "VERIFIED",       validation_status: "PASSED",   blocking_failures: 0, created_at: daysAgo(13) },
];

export const MOCK_RECORD_DETAIL: RecordDetail = {
  ...MOCK_RECORDS[0],
  fields: [
    { name: "survey_number",       label: "Survey Number",        group: "identity",      value: "123/A",           confidence: 0.99, confidence_band: "high",   source: "extraction", page_no: 1, bbox: null, is_mandatory: true,  is_corrected: false, flag: null, note: null },
    { name: "khasra_number",       label: "Khasra Number",        group: "identity",      value: null,              confidence: 0.0,  confidence_band: "low",    source: "extraction", page_no: 1, bbox: null, is_mandatory: false, is_corrected: false, flag: null, note: "Not applicable for this document type" },
    { name: "khata_number",        label: "Khata Number",         group: "identity",      value: "KH/2024/0081",    confidence: 0.95, confidence_band: "high",   source: "extraction", page_no: 1, bbox: null, is_mandatory: true,  is_corrected: false, flag: null, note: null },
    { name: "mutation_number",     label: "Mutation Number",      group: "mutation",      value: "MUT/2024/4421",   confidence: 0.88, confidence_band: "good",   source: "extraction", page_no: 3, bbox: null, is_mandatory: false, is_corrected: false, flag: null, note: null },
    { name: "registration_number", label: "Registration Number",  group: "registration",  value: null,              confidence: 0.0,  confidence_band: "low",    source: "extraction", page_no: null, bbox: null, is_mandatory: false, is_corrected: false, flag: null, note: "Not found in document" },
    { name: "owner_name",          label: "Owner Name",           group: "identity",      value: "रमेश गणेश पवार", confidence: 0.96, confidence_band: "high",   source: "extraction", page_no: 1, bbox: null, is_mandatory: true,  is_corrected: false, flag: null, note: null },
    { name: "plot_area_sqm",       label: "Area (sq m)",          group: "land",          value: "4047",            confidence: 0.97, confidence_band: "high",   source: "extraction", page_no: 2, bbox: null, is_mandatory: true,  is_corrected: false, flag: null, note: null },
    { name: "land_classification", label: "Land Type",            group: "land",          value: "Agricultural",    confidence: 0.91, confidence_band: "good",   source: "extraction", page_no: 2, bbox: null, is_mandatory: false, is_corrected: false, flag: null, note: null },
    { name: "village_lgd_code",    label: "Village LGD",          group: "location",      value: "556123",          confidence: 0.98, confidence_band: "high",   source: "extraction", page_no: 1, bbox: null, is_mandatory: true,  is_corrected: false, flag: null, note: null },
    { name: "tehsil_lgd_code",     label: "Tehsil LGD",           group: "location",      value: "55601",           confidence: 0.96, confidence_band: "high",   source: "extraction", page_no: 1, bbox: null, is_mandatory: false, is_corrected: false, flag: null, note: null },
    { name: "district_lgd_code",   label: "District LGD",         group: "location",      value: "556",             confidence: 0.99, confidence_band: "high",   source: "extraction", page_no: 1, bbox: null, is_mandatory: false, is_corrected: false, flag: null, note: null },
    { name: "record_year",         label: "Record Year",          group: "identity",      value: "2024",            confidence: 0.99, confidence_band: "high",   source: "extraction", page_no: 1, bbox: null, is_mandatory: false, is_corrected: false, flag: null, note: null },
  ],
  field_groups: [
    { key: "identity",     label: "Identity",     label_hi: "पहचान",      fields: ["survey_number", "khasra_number", "khata_number", "owner_name", "record_year"] },
    { key: "mutation",     label: "Mutation",     label_hi: "उत्परिवर्तन", fields: ["mutation_number"] },
    { key: "registration", label: "Registration", label_hi: "पंजीकरण",    fields: ["registration_number"] },
    { key: "land",         label: "Land",         label_hi: "भूमि",        fields: ["plot_area_sqm", "land_classification"] },
    { key: "location",     label: "Location",     label_hi: "स्थान",       fields: ["village_lgd_code", "tehsil_lgd_code", "district_lgd_code"] },
  ],
  co_owners: [
    { name: "Sushila Ramesh Pawar", name_roman: "Sushila Ramesh Pawar", relation: "Spouse", share: 0.5, share_text: "1/2", confidence: 0.89 },
  ],
  validation: [
    { rule: "AREA_RANGE_CHECK", status: "PASS", severity: "ERROR", message: null, fix_hint: null, affected_fields: ["plot_area_sqm"], observed: null },
    { rule: "OWNER_NAME_PRESENT", status: "PASS", severity: "BLOCKING", message: null, fix_hint: null, affected_fields: ["owner_name"], observed: null },
    { rule: "LGD_CODE_VALID", status: "WARN", severity: "WARNING", message: "LGD code not cross-checked in offline mode.", fix_hint: "Verify against LGD portal.", affected_fields: ["village_lgd_code"], observed: null },
  ],
  validation_summary: { PASS: 14, WARN: 1, FAIL: 0, BLOCKING: 0 },
  pages: [
    { id: "p1", page_no: 1, width: 2480, height: 3508, url: null, url_thumb: null, detected_script: "Devanagari", has_handwriting: false },
    { id: "p2", page_no: 2, width: 2480, height: 3508, url: null, url_thumb: null, detected_script: "Devanagari", has_handwriting: true },
  ],
  parcel_id: "par1",
  area_delta_pct: 0.3,
  model_version: "v2.1.0",
  correction_count: 0,
  extracted_at: daysAgo(14),
  verified_at: daysAgo(13),
  queue_type_open: null,
  original_filename: "nashik_rahata_001.pdf",
  document_type_confidence: 0.97,
};

/* ── Review Queue ────────────────────────────────────────────────── */
export const MOCK_QUEUE: QueueItem[] = [
  { id: "q1", record_id: "r2", document_id: "d2", batch_id: "b1", queue_type: "STANDARD", priority: 2, reason: "Confidence below threshold (0.72)", low_confidence_fields: ["owner_name", "mutation_number"], confidence_overall: 0.72, status: "OPEN", locked_by: null, locked_until: null, sla_due_at: daysAgo(-48), is_sla_breached: false, requires_second_approval: false, created_at: daysAgo(1), survey_number: "45/B", owner_name: "Sunita Maruti Jadhav", village_id: "v2", document_type: "PATTA", source_language: "mar", blocking_failures: 0 },
  { id: "q2", record_id: "r3", document_id: "d4", batch_id: "b3", queue_type: "PRIORITY", priority: 1, reason: "SLA approaching", low_confidence_fields: [], confidence_overall: 0.91, status: "OPEN", locked_by: null, locked_until: null, sla_due_at: daysAgo(-2), is_sla_breached: true, requires_second_approval: false, created_at: daysAgo(3), survey_number: "78/1", owner_name: "राम प्रसाद यादव", village_id: "v3", document_type: "KHATAUNI", source_language: "hin", blocking_failures: 0 },
];

export const MOCK_QUEUE_STATS: QueueStats = {
  by_type: {
    STANDARD: { count: 28, avg_confidence: 0.78 },
    PRIORITY: { count: 4,  avg_confidence: 0.82 },
    EXCEPTION: { count: 2, avg_confidence: 0.61 },
  },
  total_open: 34,
  sla_breaches: 2,
  avg_handling_seconds: 385,
};

/* ── Overview ────────────────────────────────────────────────────── */
export const MOCK_OVERVIEW: Overview = {
  documents_processed: 439,
  pages_processed: 1756,
  records_extracted: 439,
  records_verified: 381,
  records_pending: 34,
  documents_failed: 10,
  straight_through_rate_pct: 67,
  verification_rate_pct: 86.8,
  avg_confidence: 0.89,
  period_days: 30,
  records_this_period: 439,
  records_prior_period: 312,
  trend_pct: 40.7,
  generated_at: new Date().toISOString(),
};

/* ── Progress ────────────────────────────────────────────────────── */
export const MOCK_PROGRESS: ProgressItem[] = [
  { id: "s1", name: "Maharashtra",   name_local: "महाराष्ट्र",  lgd_code: "27", total: 350, verified: 302, pending: 28, progress_pct: 86, avg_confidence: 0.91 },
  { id: "s2", name: "Uttar Pradesh", name_local: "उत्तर प्रदेश", lgd_code: "09", total: 124, verified: 110, pending: 6,  progress_pct: 89, avg_confidence: 0.87 },
  { id: "s3", name: "Tamil Nadu",    name_local: "தமிழ்நாடு",    lgd_code: "33", total: 55,  verified: 27,  pending: 0,  progress_pct: 49, avg_confidence: 0.85 },
];

/* ── Insights — accuracy ─────────────────────────────────────────── */
export const MOCK_ACCURACY = {
  total_corrections: 312,
  fields: [
    { field: "owner_name",          extracted: 439, corrected: 18, correction_rate_pct: 4.1,  accuracy_pct: 95.9 },
    { field: "survey_number",       extracted: 439, corrected: 4,  correction_rate_pct: 0.9,  accuracy_pct: 99.1 },
    { field: "plot_area_sqm",       extracted: 439, corrected: 31, correction_rate_pct: 7.1,  accuracy_pct: 92.9 },
    { field: "land_classification", extracted: 439, corrected: 9,  correction_rate_pct: 2.1,  accuracy_pct: 97.9 },
    { field: "mutation_number",     extracted: 389, corrected: 47, correction_rate_pct: 12.1, accuracy_pct: 87.9 },
    { field: "village_lgd_code",    extracted: 439, corrected: 3,  correction_rate_pct: 0.7,  accuracy_pct: 99.3 },
  ],
  by_language: [
    { language: "mar", corrections: 118, handwritten: 79 },
    { language: "hin", corrections: 141, handwritten: 102 },
    { language: "tam", corrections: 28,  handwritten: 12 },
    { language: "kn",  corrections: 25,  handwritten: 8  },
  ],
  confidence_histogram: [
    { range: "0.95–1.00", count: 241 },
    { range: "0.85–0.95", count: 134 },
    { range: "0.70–0.85", count: 48  },
    { range: "0.00–0.70", count: 16  },
  ],
};

/* ── Insights — operations ───────────────────────────────────────── */
export const MOCK_OPERATIONS = {
  documents_by_status: { VERIFIED: 439, EXTRACTING: 76, FAILED: 10, QUEUED: 4 },
  daily_throughput: Array.from({ length: 7 }, (_, i) => ({
    date: daysAgo(6 - i).slice(0, 10),
    documents: 20 + Math.floor(Math.random() * 45),
    pages: 80 + Math.floor(Math.random() * 180),
  })),
  avg_processing_seconds: 47,
  p95_processing_seconds: 128,
  queue_depth: { ocr: 12, extraction: 8, validation: 4, sync: 19 },
  top_failures: [
    { error_code: "LOW_IMAGE_QUALITY", count: 6 },
    { error_code: "OCR_TIMEOUT", count: 3 },
    { error_code: "LAYOUT_UNKNOWN", count: 1 },
  ],
  avg_page_quality: 0.84,
};

/* ── Audit ───────────────────────────────────────────────────────── */
export const MOCK_AUDIT: AuditEntry[] = [
  { id: 4, at: ago(2),  actor: "Shri Ganesh Pawar",    actor_roles: ["talathi"],    actor_ip: "10.0.0.3", entity_type: "record", entity_id: "r1", action: "RECORD_VERIFIED",  payload: null,                                                                         chain_hash: "jkl012", prev_hash: "ghi789" },
  { id: 3, at: ago(3),  actor: "Shri Ganesh Pawar",    actor_roles: ["talathi"],    actor_ip: "10.0.0.3", entity_type: "record", entity_id: "r2", action: "FIELD_CORRECTION", payload: { field: "owner_name", old: "Sunita Jadhav", new: "Sunita Maruti Jadhav" },  chain_hash: "ghi789", prev_hash: "def456" },
  { id: 2, at: ago(5),  actor: "Kumari Anita Sharma",  actor_roles: ["operator"],   actor_ip: "10.0.0.4", entity_type: "batch",  entity_id: "b4", action: "BATCH_UPLOADED",   payload: { files: 55 },                                                                chain_hash: "def456", prev_hash: "abc123" },
  { id: 1, at: ago(6),  actor: "Shri Ramesh Deshmukh", actor_roles: ["district_collector"], actor_ip: "10.0.0.1", entity_type: "user", entity_id: "u1", action: "USER_LOGIN", payload: null,                                                               chain_hash: "abc123", prev_hash: null },
];

export const MOCK_CHAIN_VERIFICATION: ChainVerification = {
  intact: true, checked: 4, first_id: 1, last_id: 4,
  head_hash: "jkl012", message: "All 4 audit entries verified intact.", elapsed_ms: 12,
};

/* ── Document pages ──────────────────────────────────────────────── */
export const MOCK_PAGES: DocumentPage[] = [
  { id: "p1", page_no: 1, width: 2480, height: 3508, dpi: 300, quality_score: 0.92, quality_issues: [], skew_angle: 0.3, detected_script: "Devanagari", has_handwriting: false, is_map_page: false, url_raw: null, url_clean: null, url_thumb: null },
  { id: "p2", page_no: 2, width: 2480, height: 3508, dpi: 300, quality_score: 0.89, quality_issues: [], skew_angle: 0.1, detected_script: "Devanagari", has_handwriting: true,  is_map_page: false, url_raw: null, url_clean: null, url_thumb: null },
];

/* ── Validation rules ────────────────────────────────────────────── */
export const MOCK_RULES = [
  { id: "vr1", rule_key: "AREA_RANGE_CHECK",   name: "Area Range",          category: "FIELD",  severity: "ERROR",   expression: "0 < plot_area_sqm <= 200000",           message_en: "Plot area must be between 0 and 20 hectares.", fix_hint: "Verify the area unit (bigha vs. hectare).",       is_enabled: true  },
  { id: "vr2", rule_key: "SURVEY_FORMAT_MH",   name: "Survey Number (MH)",  category: "FIELD",  severity: "BLOCKING",expression: "re.match(r'^\\d+(/[A-Z])?$', survey_number)", message_en: "MH survey numbers must match \\d+(/[A-Z])?", fix_hint: "Remove spaces and check suffix.",                 is_enabled: true  },
  { id: "vr3", rule_key: "OWNER_NAME_PRESENT", name: "Owner Name",          category: "FIELD",  severity: "BLOCKING",expression: "owner_name and len(owner_name.strip()) > 1",  message_en: "Owner name cannot be empty.",              fix_hint: "Check page 1, box खातेदार/ਮਾਲਕ.",               is_enabled: true  },
  { id: "vr4", rule_key: "DUPLICATE_SURVEY",   name: "Duplicate Survey",    category: "CROSS",  severity: "ERROR",   expression: "unique(survey_number, village_lgd_code)",   message_en: "Survey number must be unique within a village.", fix_hint: "Check for sub-plot suffix.",                   is_enabled: true  },
  { id: "vr5", rule_key: "LGD_CODE_VALID",     name: "LGD Code",            category: "FIELD",  severity: "ERROR",   expression: "village_lgd_code in lgd_master",            message_en: "Village LGD code not found in master.",    fix_hint: "Use the LGD lookup tool.",                        is_enabled: true  },
  { id: "vr6", rule_key: "CO_OWNER_SHARE_SUM", name: "Co-owner shares",     category: "CROSS",  severity: "WARNING", expression: "sum(co_owner_shares) <= 1",                 message_en: "Co-owner shares exceed 100%.",             fix_hint: "Re-read fractional shares from the patta.",       is_enabled: true  },
];

/* ── Integrations ────────────────────────────────────────────────── */
export const MOCK_INTEGRATIONS = [
  { key: "dilrmp",      name: "DILRMP National Registry",  kind: "DILRMP", is_enabled: true,  health_status: "HEALTHY",   circuit_open: false, success_count: 3841, failure_count: 12, mapped_fields: 9 },
  { key: "mahabhulekh", name: "MahaBhulekh (Maharashtra)", kind: "LRMS",   is_enabled: true,  health_status: "HEALTHY",   circuit_open: false, success_count: 2210, failure_count: 4,  mapped_fields: 6 },
  { key: "bhulekh_up",  name: "Bhulekh (Uttar Pradesh)",   kind: "LRMS",   is_enabled: true,  health_status: "DEGRADED",  circuit_open: false, success_count: 891,  failure_count: 38, mapped_fields: 5 },
  { key: "digilocker",  name: "DigiLocker KYC",             kind: "KYC",    is_enabled: false, health_status: "UNKNOWN",   circuit_open: false, success_count: 0,    failure_count: 0,  mapped_fields: 0 },
];

/* ── Users ───────────────────────────────────────────────────────── */
export const MOCK_USERS = [
  { id: "u1", username: "collector.nashik",  full_name: "Shri Ramesh Deshmukh", designation: "District Collector, Nashik", email: "collector.nashik@bhumi.gov.in", roles: ["district_collector"], is_active: true, mfa_enabled: true,  last_login_at: ago(4),     created_at: daysAgo(90) },
  { id: "u2", username: "tehsildar.rahata",  full_name: "Smt. Priya Kulkarni",  designation: "Tehsildar, Rahata",          email: "tehsildar.rahata@bhumi.gov.in", roles: ["tehsildar"],          is_active: true, mfa_enabled: true,  last_login_at: ago(1),     created_at: daysAgo(90) },
  { id: "u3", username: "talathi.shirdi",    full_name: "Shri Ganesh Pawar",    designation: "Talathi, Shirdi",            email: "talathi.shirdi@bhumi.gov.in",   roles: ["talathi"],            is_active: true, mfa_enabled: false, last_login_at: ago(2),     created_at: daysAgo(90) },
  { id: "u4", username: "operator1",         full_name: "Kumari Anita Sharma",  designation: "Data Entry Operator",        email: "operator1@bhumi.gov.in",        roles: ["operator"],           is_active: true, mfa_enabled: false, last_login_at: daysAgo(2), created_at: daysAgo(60) },
  { id: "u5", username: "gis.nashik",        full_name: "Shri Vikram Jadhav",   designation: "GIS Officer, Nashik",        email: "gis.nashik@bhumi.gov.in",       roles: ["gis_officer"],        is_active: true, mfa_enabled: false, last_login_at: daysAgo(1), created_at: daysAgo(60) },
  { id: "u6", username: "admin",             full_name: "System Administrator", designation: "Platform Administrator",     email: "admin@bhumi.gov.in",            roles: ["admin"],              is_active: true, mfa_enabled: true,  last_login_at: ago(0.5),   created_at: daysAgo(180) },
];

/* ── Parcels ─────────────────────────────────────────────────────── */
export const MOCK_PARCELS: Parcel[] = [
  { id: "par1", village_id: "v1", survey_number: "123/A", khasra_number: null, area_sqm: 4047, land_classification: "Agricultural", source: "MANUAL", is_validated: true, topology_issues: [], geometry: null },
  { id: "par2", village_id: "v1", survey_number: "45/B",  khasra_number: null, area_sqm: 2024, land_classification: "Agricultural", source: "MANUAL", is_validated: false, topology_issues: [], geometry: null },
];

/* ── Model versions ──────────────────────────────────────────────── */
export const MOCK_MODELS = [
  { id: "m1", model_key: "layout_detector", version: "v2.1.0", status: "ACTIVE",   traffic_pct: 100, metrics: { mAP50: 0.91, precision: 0.89, recall: 0.87, field_f1: 0.88, cer_printed: 0.018, cer_handwritten: 0.062 } as Record<string, number>, training_examples: 12400, trained_at: daysAgo(30) },
  { id: "m2", model_key: "ocr_trocr",       version: "v1.3.2", status: "ACTIVE",   traffic_pct: 100, metrics: { cer: 0.018, wer: 0.042, field_f1: 0.91, cer_printed: 0.012, cer_handwritten: 0.048, mAP50: 0 }  as Record<string, number>, training_examples: 58000, trained_at: daysAgo(45) },
  { id: "m3", model_key: "layout_detector", version: "v2.2.0", status: "STAGING",  traffic_pct: 0,   metrics: { mAP50: 0.93, precision: 0.91, recall: 0.90, field_f1: 0.91, cer_printed: 0.015, cer_handwritten: 0.055 } as Record<string, number>, training_examples: 15800, trained_at: daysAgo(3) },
];

/* ── Duplicates ──────────────────────────────────────────────────── */
export const MOCK_DUPLICATES = [
  { id: "dc1", cluster_key: "s123a-shirdi-rahata", match_type: "EXACT_SURVEY", score: 1.0,  record_ids: ["r1", "r4"], status: "OPEN" },
  { id: "dc2", cluster_key: "sunita-j-rahata",     match_type: "FUZZY_OWNER",  score: 0.91, record_ids: ["r2", "r3"], status: "OPEN" },
];

/* ── Notifications ───────────────────────────────────────────────── */
export const MOCK_NOTIFICATIONS = [
  { id: "n1", kind: "SUCCESS", title: "Batch completed",    body: "Nashik-Rahata Block-A: 142 documents processed, 3 failed, 139 queued for review.", is_read: false, created_at: ago(12) },
  { id: "n2", kind: "WARNING", title: "SLA breach alert",   body: "2 review items in Nashik district have exceeded the 72-hour SLA.", is_read: false, created_at: ago(18) },
  { id: "n3", kind: "INFO",    title: "System update",      body: "Maharashtra, UP and Tamil Nadu jurisdiction data refreshed from state land registry.", is_read: true,  created_at: daysAgo(3) },
  { id: "n4", kind: "ERROR",   title: "Scan quality failure", body: "6 documents in Pune-Haveli batch rejected: image DPI below threshold (72 < 200 required).", is_read: true, created_at: daysAgo(5) },
];
