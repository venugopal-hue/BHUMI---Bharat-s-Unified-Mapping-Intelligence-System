"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  FileText,
  MapPin,
  Users,
  AlertTriangle,
  Info,
  XCircle,
} from "lucide-react";

import { ConfidenceBadge } from "@/components/ui/Confidence";
import {
  Card,
  ErrorState,
  LoadingState,
  SeverityPill,
  StatusPill,
} from "@/components/ui/primitives";
import { recordsApi } from "@/lib/api";
import {
  cn,
  documentTypeLabel,
  formatArea,
  formatDate,
  formatDateTime,
  languageLabel,
  SEVERITY_META,
} from "@/lib/utils";

const CONFIDENCE_COLOR: Record<string, string> = {
  high:   "text-success",
  good:   "text-primary",
  medium: "text-warn",
  low:    "text-danger",
};

const VAL_STATUS_COLOR: Record<string, string> = {
  PASS:    "text-success",
  WARN:    "text-warn",
  FAIL:    "text-danger",
  ERROR:   "text-danger",
  SKIPPED: "text-muted",
};

export default function RecordDetailPage() {
  const { recordId } = useParams<{ recordId: string }>();

  const { data: record, isLoading, isError } = useQuery({
    queryKey: ["record", recordId],
    queryFn: () => recordsApi.get(recordId),
    staleTime: 30_000,
  });

  if (isLoading) return <LoadingState label="Loading record…" />;
  if (isError || !record) return <ErrorState title="Record not found" message="This record may have been removed or you don't have access." />;

  const fieldMap = Object.fromEntries(record.fields.map((f) => [f.name, f]));

  return (
    <div className="space-y-6">
      {/* Breadcrumb + header */}
      <div>
        <Link href="/records" className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-ink mb-3">
          <ArrowLeft size={13} /> Back to Records
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-ink">
              {record.survey_number ?? record.khasra_number ?? "Record"} &mdash; {documentTypeLabel(record.document_type)}
            </h1>
            <p className="text-sm text-muted mt-0.5">{record.original_filename ?? record.document_id}</p>
          </div>
          <div className="flex items-center gap-2">
            <ConfidenceBadge value={record.confidence_overall} />
            <StatusPill status={record.verification_status} />
            {record.verification_status === "PENDING_REVIEW" && (
              <Link href={`/review/${recordId}`} className="btn btn-primary btn-sm">
                Review
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Uncertain fields banner */}
      {(() => {
        const uncertain = record.fields.filter((f) => f.confidence != null && f.confidence < 0.70);
        const flagged = record.fields.filter((f) => f.flag);
        if (uncertain.length === 0 && flagged.length === 0) return null;
        return (
          <div className="rounded-card border border-warn/40 bg-warn/5 px-4 py-3 flex items-start gap-3">
            <AlertTriangle size={15} className="text-warn shrink-0 mt-0.5" />
            <div className="text-sm">
              <span className="font-semibold text-warn">
                {uncertain.length} low-confidence field{uncertain.length !== 1 ? "s" : ""}
                {flagged.length > 0 && `, ${flagged.length} flagged`}
              </span>
              <span className="text-muted ml-2">
                — {[...new Set([...uncertain.map((f) => f.label ?? f.name), ...flagged.map((f) => f.label ?? f.name)])].join(", ")}
              </span>
            </div>
          </div>
        );
      })()}

      {/* Meta strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Language",       value: languageLabel(record.source_language) },
          { label: "Record Year",    value: record.record_year ?? "—" },
          { label: "Area",           value: formatArea(record.plot_area_sqm) },
          { label: "Land Type",      value: record.land_classification ?? "—" },
        ].map((m) => (
          <div key={m.label} className="rounded-card border border-line bg-surface p-3">
            <p className="text-2xs text-muted font-medium uppercase tracking-wider">{m.label}</p>
            <p className="text-sm font-semibold text-ink mt-0.5">{m.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: field groups */}
        <div className="lg:col-span-2 space-y-4">
          {record.field_groups.map((group) => (
            <Card key={group.key} title={group.label} subtitle={group.label_hi}>
              <div className="divide-y divide-line">
                {group.fields.map((fname) => {
                  const f = fieldMap[fname];
                  if (!f) return null;
                  return (
                    <div key={fname} className="flex items-start justify-between gap-4 py-3 px-4">
                      <div className="flex-1 min-w-0">
                        <p className="text-2xs text-muted font-medium">{f.label}</p>
                        <p className={cn("text-sm font-semibold text-ink mt-0.5", f.flag && "text-warn")}>
                          {f.value ?? <span className="text-muted italic">—</span>}
                        </p>
                        {f.value_roman && f.value_roman !== f.value && (
                          <p className="text-2xs text-muted">{f.value_roman}</p>
                        )}
                        {f.is_corrected && f.original_value && (
                          <p className="text-2xs text-muted line-through">{f.original_value}</p>
                        )}
                        {f.note && <p className="text-2xs text-muted italic mt-0.5">{f.note}</p>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {f.is_corrected && (
                          <span className="pill bg-primary/10 text-primary border border-primary/30 text-2xs">Corrected</span>
                        )}
                        {f.flag && (
                          <span className="pill bg-warn/10 text-warn border border-warn/30 text-2xs">
                            {f.flag}
                          </span>
                        )}
                        <ConfidenceBadge value={f.confidence} size="sm" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          ))}

          {/* Co-owners */}
          {record.co_owners.length > 0 && (
            <Card title="Co-owners" subtitle={`${record.co_owners.length} co-owner${record.co_owners.length > 1 ? "s" : ""}`}>
              <div className="divide-y divide-line">
                {record.co_owners.map((co, i) => (
                  <div key={i} className="flex items-center justify-between gap-4 py-3 px-4">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-muted">
                        <Users size={13} />
                      </span>
                      <div>
                        <p className="text-sm font-medium text-ink">{co.name}</p>
                        {co.name_roman && co.name_roman !== co.name && (
                          <p className="text-2xs text-muted">{co.name_roman}</p>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      {co.relation && <p className="text-2xs text-muted">{co.relation}</p>}
                      {co.share_text && <p className="text-xs font-semibold text-ink">{co.share_text}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

        {/* Right: validation + metadata */}
        <div className="space-y-4">
          {/* Validation summary */}
          <Card title="Validation">
            <div className="px-4 pb-2 pt-1 flex flex-wrap gap-2 border-b border-line">
              {Object.entries(record.validation_summary).map(([k, v]) => (
                <div key={k} className="text-center">
                  <p className={cn("text-lg font-bold", VAL_STATUS_COLOR[k] ?? "text-ink")}>{v as number}</p>
                  <p className="text-2xs text-muted">{k}</p>
                </div>
              ))}
            </div>
            <div className="divide-y divide-line">
              {record.validation.map((vr, i) => (
                <div key={i} className="px-4 py-2.5">
                  <div className="flex items-start gap-2">
                    <span className={cn("mt-0.5 shrink-0", VAL_STATUS_COLOR[vr.status] ?? "text-muted")}>
                      {vr.status === "PASS"
                        ? <CheckCircle2 size={13} />
                        : vr.status === "WARN"
                        ? <AlertTriangle size={13} />
                        : vr.status === "FAIL" || vr.status === "ERROR"
                        ? <XCircle size={13} />
                        : <Info size={13} />
                      }
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-2xs font-mono text-ink">{vr.rule}</span>
                        <SeverityPill severity={vr.severity} />
                      </div>
                      {vr.message && <p className="text-2xs text-muted mt-0.5">{vr.message}</p>}
                      {vr.fix_hint && <p className="text-2xs text-primary mt-0.5">{vr.fix_hint}</p>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Record metadata */}
          <Card title="Metadata">
            <div className="divide-y divide-line">
              {[
                { label: "Model Version",        value: record.model_version ?? "—" },
                { label: "Doc Type Confidence", value: record.document_type_confidence != null ? `${(record.document_type_confidence * 100).toFixed(1)}%` : "—" },
                { label: "Corrections",          value: record.correction_count },
                { label: "Area Delta",           value: record.area_delta_pct != null ? `${record.area_delta_pct.toFixed(1)}%` : "—" },
                { label: "Extracted",       value: record.extracted_at ? formatDate(record.extracted_at) : "—" },
                { label: "Verified",        value: record.verified_at ? formatDate(record.verified_at) : "—" },
                { label: "Source File",     value: record.original_filename ?? "—" },
              ].map((m) => (
                <div key={m.label} className="flex items-center justify-between px-4 py-2.5 gap-2">
                  <span className="text-xs text-muted">{m.label}</span>
                  <span className="text-xs font-medium text-ink text-right truncate max-w-[150px]">{String(m.value)}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* Pages */}
          {record.pages.length > 0 && (
            <Card title="Pages" subtitle={`${record.pages.length} page${record.pages.length > 1 ? "s" : ""}`}>
              <div className="divide-y divide-line">
                {record.pages.map((pg) => (
                  <div key={pg.id} className="flex items-center justify-between px-4 py-2.5 text-xs">
                    <div>
                      <span className="font-medium text-ink">Page {pg.page_no}</span>
                      {pg.detected_script && <span className="text-muted ml-1.5">{pg.detected_script}</span>}
                    </div>
                    <div className="flex items-center gap-2 text-muted">
                      {pg.has_handwriting && (
                        <span className="pill bg-warn/10 text-warn border border-warn/30 text-2xs">Handwritten</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
