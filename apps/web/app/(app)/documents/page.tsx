"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Eye,
  FileText,
  Filter,
  RefreshCw,
  Search,
} from "lucide-react";

import { Card, EmptyState, LoadingState, PageHeader, StatusPill } from "@/components/ui/primitives";
import { ConfidenceBadge } from "@/components/ui/Confidence";
import { intakeApi } from "@/lib/api";
import { useTranslate } from "@/lib/preferences";
import { cn, formatDate, languageLabel } from "@/lib/utils";
import type { DocumentItem } from "@/lib/types";

const FILTER_STATUSES = ["ALL", "EXTRACTING", "PENDING_REVIEW", "VERIFIED", "PUBLISHED", "FAILED", "REJECTED"];

const STATUS_LABEL: Record<string, string> = {
  UPLOADED:       "Uploaded",
  QUEUED:         "Queued",
  PREPROCESSING:  "Preprocessing",
  EXTRACTING:     "Extracting",
  VALIDATING:     "Validating",
  PENDING_REVIEW: "Pending Review",
  VERIFIED:       "Verified",
  PUBLISHED:      "Published",
  FAILED:         "Failed",
  REJECTED:       "Rejected",
  RESCAN_NEEDED:  "Rescan Needed",
};

export default function DocumentsPage() {
  const t = useTranslate();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;

  const { data: documents, isLoading, isError } = useQuery({
    queryKey: ["documents", page],
    queryFn: () => intakeApi.listDocuments({ page_size: String(PAGE_SIZE), page: String(page) }),
    staleTime: 30_000,
  });

  const list = documents ?? [];

  const filtered = list.filter((d: DocumentItem) => {
    const q = search.toLowerCase();
    const matchSearch = !q || d.original_filename.toLowerCase().includes(q);
    const matchStatus = statusFilter === "ALL" || d.status === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <>
      <PageHeader
        title={t("documentsTitle")}
        description={t("documentsDesc")}
        breadcrumbs={[{ label: t("documents") }]}
      />

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            className="input pl-8 w-full"
            placeholder={t("docSearchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          <Filter size={13} className="text-muted mr-1" />
          {FILTER_STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={cn(
                "px-2.5 py-1 rounded-md text-xs font-medium border transition-colors",
                statusFilter === s
                  ? "bg-primary text-primary-fg border-primary"
                  : "bg-surface border-line text-muted hover:text-ink"
              )}
            >
              {s === "ALL" ? t("allStatuses") : STATUS_LABEL[s] ?? s}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <LoadingState />
      ) : isError ? (
        <div className="rounded-card border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
          Could not load documents. Check your connection or try refreshing.
        </div>
      ) : (
        <Card bodyClassName="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="table-head">{t("documents")}</th>
                  <th className="table-head">{t("colType")}</th>
                  <th className="table-head">{t("colLanguage")}</th>
                  <th className="table-head text-right">{t("colConfidence")}</th>
                  <th className="table-head">{t("colStatus")}</th>
                  <th className="table-head">{t("colDate")}</th>
                  <th className="table-head" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-muted">{t("noDocsMatch")}</td>
                  </tr>
                )}
                {filtered.map((doc: DocumentItem) => (
                  <tr key={doc.id} className="hover:bg-surface-2 transition-colors">
                    <td className="table-cell">
                      <div className="flex items-start gap-2">
                        <FileText size={15} className="text-muted mt-0.5 shrink-0" />
                        <div>
                          <div className="font-medium text-ink truncate max-w-[220px]">{doc.original_filename}</div>
                          <div className="text-2xs text-muted">
                            {doc.page_count} page{doc.page_count !== 1 ? "s" : ""}
                            {doc.batch_id && ` · batch ${doc.batch_id}`}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="table-cell text-xs text-muted">{doc.document_type}</td>
                    <td className="table-cell text-xs text-muted">
                      {doc.detected_languages.map((l) => languageLabel(l)).join(", ") || "—"}
                    </td>
                    <td className="table-cell text-right">
                      {doc.document_type_confidence != null
                        ? <ConfidenceBadge value={doc.document_type_confidence} size="sm" />
                        : <span className="text-xs text-muted">—</span>
                      }
                    </td>
                    <td className="table-cell">
                      <StatusPill status={doc.status} />
                    </td>
                    <td className="table-cell text-xs text-muted">{formatDate(doc.created_at)}</td>
                    <td className="table-cell">
                      <Link
                        href={`/documents/${doc.id}`}
                        className="text-muted hover:text-ink transition-colors"
                        title="View document"
                      >
                        <Eye size={15} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-line flex items-center justify-between text-xs text-muted">
            <span>{t("showing")} {filtered.length} {t("of")} {list.length} {t("documents")} (page {page})</span>
            <div className="flex gap-2">
              <button
                type="button"
                className="btn-secondary btn-sm text-xs"
                disabled={page === 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                ← Prev
              </button>
              <button
                type="button"
                className="btn-secondary btn-sm text-xs"
                disabled={list.length < PAGE_SIZE}
                onClick={() => setPage((p) => p + 1)}
              >
                Next →
              </button>
            </div>
          </div>
        </Card>
      )}
    </>
  );
}
