import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

import type { ConfidenceBand } from "./types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/* ── Confidence ──────────────────────────────────────────────────── */
export function confidenceBand(value: number): ConfidenceBand {
  if (value >= 0.95) return "high";
  if (value >= 0.85) return "good";
  if (value >= 0.7) return "medium";
  return "low";
}

/**
 * Colour is never the only signal. Each band carries an icon and a plain-English
 * label as well, so the ramp is readable with a colour-vision deficiency and
 * survives a black-and-white print of a record.
 */
export const CONFIDENCE_META: Record<
  ConfidenceBand,
  { label: string; icon: string; text: string; bg: string; rail: string; border: string }
> = {
  high: {
    label: "High confidence",
    icon: "✓",
    text: "text-conf-high",
    bg: "bg-conf-high/10",
    rail: "bg-conf-high",
    border: "border-conf-high/30",
  },
  good: {
    label: "Good confidence",
    icon: "✓",
    text: "text-conf-good",
    bg: "bg-conf-good/10",
    rail: "bg-conf-good",
    border: "border-conf-good/30",
  },
  medium: {
    label: "Needs a look",
    icon: "!",
    text: "text-conf-medium",
    bg: "bg-conf-medium/10",
    rail: "bg-conf-medium",
    border: "border-conf-medium/30",
  },
  low: {
    label: "Needs correction",
    icon: "✕",
    text: "text-conf-low",
    bg: "bg-conf-low/10",
    rail: "bg-conf-low",
    border: "border-conf-low/40",
  },
};

/* ── Formatting ──────────────────────────────────────────────────── */
export function formatNumber(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

/** Indian numbering: 12,34,567 becomes "12.3 L". Lakh and crore are what a
 *  collector's office actually uses; millions would read as foreign. */
export function formatCompact(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  if (value >= 1e7) return `${(value / 1e7).toFixed(value >= 1e8 ? 0 : 1)} Cr`;
  if (value >= 1e5) return `${(value / 1e5).toFixed(value >= 1e6 ? 0 : 1)} L`;
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)} K`;
  return formatNumber(value);
}

export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined) return "—";
  return `${value.toFixed(digits)}%`;
}

/** Areas are shown in the unit the office thinks in, not raw square metres. */
export function formatArea(sqm: number | null | undefined): string {
  if (sqm === null || sqm === undefined) return "—";
  if (sqm >= 10_000) return `${(sqm / 10_000).toFixed(4)} ha`;
  if (sqm >= 1_000) return `${(sqm / 4046.86).toFixed(3)} acre`;
  return `${formatNumber(sqm, 2)} m²`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function relativeTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)} d ago`;
  return formatDate(date);
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return "—";
  if (seconds < 60) return `${seconds.toFixed(0)}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  if (minutes < 60) return `${minutes}m ${rest}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/* ── Labels ──────────────────────────────────────────────────────── */
export const STATUS_META: Record<string, { label: string; className: string }> = {
  UPLOADED: { label: "Uploaded", className: "bg-surface-2 text-muted border border-line" },
  QUEUED: { label: "Queued", className: "bg-info-soft text-info" },
  PREPROCESSING: { label: "Cleaning", className: "bg-info-soft text-info" },
  EXTRACTING: { label: "Reading", className: "bg-info-soft text-info" },
  VALIDATING: { label: "Validating", className: "bg-info-soft text-info" },
  PENDING_REVIEW: { label: "Awaiting review", className: "bg-warn-soft text-warn" },
  IN_REVIEW: { label: "In review", className: "bg-accent-soft text-accent" },
  AUTO_APPROVED: { label: "Auto-approved", className: "bg-success-soft text-success" },
  VERIFIED: { label: "Verified", className: "bg-success-soft text-success" },
  PUBLISHED: { label: "Published", className: "bg-success-soft text-success" },
  REJECTED: { label: "Rejected", className: "bg-danger-soft text-danger" },
  DUPLICATE: { label: "Duplicate", className: "bg-danger-soft text-danger" },
  ON_HOLD: { label: "On hold", className: "bg-surface-2 text-muted border border-line" },
  FAILED: { label: "Failed", className: "bg-danger-soft text-danger" },
  RESCAN_NEEDED: { label: "Rescan needed", className: "bg-accent-soft text-accent" },
};

export const QUEUE_META: Record<string, { label: string; className: string; hint: string }> = {
  PRIORITY: {
    label: "Priority",
    className: "bg-danger-soft text-danger",
    hint: "Low confidence — check every field.",
  },
  EXCEPTION: {
    label: "Exception",
    className: "bg-accent-soft text-accent",
    hint: "Validation blocked this record.",
  },
  STANDARD: {
    label: "Standard",
    className: "bg-warn-soft text-warn",
    hint: "A few fields need confirming.",
  },
  DUPLICATE: {
    label: "Duplicate",
    className: "bg-danger-soft text-danger",
    hint: "Another record may describe the same parcel.",
  },
  QA_SAMPLE: {
    label: "QA sample",
    className: "bg-info-soft text-info",
    hint: "Auto-approved; sampled to keep the model honest.",
  },
  MAKER_CHECKER: {
    label: "Second approval",
    className: "bg-primary-soft text-primary",
    hint: "High-value parcel — needs a second officer.",
  },
};

export const SEVERITY_META: Record<string, { label: string; className: string; order: number }> = {
  BLOCKING: { label: "Blocking", className: "bg-danger-soft text-danger", order: 0 },
  ERROR: { label: "Error", className: "bg-danger-soft text-danger", order: 1 },
  WARNING: { label: "Warning", className: "bg-warn-soft text-warn", order: 2 },
  REVIEW: { label: "Check", className: "bg-accent-soft text-accent", order: 3 },
  INFO: { label: "Note", className: "bg-info-soft text-info", order: 4 },
};

export const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  SEVEN_TWELVE: "7/12 Extract (Satbara)",
  KHATAUNI: "Khatauni",
  JAMABANDI: "Jamabandi",
  PAHANI: "Pahani",
  ADANGAL: "Adangal",
  CHITTA: "Chitta",
  PATTA: "Patta",
  ROR: "Record of Rights",
  MUTATION_REGISTER: "Mutation Register",
  SALE_DEED: "Sale Deed",
  CADASTRAL_MAP: "Cadastral Map",
  VILLAGE_MAP: "Village Map",
  INDEX_II: "Index-II",
  ENCUMBRANCE_CERTIFICATE: "Encumbrance Certificate",
  UNKNOWN: "Unidentified",
};

export const LANGUAGE_LABELS: Record<string, string> = {
  eng: "English",
  hin: "हिन्दी",
  mar: "मराठी",
  ben: "বাংলা",
  tam: "தமிழ்",
  tel: "తెలుగు",
  kan: "ಕನ್ನಡ",
  mal: "മലയാളം",
  guj: "ગુજરાતી",
  pan: "ਪੰਜਾਬੀ",
  ori: "ଓଡ଼ିଆ",
  urd: "اردو",
};

export function documentTypeLabel(key: string | null | undefined): string {
  if (!key) return "—";
  return DOCUMENT_TYPE_LABELS[key] ?? key;
}

export function languageLabel(code: string | null | undefined): string {
  if (!code) return "—";
  return LANGUAGE_LABELS[code] ?? code;
}

export async function sha256(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function debounce<T extends (...args: never[]) => void>(fn: T, ms = 300) {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}
