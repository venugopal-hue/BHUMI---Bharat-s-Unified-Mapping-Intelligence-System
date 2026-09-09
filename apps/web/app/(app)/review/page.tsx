"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, ClipboardCheck, Clock, Filter } from "lucide-react";

import { ConfidenceBadge } from "@/components/ui/Confidence";
import { Card, EmptyState, PageHeader, QueuePill, SkeletonRows } from "@/components/ui/primitives";
import { reviewApi } from "@/lib/api";
import { useTranslate } from "@/lib/preferences";
import { QUEUE_META, documentTypeLabel, formatNumber, languageLabel, relativeTime } from "@/lib/utils";

const QUEUE_TYPES = ["PRIORITY", "EXCEPTION", "STANDARD", "DUPLICATE", "QA_SAMPLE", "MAKER_CHECKER"];

export default function ReviewQueuePage() {
  const t = useTranslate();
  const params = useSearchParams();
  const [selectedType, setSelectedType] = useState(params.get("queue_type") ?? "");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 25;

  const statsQuery = useQuery({
    queryKey: ["review", "stats"],
    queryFn: () => reviewApi.stats(),
    refetchInterval: 15_000,
  });

  const queueQuery = useQuery({
    queryKey: ["review", "queue", selectedType, page],
    queryFn: () => reviewApi.queue({ queue_type: selectedType || undefined, page, page_size: PAGE_SIZE }),
    refetchInterval: 20_000,
  });

  const stats = statsQuery.data;
  const items = queueQuery.data ?? [];

  return (
    <>
      <PageHeader
        title={t("reviewTitle")}
        description={t("reviewDesc")}
        breadcrumbs={[{ label: t("review") }]}
        actions={
          <Link href="/review/next" className="btn-primary animate-pulse-ring">
            <ClipboardCheck size={15} aria-hidden />
            {t("startReviewing")}
            {stats?.total_open ? (
              <span className="rounded-full bg-primary-fg/20 px-1.5 py-0.5 text-2xs font-bold tabular-nums">
                {formatNumber(stats.total_open)}
              </span>
            ) : null}
          </Link>
        }
      />

      {/* Stats row */}
      {stats && (
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label={t("openItems")}   value={formatNumber(stats.total_open)}   tone="warn" />
          <StatCard label={t("slaBreaches")} value={formatNumber(stats.sla_breaches)} tone={stats.sla_breaches > 0 ? "danger" : "success"} />
          <StatCard label={t("avgHandling")} value={stats.avg_handling_seconds ? `${Math.round(stats.avg_handling_seconds)}s` : "—"} tone="default" />
          <StatCard label={t("priority")}    value={formatNumber(stats.by_type["PRIORITY"]?.count ?? 0)} tone="danger" />
        </div>
      )}

      {/* Queue type filters */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Filter size={14} className="text-muted" aria-hidden />
        <button
          type="button"
          onClick={() => { setSelectedType(""); setPage(1); }}
          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            selectedType === ""
              ? "bg-primary text-primary-fg"
              : "bg-surface border border-line text-muted hover:text-ink"
          }`}
        >
          {t("allQueueTypes")}
        </button>
        {QUEUE_TYPES.map((type) => {
          const meta = QUEUE_META[type];
          const count = stats?.by_type[type]?.count ?? 0;
          return (
            <button
              key={type}
              type="button"
              onClick={() => { setSelectedType(type === selectedType ? "" : type); setPage(1); }}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                selectedType === type
                  ? "border-primary bg-primary-soft text-primary"
                  : "border-line bg-surface text-muted hover:text-ink"
              }`}
            >
              {meta?.label ?? type}
              {count > 0 && <span className="ml-1.5 tabular-nums opacity-70">{count}</span>}
            </button>
          );
        })}
      </div>

      <Card bodyClassName="p-0">
        {queueQuery.isLoading ? (
          <div className="p-4"><SkeletonRows rows={8} /></div>
        ) : items.length === 0 ? (
          <EmptyState
            title={t("nothingHere")}
            description={selectedType ? `No open items in the ${QUEUE_META[selectedType]?.label ?? selectedType} queue.` : t("allVerified")}
            icon={CheckCircle2}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-head">{t("colSurveyNo")}</th>
                  <th className="table-head">{t("colOwner")}</th>
                  <th className="table-head">{t("colType")}</th>
                  <th className="table-head">{t("colQueue")}</th>
                  <th className="table-head text-right">{t("colConfidence")}</th>
                  <th className="table-head">{t("colIssues")}</th>
                  <th className="table-head">{t("colSLA")}</th>
                  <th className="table-head">{t("colWaiting")}</th>
                  <th className="table-head" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {items.map((item) => (
                  <tr key={item.id} className="group hover:bg-surface-2">
                    <td className="table-cell">
                      <Link href={`/review/${item.record_id}`} className="id-text font-semibold text-primary hover:underline">
                        {item.survey_number ?? "—"}
                      </Link>
                    </td>
                    <td className="table-cell max-w-[160px]">
                      <span className="block truncate text-sm text-ink">{item.owner_name ?? "—"}</span>
                      {item.source_language && (
                        <span className="text-2xs text-muted">{languageLabel(item.source_language)}</span>
                      )}
                    </td>
                    <td className="table-cell text-xs text-muted">{documentTypeLabel(item.document_type)}</td>
                    <td className="table-cell"><QueuePill type={item.queue_type} /></td>
                    <td className="table-cell text-right">
                      {item.confidence_overall !== null ? <ConfidenceBadge value={item.confidence_overall} size="sm" /> : "—"}
                    </td>
                    <td className="table-cell">
                      {item.blocking_failures > 0 ? (
                        <span className="pill bg-danger-soft text-danger">{item.blocking_failures} {t("blocking")}</span>
                      ) : item.low_confidence_fields.length > 0 ? (
                        <span className="text-2xs text-muted">
                          {item.low_confidence_fields.length} {item.low_confidence_fields.length > 1 ? t("weakFields") : t("weakField")}
                        </span>
                      ) : (
                        <span className="text-2xs text-success">{t("clean")}</span>
                      )}
                    </td>
                    <td className="table-cell">
                      {item.is_sla_breached ? (
                        <span className="pill bg-danger-soft text-danger"><Clock size={10} aria-hidden /> {t("overdue")}</span>
                      ) : item.sla_due_at ? (
                        <span className="text-2xs text-muted">{relativeTime(item.sla_due_at)}</span>
                      ) : "—"}
                    </td>
                    <td className="table-cell text-2xs text-muted">{relativeTime(item.created_at)}</td>
                    <td className="table-cell">
                      <Link
                        href={`/review/${item.record_id}`}
                        className="btn-secondary btn-sm opacity-0 transition-opacity group-hover:opacity-100"
                        aria-label={`Review record ${item.survey_number ?? item.record_id}`}
                      >
                        {t("review")} <ArrowRight size={12} aria-hidden />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Pagination */}
      {items.length > 0 && (
        <div className="mt-3 flex items-center justify-between text-xs text-muted">
          <span>Page {page} · {items.length} item{items.length !== 1 ? "s" : ""}</span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="btn-ghost btn-sm disabled:opacity-40"
            >
              <ArrowLeft size={13} /> Prev
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => p + 1)}
              disabled={items.length < PAGE_SIZE}
              className="btn-ghost btn-sm disabled:opacity-40"
            >
              Next <ArrowRight size={13} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function StatCard({ label, value, tone }: { label: string; value: string; tone: "default" | "success" | "warn" | "danger" }) {
  const toneClass = { default: "text-ink", success: "text-success", warn: "text-warn", danger: "text-danger" }[tone];
  return (
    <div className="card px-4 py-3">
      <p className="text-2xs font-medium uppercase tracking-wider text-muted">{label}</p>
      <p className={`mt-1.5 text-2xl font-bold tabular-nums leading-none ${toneClass}`}>{value}</p>
    </div>
  );
}
