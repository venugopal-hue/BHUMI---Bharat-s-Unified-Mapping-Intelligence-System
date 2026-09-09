"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Edit3,
  Loader2,
  RefreshCw,
  X,
} from "lucide-react";

import { ConfidenceBadge, ConfidenceRail } from "@/components/ui/Confidence";
import {
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  QueuePill,
  SeverityPill,
  StatusPill,
} from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { recordsApi, reviewApi } from "@/lib/api";
import {
  cn,
  documentTypeLabel,
  formatArea,
  formatDate,
  formatDateTime,
  languageLabel,
  SEVERITY_META,
} from "@/lib/utils";
import type { RecordField } from "@/lib/types";

type Mode = "review" | "readonly";

export default function ReviewConsolePage() {
  const { recordId } = useParams<{ recordId: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();

  const startRef = useRef(Date.now());
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  const [mode, setMode] = useState<Mode>("review");
  const [pendingEdits, setPendingEdits] = useState<Map<string, string | null>>(new Map());
  const [activeField, setActiveField] = useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectCode, setRejectCode] = useState("DATA_ERROR");
  const [escalateOpen, setEscalateOpen] = useState(false);
  const [escalateReason, setEscalateReason] = useState("");
  const [confirmApproveOpen, setConfirmApproveOpen] = useState(false);
  const [selectedPage, setSelectedPage] = useState(0);

  // Load the record.
  const recordQuery = useQuery({
    queryKey: ["records", recordId],
    queryFn: () => recordsApi.get(recordId),
  });
  const record = recordQuery.data;

  // Claim a lock on mount; heartbeat every 30s.
  const claimMutation = useMutation({
    mutationFn: () => reviewApi.claim(recordId),
    onSuccess: () => {
      heartbeatRef.current = setInterval(
        () => reviewApi.heartbeat(recordId).catch(() => undefined),
        30_000,
      );
    },
    onError: (err) => {
      toast.warning("Could not claim record", (err as Error).message);
      setMode("readonly");
    },
  });

  useEffect(() => {
    claimMutation.mutate();
    return () => {
      clearInterval(heartbeatRef.current);
      reviewApi.release(recordId).catch(() => undefined);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordId]);

  // Approve.
  const approveMutation = useMutation({
    mutationFn: async () => {
      // Save any pending corrections first.
      if (pendingEdits.size > 0) {
        await recordsApi.update(
          recordId,
          Array.from(pendingEdits.entries()).map(([field_name, value]) => ({
            field_name,
            value,
          })),
        );
      }
      return reviewApi.approve(recordId, {
        duration_ms: Date.now() - startRef.current,
      });
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["records", recordId] });
      queryClient.invalidateQueries({ queryKey: ["review"] });
      toast.success(
        result.status === "AUTO_APPROVED" ? "Auto-approved" : "Record verified",
        result.message,
      );
      router.push("/review/next");
    },
    onError: (err) => toast.error("Could not approve", (err as Error).message),
  });

  const escalateMutation = useMutation({
    mutationFn: () => reviewApi.escalate(recordId, { reason: escalateReason }),
    onSuccess: () => {
      setEscalateOpen(false);
      setEscalateReason("");
      queryClient.invalidateQueries({ queryKey: ["review"] });
      toast.warning("Escalated", escalateReason);
      router.push("/review/next");
    },
    onError: (err) => { setEscalateOpen(false); setEscalateReason(""); toast.error("Could not escalate", (err as Error).message); },
  });

  const rejectMutation = useMutation({
    mutationFn: () =>
      reviewApi.reject(recordId, {
        reason_code: rejectCode,
        reason: rejectReason,
        duration_ms: Date.now() - startRef.current,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["review"] });
      toast.info("Record rejected", rejectReason);
      router.push("/review/next");
    },
    onError: (err) => toast.error("Could not reject", (err as Error).message),
  });

  const editField = useCallback((name: string, value: string | null) => {
    setPendingEdits((prev) => new Map(prev).set(name, value));
  }, []);

  const undoEdit = useCallback((name: string) => {
    setPendingEdits((prev) => {
      const next = new Map(prev);
      next.delete(name);
      return next;
    });
  }, []);

  if (recordQuery.isLoading) return <LoadingState label="Loading record…" />;
  if (!record) return <ErrorState title="Record not found" message="This record may have been removed or you don't have access." />;

  const validation = record.validation ?? [];
  const blocking = validation.filter((r) => r.status === "FAIL" && r.severity === "BLOCKING");
  const warnings = validation.filter((r) => r.status === "FAIL" && r.severity !== "BLOCKING");
  const currentPage = record.pages[selectedPage];
  const canApprove = mode === "review";

  return (
    <>
      {/* Sticky action bar */}
      <div className="sticky top-[5.5rem] z-30 mb-4 flex items-center justify-between gap-3 rounded-card border border-line bg-surface px-4 py-2.5 shadow-card no-print">
        <div className="flex items-center gap-2">
          <Link href="/review" className="btn-ghost btn-sm">
            <ChevronLeft size={15} aria-hidden /> Queue
          </Link>
          <span className="text-muted/40">|</span>
          <span className="id-text text-sm font-semibold text-ink">
            {record.survey_number ?? "—"}
          </span>
          {record.queue_type_open && <QueuePill type={record.queue_type_open} />}
          <StatusPill status={record.verification_status} />
          {pendingEdits.size > 0 && (
            <span className="pill bg-warn-soft text-warn">
              {pendingEdits.size} unsaved edit{pendingEdits.size > 1 ? "s" : ""}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {blocking.length > 0 && (
            <span className="flex items-center gap-1 text-xs text-danger">
              <AlertTriangle size={13} aria-hidden /> {blocking.length} blocking failure
              {blocking.length > 1 ? "s" : ""}
            </span>
          )}
          <button
            type="button"
            className="btn-ghost btn-sm text-warn"
            onClick={() => setEscalateOpen(true)}
            disabled={!canApprove || escalateMutation.isPending}
            title="Escalate to senior reviewer"
          >
            <AlertTriangle size={14} aria-hidden /> Escalate
          </button>
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={() => setRejectOpen(true)}
            disabled={!canApprove || rejectMutation.isPending}
          >
            <X size={14} aria-hidden /> Reject
          </button>
          <button
            type="button"
            className="btn-success btn-sm"
            onClick={() => blocking.length > 0 ? setConfirmApproveOpen(true) : approveMutation.mutate()}
            disabled={!canApprove || approveMutation.isPending}
          >
            {approveMutation.isPending ? (
              <Loader2 size={14} className="animate-spin" aria-hidden />
            ) : (
              <Check size={14} aria-hidden />
            )}{" "}
            Approve
          </button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
        {/* Document viewer */}
        <div className="space-y-3">
          {currentPage?.url ? (
            <div className="card overflow-hidden">
              {record.pages.length > 1 && (
                <div className="flex items-center justify-between border-b border-line px-3 py-2">
                  <button
                    type="button"
                    onClick={() => setSelectedPage((p) => Math.max(p - 1, 0))}
                    disabled={selectedPage === 0}
                    className="btn-ghost btn-sm"
                    aria-label="Previous page"
                  >
                    <ChevronLeft size={15} />
                  </button>
                  <span className="text-xs text-muted">
                    Page {selectedPage + 1} of {record.pages.length}
                    {currentPage.detected_script && (
                      <span className="ml-2">· {currentPage.detected_script}</span>
                    )}
                    {currentPage.has_handwriting && (
                      <span className="ml-2 text-warn">· Handwritten</span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedPage((p) => Math.min(p + 1, record.pages.length - 1))
                    }
                    disabled={selectedPage === record.pages.length - 1}
                    className="btn-ghost btn-sm"
                    aria-label="Next page"
                  >
                    <ChevronRight size={15} />
                  </button>
                </div>
              )}
              <img
                src={currentPage.url}
                alt={`Page ${selectedPage + 1} of ${record.original_filename ?? "document"}`}
                className="w-full object-contain"
                loading="lazy"
              />
            </div>
          ) : (
            <EmptyState title="No preview" description="Pages have not been stored yet." />
          )}

          {/* Validation results */}
          {validation.length > 0 && (
            <Card title="Validation" subtitle={`${blocking.length} blocking · ${warnings.length} warnings`}>
              <div className="space-y-1.5">
                {[...blocking, ...warnings].map((result, index) => (
                  <div
                    key={index}
                    className={cn(
                      "flex items-start gap-2.5 rounded-md px-3 py-2 text-sm",
                      result.severity === "BLOCKING" || result.severity === "ERROR"
                        ? "bg-danger-soft"
                        : result.severity === "WARNING"
                          ? "bg-warn-soft"
                          : "bg-surface-2",
                    )}
                  >
                    <SeverityPill severity={result.severity} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-ink">{result.message ?? result.rule}</p>
                      {result.fix_hint && (
                        <p className="mt-0.5 text-2xs text-muted">{result.fix_hint}</p>
                      )}
                      {result.affected_fields.length > 0 && (
                        <p className="mt-0.5 text-2xs text-muted">
                          Affects:{" "}
                          {result.affected_fields.map((f) => (
                            <button
                              key={f}
                              type="button"
                              onClick={() => setActiveField(f)}
                              className="font-mono text-primary underline"
                            >
                              {f}
                            </button>
                          )).reduce<React.ReactNode[]>((acc, el, i) => i === 0 ? [el] : [...acc, ", ", el], [])}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

        {/* Fields panel */}
        <div className="space-y-3">
          <div className="card divide-y divide-line overflow-hidden">
            <div className="px-4 py-3">
              <h2 className="text-sm font-semibold text-ink">Extracted fields</h2>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-2xs text-muted">
                <span>{documentTypeLabel(record.document_type)}</span>
                {record.source_language && <span>{languageLabel(record.source_language)}</span>}
                {record.record_year && <span>{record.record_year}</span>}
                <span>
                  Overall:{" "}
                  <ConfidenceBadge value={record.confidence_overall} size="sm" />
                </span>
              </div>
            </div>

            {record.field_groups.map((group) => {
              const groupFields = record.fields.filter((f) =>
                group.fields.includes(f.name),
              );
              if (!groupFields.length) return null;
              return (
                <div key={group.key}>
                  <p className="bg-surface-2 px-4 py-1.5 text-2xs font-semibold uppercase tracking-wider text-muted">
                    {group.label}
                  </p>
                  <div className="divide-y divide-line">
                    {groupFields.map((field) => (
                      <FieldRow
                        key={field.name}
                        field={field}
                        pendingValue={pendingEdits.get(field.name)}
                        hasPendingEdit={pendingEdits.has(field.name)}
                        isActive={activeField === field.name}
                        readOnly={!canApprove}
                        onEdit={editField}
                        onUndo={undoEdit}
                        onClick={() =>
                          setActiveField((prev) =>
                            prev === field.name ? null : field.name,
                          )
                        }
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {record.co_owners.length > 0 && (
            <Card title="Co-owners" subtitle={`${record.co_owners.length} listed`}>
              <div className="space-y-2">
                {record.co_owners.map((co, i) => (
                  <div key={i} className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-ink">{co.name}</p>
                      {co.name_roman && (
                        <p className="text-2xs text-muted">{co.name_roman}</p>
                      )}
                      {co.relation && (
                        <p className="text-2xs text-muted">{co.relation}</p>
                      )}
                    </div>
                    <div className="text-right">
                      {co.share_text && (
                        <p className="id-text text-sm font-semibold text-ink">
                          {co.share_text}
                        </p>
                      )}
                      <ConfidenceBadge value={co.confidence} size="sm" />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <div className="text-2xs text-muted space-y-1 px-1">
            <p>Extracted: {formatDateTime(record.extracted_at)}</p>
            <p>Model: {record.model_version ?? "—"}</p>
            {record.correction_count > 0 && (
              <p>{record.correction_count} correction{record.correction_count > 1 ? "s" : ""} on this record</p>
            )}
          </div>
        </div>
      </div>

      {/* Escalate dialog */}
      {escalateOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-ink/40 p-4">
          <div className="w-full max-w-md animate-fade-up rounded-card border border-line bg-surface p-5 shadow-overlay">
            <h2 className="text-base font-semibold text-ink">Escalate record</h2>
            <p className="mt-1 text-xs text-muted">
              Flag this record for a senior reviewer. Explain why it needs escalation.
            </p>
            <div className="mt-4">
              <label className="label" htmlFor="escalate-reason">Reason</label>
              <textarea
                id="escalate-reason"
                className="input min-h-[80px] resize-y"
                value={escalateReason}
                onChange={(e) => setEscalateReason(e.target.value)}
                placeholder="Describe why this record needs senior review…"
              />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => { setEscalateOpen(false); setEscalateReason(""); }}>Cancel</button>
              <button
                type="button"
                className="btn-secondary"
                disabled={!escalateReason.trim() || escalateMutation.isPending}
                onClick={() => { escalateMutation.mutate(); }}
              >
                {escalateMutation.isPending && <Loader2 size={14} className="animate-spin" />}{" "}
                Confirm escalation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject dialog */}
      {rejectOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-ink/40 p-4">
          <div className="w-full max-w-md animate-fade-up rounded-card border border-line bg-surface p-5 shadow-overlay">
            <h2 className="text-base font-semibold text-ink">Reject record</h2>
            <p className="mt-1 text-xs text-muted">
              The record will be sent back. State why so the operator knows what to fix.
            </p>

            <div className="mt-4 space-y-3">
              <div>
                <label className="label" htmlFor="reject-code">
                  Reason code
                </label>
                <select
                  id="reject-code"
                  className="input"
                  value={rejectCode}
                  onChange={(e) => setRejectCode(e.target.value)}
                >
                  <option value="DATA_ERROR">Data error — field values are wrong</option>
                  <option value="SCAN_QUALITY">Poor scan quality — needs rescan</option>
                  <option value="WRONG_DOCUMENT">Wrong document type</option>
                  <option value="DUPLICATE">Confirmed duplicate of another record</option>
                  <option value="INCOMPLETE">Incomplete — missing critical fields</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>
              <div>
                <label className="label" htmlFor="reject-reason">
                  Details
                </label>
                <textarea
                  id="reject-reason"
                  className="input min-h-[80px] resize-y"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Describe what is wrong so the operator knows what to fix…"
                />
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setRejectOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-danger"
                disabled={!rejectReason.trim() || rejectMutation.isPending}
                onClick={() => {
                  setRejectOpen(false);
                  rejectMutation.mutate();
                }}
              >
                {rejectMutation.isPending && (
                  <Loader2 size={14} className="animate-spin" />
                )}{" "}
                Confirm rejection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm approve despite blocking failures */}
      {confirmApproveOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-ink/40 p-4">
          <div className="w-full max-w-sm animate-fade-up rounded-card border border-danger/40 bg-surface p-5 shadow-overlay">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle size={18} className="text-danger shrink-0" />
              <h2 className="text-base font-semibold text-ink">Blocking failures present</h2>
            </div>
            <p className="text-xs text-muted mb-1">
              This record has <span className="font-semibold text-danger">{blocking.length} blocking validation failure{blocking.length > 1 ? "s" : ""}</span>:
            </p>
            <ul className="mt-2 mb-4 space-y-1 text-xs text-danger bg-danger/5 rounded-md p-3">
              {blocking.map((b, i) => (
                <li key={i} className="font-mono">{b.rule}{b.message ? ` — ${b.message}` : ""}</li>
              ))}
            </ul>
            <p className="text-xs text-muted mb-4">Approving anyway will be logged. Are you sure?</p>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary btn-sm" onClick={() => setConfirmApproveOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-danger btn-sm"
                onClick={() => { setConfirmApproveOpen(false); approveMutation.mutate(); }}
              >
                Approve anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function FieldRow({
  field,
  pendingValue,
  hasPendingEdit,
  isActive,
  readOnly,
  onEdit,
  onUndo,
  onClick,
}: {
  field: RecordField;
  pendingValue: string | null | undefined;
  hasPendingEdit: boolean;
  isActive: boolean;
  readOnly: boolean;
  onEdit: (name: string, value: string | null) => void;
  onUndo: (name: string) => void;
  onClick: () => void;
}) {
  const displayValue = hasPendingEdit ? pendingValue : field.value;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  return (
    <div
      className={cn(
        "flex items-start gap-2 px-3 py-2.5",
        isActive && "bg-primary-soft",
        field.is_mandatory && !displayValue && "bg-danger-soft",
      )}
    >
      <ConfidenceRail value={hasPendingEdit ? 1 : field.confidence} className="mt-1.5 h-8" />

      <div className="min-w-0 flex-1" onClick={onClick} style={{ cursor: "pointer" }}>
        <p className="flex items-center gap-1.5 text-2xs text-muted">
          {field.label}
          {field.is_mandatory && (
            <span className="pill bg-danger-soft text-danger text-[0.55rem]">required</span>
          )}
          {hasPendingEdit && (
            <span className="pill bg-warn-soft text-warn text-[0.55rem]">edited</span>
          )}
          {field.is_corrected && !hasPendingEdit && (
            <span className="pill bg-info-soft text-info text-[0.55rem]">corrected</span>
          )}
        </p>

        {editing ? (
          <div className="mt-1 flex gap-1.5">
            <input
              autoFocus
              className="input py-1 text-sm"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  onEdit(field.name, draft);
                  setEditing(false);
                }
                if (e.key === "Escape") setEditing(false);
              }}
            />
            <button
              type="button"
              className="btn-success btn-sm px-2"
              onClick={() => {
                onEdit(field.name, draft);
                setEditing(false);
              }}
            >
              <Check size={13} />
            </button>
            <button
              type="button"
              className="btn-secondary btn-sm px-2"
              onClick={() => setEditing(false)}
            >
              <X size={13} />
            </button>
          </div>
        ) : (
          <p
            className={cn(
              "id-text mt-0.5 text-sm",
              displayValue ? "text-ink" : "italic text-muted",
            )}
          >
            {displayValue ?? "not read"}
          </p>
        )}

        {field.note && (
          <p className="mt-0.5 text-2xs text-muted">{field.note}</p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <ConfidenceBadge value={field.confidence} size="sm" />
        {!readOnly && !editing && (
          <button
            type="button"
            onClick={() => {
              setDraft(displayValue ?? "");
              setEditing(true);
            }}
            className="rounded p-1 text-muted hover:bg-surface-2 hover:text-ink"
            aria-label={`Edit ${field.label}`}
          >
            <Edit3 size={13} />
          </button>
        )}
        {hasPendingEdit && (
          <button
            type="button"
            onClick={() => onUndo(field.name)}
            className="rounded p-1 text-muted hover:text-danger"
            aria-label={`Undo edit to ${field.label}`}
          >
            <RefreshCw size={13} />
          </button>
        )}
      </div>
    </div>
  );
}
