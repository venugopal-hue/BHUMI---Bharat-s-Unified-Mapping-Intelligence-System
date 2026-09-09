"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, CheckCircle2, Clock, AlertCircle, FileText, Layers } from "lucide-react";

import { Card, ErrorState, LoadingState, StatusPill } from "@/components/ui/primitives";
import { intakeApi } from "@/lib/api";
import { cn, formatDate } from "@/lib/utils";

function ProgressBar({ done, total, failed }: { done: number; total: number; failed: number }) {
  const pct = total > 0 ? (done / total) * 100 : 0;
  const failPct = total > 0 ? (failed / total) * 100 : 0;
  return (
    <div className="h-2 rounded-full bg-surface-2 overflow-hidden">
      <div className="h-full flex">
        <div className="h-full bg-success" style={{ width: `${Math.max(0, pct - failPct)}%` }} />
        <div className="h-full bg-danger" style={{ width: `${failPct}%` }} />
      </div>
    </div>
  );
}

const STATUS_ICON: Record<string, typeof Clock> = {
  OPEN: Clock,
  PROCESSING: Clock,
  PENDING_REVIEW: AlertCircle,
  COMPLETED: CheckCircle2,
  FAILED: AlertCircle,
};

const STATUS_COLOR: Record<string, string> = {
  OPEN: "text-primary",
  PROCESSING: "text-warn",
  PENDING_REVIEW: "text-purple-600",
  COMPLETED: "text-success",
  FAILED: "text-danger",
};

export default function BatchDetailPage() {
  const { batchId } = useParams<{ batchId: string }>();

  const { data: batch, isLoading, isError } = useQuery({
    queryKey: ["batch", batchId],
    queryFn: () => intakeApi.getBatch(batchId),
    staleTime: 10_000,
    // Poll while batch is actively processing
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "PROCESSING" || status === "OPEN" ? 10_000 : false;
    },
  });

  const { data: documents } = useQuery({
    queryKey: ["documents", "batch", batchId],
    queryFn: () => intakeApi.listDocuments({ batch_id: batchId }),
    staleTime: 10_000,
    enabled: !!batch,
    refetchInterval: batch?.status === "PROCESSING" ? 10_000 : false,
  });

  if (isLoading) return <LoadingState label="Loading batch…" />;
  if (isError || !batch) return <ErrorState title="Batch not found" message="This batch may have been removed or you don't have access." />;

  const StatusIcon = STATUS_ICON[batch.status] ?? Clock;
  const statusColor = STATUS_COLOR[batch.status] ?? "text-muted";

  return (
    <div className="space-y-6">
      <div>
        <Link href="/batches" className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-ink mb-3">
          <ArrowLeft size={13} /> Back to Batches
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-ink">{batch.name}</h1>
            <p className="text-sm text-muted mt-0.5">{batch.reference_no ?? batch.id}</p>
          </div>
          <span className={cn("flex items-center gap-1.5 text-sm font-semibold", statusColor)}>
            <StatusIcon size={15} /> {batch.status.replace(/_/g, " ")}
          </span>
        </div>
      </div>

      {/* Progress */}
      <Card title="Progress">
        <div className="px-4 pb-4 space-y-3">
          <div className="flex justify-between text-xs text-muted">
            <span>{batch.processed_documents} of {batch.total_documents} documents processed</span>
            <span>{batch.progress_pct != null ? `${batch.progress_pct}%` : `${batch.total_documents > 0 ? Math.round((batch.processed_documents / batch.total_documents) * 100) : 0}%`}</span>
          </div>
          <ProgressBar done={batch.processed_documents} total={batch.total_documents} failed={batch.failed_documents} />
          <div className="flex gap-4 text-xs">
            <span className="text-success">✓ {batch.processed_documents - batch.failed_documents} success</span>
            {batch.failed_documents > 0 && <span className="text-danger">✗ {batch.failed_documents} failed</span>}
            {batch.total_documents - batch.processed_documents > 0 && (
              <span className="text-muted">{batch.total_documents - batch.processed_documents} pending</span>
            )}
          </div>
        </div>
      </Card>

      {/* Details */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Batch Details">
          <div className="divide-y divide-line">
            {[
              { label: "Document Type",  value: batch.document_type ?? "—" },
              { label: "Record Year",    value: batch.record_year ?? "—" },
              { label: "Source Office",  value: batch.source_office ?? "—" },
              { label: "Total Pages",    value: batch.total_pages },
              { label: "Created",        value: formatDate(batch.created_at) },
              { label: "Completed",      value: batch.completed_at ? formatDate(batch.completed_at) : "—" },
            ].map((m) => (
              <div key={m.label} className="flex items-center justify-between px-4 py-2.5 gap-2">
                <span className="text-xs text-muted">{m.label}</span>
                <span className="text-xs font-medium text-ink">{String(m.value)}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Documents" subtitle={`${documents?.length ?? 0} documents`}>
          {!documents ? (
            <div className="px-4 py-6 text-center text-muted text-sm">Loading documents…</div>
          ) : documents.length === 0 ? (
            <div className="px-4 py-6 text-center text-muted text-sm">No documents in this batch yet.</div>
          ) : (
            <div className="divide-y divide-line max-h-80 overflow-y-auto">
              {documents.map((doc) => (
                <Link
                  key={doc.id}
                  href={`/documents/${doc.id}`}
                  className="flex items-center justify-between px-4 py-2.5 hover:bg-surface-2 transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <FileText size={14} className="shrink-0 text-muted" />
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-ink truncate">{doc.original_filename}</p>
                      <p className="text-2xs text-muted">{doc.page_count} pages · {doc.document_type}</p>
                    </div>
                  </div>
                  <StatusPill status={doc.status} />
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
