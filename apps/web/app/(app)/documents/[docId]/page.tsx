"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
  FileText,
  Calendar,
  Layers,
  ExternalLink,
} from "lucide-react";

import { Card, EmptyState, LoadingState, PageHeader, StatusPill } from "@/components/ui/primitives";
import { intakeApi, recordsApi } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import type { RecordSummary } from "@/lib/types";

export default function DocumentDetailPage() {
  const params = useParams();
  const docId = params.docId as string;

  const { data: document, isLoading: docLoading } = useQuery({
    queryKey: ["document", docId],
    queryFn: () => intakeApi.getDocument(docId),
    enabled: !!docId,
  });

  const { data: records, isLoading: recordsLoading } = useQuery({
    queryKey: ["records", { document_id: docId }],
    queryFn: () => recordsApi.search({ document_id: docId }),
    enabled: !!docId,
  });

  if (docLoading) return <LoadingState />;
  if (!document) {
    return (
      <EmptyState
        title="Document not found"
        description="This document does not exist or you do not have access."
      />
    );
  }

  const recordList = records ?? [];

  return (
    <>
      <PageHeader
        title={document.original_filename}
        description={`Document · ${document.document_type}`}
        breadcrumbs={[
          { label: "Documents", href: "/documents" },
          { label: document.original_filename },
        ]}
      />

      {/* Document metadata */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="card p-4">
          <div className="flex items-center gap-2 text-muted mb-1">
            <FileText size={14} />
            <span className="text-xs">File type</span>
          </div>
          <div className="font-semibold text-sm">{document.mime_type}</div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2 text-muted mb-1">
            <Layers size={14} />
            <span className="text-xs">Pages</span>
          </div>
          <div className="font-semibold text-sm">{document.page_count}</div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2 text-muted mb-1">
            <Calendar size={14} />
            <span className="text-xs">Created</span>
          </div>
          <div className="font-semibold text-sm">{formatDate(document.created_at)}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-muted mb-1">Status</div>
          <StatusPill status={document.status} />
        </div>
      </div>

      {document.batch_id && (
        <div className="mb-4 flex items-center gap-2 text-sm text-muted">
          <span>Batch:</span>
          <Link href={`/batches/${document.batch_id}`} className="text-primary hover:underline flex items-center gap-1">
            {document.batch_id}
            <ExternalLink size={12} />
          </Link>
        </div>
      )}

      {/* Records table */}
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">Extracted Records</h2>
        <span className="text-xs text-muted">{recordList.length} record{recordList.length !== 1 ? "s" : ""}</span>
      </div>

      {recordsLoading ? (
        <LoadingState />
      ) : recordList.length === 0 ? (
        <EmptyState
          title="No records extracted"
          description="No records have been extracted from this document yet."
        />
      ) : (
        <Card bodyClassName="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="table-head">Record ID</th>
                  <th className="table-head">Survey number</th>
                  <th className="table-head">Owner</th>
                  <th className="table-head">Status</th>
                  <th className="table-head">Confidence</th>
                  <th className="table-head" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {recordList.map((r: RecordSummary) => (
                  <tr key={r.id} className="hover:bg-surface-2 transition-colors">
                    <td className="table-cell font-mono text-xs text-muted">{r.id}</td>
                    <td className="table-cell">{r.survey_number ?? "—"}</td>
                    <td className="table-cell">{r.owner_name ?? "—"}</td>
                    <td className="table-cell"><StatusPill status={r.verification_status} /></td>
                    <td className="table-cell text-xs text-muted">
                      {r.confidence_overall != null ? `${(r.confidence_overall * 100).toFixed(0)}%` : "—"}
                    </td>
                    <td className="table-cell">
                      <Link href={`/records/${r.id}`} className="text-muted hover:text-ink transition-colors text-xs underline underline-offset-2">
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
