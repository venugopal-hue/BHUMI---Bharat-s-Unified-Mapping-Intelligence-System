"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  FileText,
  Plus,
  Search,
  ChevronRight,
} from "lucide-react";

import { Card, EmptyState, LoadingState, PageHeader } from "@/components/ui/primitives";
import { intakeApi } from "@/lib/api";
import { useTranslate } from "@/lib/preferences";
import { cn, formatDate } from "@/lib/utils";
import type { Batch } from "@/lib/types";

function BatchProgressBar({ value, total, failed }: { value: number; total: number; failed: number }) {
  const done = total > 0 ? (value / total) * 100 : 0;
  const fail = total > 0 ? (failed / total) * 100 : 0;
  return (
    <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden w-full">
      <div className="h-full flex">
        <div className="h-full bg-success transition-all" style={{ width: `${Math.max(0, done - fail)}%` }} />
        <div className="h-full bg-danger transition-all" style={{ width: `${fail}%` }} />
      </div>
    </div>
  );
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  OPEN:           { label: "Open",         color: "text-primary bg-primary/10",    icon: Clock },
  PROCESSING:     { label: "Processing",   color: "text-warn bg-warn/10",    icon: Clock },
  PENDING_REVIEW: { label: "Pending Review", color: "text-purple-600 bg-purple-50", icon: AlertCircle },
  COMPLETED:      { label: "Completed",    color: "text-success bg-success/10",    icon: CheckCircle2 },
  FAILED:         { label: "Failed",       color: "text-danger bg-danger/10",      icon: AlertCircle },
};

const ALL_STATUSES = ["ALL", "OPEN", "PROCESSING", "PENDING_REVIEW", "COMPLETED", "FAILED"];

export default function BatchesPage() {
  const t = useTranslate();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const { data: batches, isLoading } = useQuery({
    queryKey: ["batches"],
    queryFn: () => intakeApi.listBatches(),
    staleTime: 30_000,
  });

  const list = batches ?? [];

  const filtered = list.filter((b: Batch) => {
    const q = search.toLowerCase();
    const matchSearch = !q || b.name.toLowerCase().includes(q) || (b.reference_no ?? "").toLowerCase().includes(q);
    const matchStatus = statusFilter === "ALL" || b.status === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <>
      <PageHeader
        title={t("batchesTitle")}
        description={t("batchesDesc")}
        breadcrumbs={[{ label: t("batches") }]}
        actions={
          <Link href="/upload" className="btn btn-primary flex items-center gap-2 text-sm">
            <Plus size={15} /> {t("newBatch")}
          </Link>
        }
      />

      {/* Summary chips */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: "Total",       value: list.length,                                              color: "text-ink" },
          { label: "Processing",  value: list.filter((b: Batch) => b.status === "PROCESSING").length,  color: "text-warn" },
          { label: "Completed",   value: list.filter((b: Batch) => b.status === "COMPLETED").length,   color: "text-success" },
          { label: "Failed",      value: list.filter((b: Batch) => b.status === "FAILED").length,      color: "text-danger" },
        ].map((s) => (
          <div key={s.label} className="rounded-card border border-line bg-surface p-4">
            <div className={cn("text-2xl font-bold tabular-nums", s.color)}>{s.value}</div>
            <div className="text-xs text-muted mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            className="input pl-8 w-full"
            placeholder={t("batchSearchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-1 flex-wrap">
          {ALL_STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={cn(
                "px-3 py-1.5 rounded-md text-xs font-medium border transition-colors",
                statusFilter === s
                  ? "bg-primary text-primary-fg border-primary"
                  : "bg-surface border-line text-muted hover:text-ink"
              )}
            >
              {s === "ALL" ? t("allStatuses") : STATUS_CONFIG[s]?.label ?? s}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <LoadingState />
      ) : (
        <Card bodyClassName="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-surface-2">
                  <th className="table-head">{t("batchRef")}</th>
                  <th className="table-head">{t("batchLocation")}</th>
                  <th className="table-head">{t("colProgress")}</th>
                  <th className="table-head">{t("colStatus")}</th>
                  <th className="table-head">{t("batchUploaded")}</th>
                  <th className="table-head" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-muted">
                      {t("noBatchesMatch")}
                    </td>
                  </tr>
                )}
                {filtered.map((batch: Batch) => {
                  const sc = STATUS_CONFIG[batch.status] ?? { label: batch.status, color: "text-muted bg-surface-2", icon: Clock };
                  const Icon = sc.icon;
                  return (
                    <tr key={batch.id} className="hover:bg-surface-2 transition-colors">
                      <td className="table-cell">
                        <div className="font-medium text-ink">{batch.name}</div>
                        <div className="text-xs text-muted mt-0.5 flex items-center gap-1">
                          <FileText size={11} />
                          {batch.reference_no ?? batch.id} · {batch.document_type ?? "—"}
                        </div>
                      </td>
                      <td className="table-cell text-muted text-xs">
                        {[
                          (batch as Batch & { district_name?: string; tehsil_name?: string }).district_name ?? (batch.district_id ? batch.district_id.slice(0, 8) + "…" : null),
                          (batch as Batch & { district_name?: string; tehsil_name?: string }).tehsil_name ?? (batch.tehsil_id ? batch.tehsil_id.slice(0, 8) + "…" : null),
                        ].filter(Boolean).join(", ") || "—"}
                      </td>
                      <td className="table-cell min-w-[140px]">
                        <div className="text-xs text-muted mb-1">
                          {batch.processed_documents} / {batch.total_documents}
                          {batch.failed_documents > 0 && (
                            <span className="text-danger ml-1">({batch.failed_documents} failed)</span>
                          )}
                        </div>
                        <BatchProgressBar
                          value={batch.processed_documents}
                          total={batch.total_documents}
                          failed={batch.failed_documents}
                        />
                      </td>
                      <td className="table-cell">
                        <span className={cn("inline-flex items-center gap-1 pill text-2xs font-semibold", sc.color)}>
                          <Icon size={11} /> {sc.label}
                        </span>
                      </td>
                      <td className="table-cell text-muted text-xs">
                        {batch.source_office && <div>{batch.source_office}</div>}
                        <div>{formatDate(batch.created_at)}</div>
                      </td>
                      <td className="table-cell">
                        <Link href={`/batches/${batch.id}`} className="text-muted hover:text-ink transition-colors">
                          <ChevronRight size={16} />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
