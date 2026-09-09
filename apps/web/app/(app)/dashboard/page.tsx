"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  FileStack,
  FileWarning,
  Gauge,
  Layers,
  ShieldCheck,
  Upload,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { ConfidenceLegend } from "@/components/ui/Confidence";
import {
  Card,
  EmptyState,
  KpiCard,
  LoadingState,
  PageHeader,
  ProgressBar,
  QueuePill,
  SkeletonRows,
  StatusPill,
} from "@/components/ui/primitives";
import { insightsApi, reviewApi } from "@/lib/api";
import { Perm, useAuth } from "@/lib/auth";
import { useTranslate } from "@/lib/preferences";
import {
  cn,
  formatCompact,
  formatDuration,
  formatNumber,
  formatPercent,
  relativeTime,
} from "@/lib/utils";

export default function DashboardPage() {
  const { user, can } = useAuth();
  const t = useTranslate();

  const overview = useQuery({
    queryKey: ["insights", "overview"],
    queryFn: () => insightsApi.overview(30),
  });
  const progress = useQuery({
    queryKey: ["insights", "progress", "district"],
    queryFn: () => insightsApi.progress("district"),
  });
  const operations = useQuery({
    queryKey: ["insights", "operations"],
    queryFn: () => insightsApi.operations(14),
  });
  const queue = useQuery({
    queryKey: ["review", "queue", "top"],
    queryFn: () => reviewApi.queue({ page_size: 6, sort: "priority" }),
    enabled: can(Perm.REVIEW_CLAIM),
    refetchInterval: 30_000,
  });
  const queueStats = useQuery({
    queryKey: ["review", "stats"],
    queryFn: () => reviewApi.stats(),
    enabled: can(Perm.REVIEW_CLAIM),
    refetchInterval: 30_000,
  });

  const stats = overview.data;
  const jurisdiction = user?.jurisdictions[0]?.label ?? "your jurisdiction";

  return (
    <>
      <PageHeader
        title={`${greeting(t)}, ${user?.full_name.split(" ")[0] ?? ""}`}
        description={t("dashboardSubtitle", jurisdiction)}
        actions={
          <>
            {can(Perm.DOCUMENT_UPLOAD) && (
              <Link href="/upload" className="btn-secondary">
                <Upload size={15} aria-hidden /> {t("upload")}
              </Link>
            )}
            {can(Perm.REVIEW_CLAIM) && (
              <Link href="/review" className="btn-primary">
                <ClipboardCheck size={15} aria-hidden /> {t("startReviewing")}
                {queueStats.data?.total_open ? (
                  <span className="rounded-full bg-primary-fg/20 px-1.5 py-0.5 text-2xs font-bold tabular-nums">
                    {queueStats.data.total_open}
                  </span>
                ) : null}
              </Link>
            )}
          </>
        }
      />

      {/* KPI row */}
      {overview.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton h-24" />
          ))}
        </div>
      ) : overview.isError ? (
        <div className="rounded-card border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger mb-4">
          Could not load dashboard stats. Check your connection or try refreshing.
        </div>
      ) : stats ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <KpiCard
            label={t("pagesDigitized")}
            value={formatCompact(stats.pages_processed)}
            sublabel={`${formatNumber(stats.documents_processed)} ${t("documents")}`}
            icon={FileStack}
            href="/documents"
          />
          <KpiCard
            label={t("recordsExtracted")}
            value={formatCompact(stats.records_extracted)}
            trend={stats.trend_pct}
            sublabel={t("vsPrior30Days")}
            icon={Layers}
            href="/records"
          />
          <KpiCard
            label={t("verified")}
            value={formatCompact(stats.records_verified)}
            sublabel={formatPercent(stats.verification_rate_pct)}
            icon={CheckCircle2}
            tone="success"
          />
          <KpiCard
            label={t("straightThrough")}
            value={formatPercent(stats.straight_through_rate_pct)}
            sublabel={t("noHumanTouched")}
            icon={Gauge}
            tone="primary"
          />
          <KpiCard
            label={t("awaitingReview")}
            value={formatCompact(stats.records_pending)}
            sublabel={
              queueStats.data?.sla_breaches
                ? `${queueStats.data.sla_breaches} ${t("pastSLA")}`
                : t("withinSLA")
            }
            icon={ClipboardCheck}
            tone={queueStats.data?.sla_breaches ? "warn" : "default"}
            href="/review"
          />
          <KpiCard
            label={t("meanConfidence")}
            value={formatPercent(stats.avg_confidence * 100)}
            sublabel={
              stats.documents_failed
                ? `${stats.documents_failed} ${t("docsFailed")}`
                : t("noFailures")
            }
            icon={ShieldCheck}
            tone={stats.avg_confidence >= 0.9 ? "success" : "warn"}
          />
        </div>
      ) : null}

      <div className="mt-5 grid gap-4 xl:grid-cols-3">
        {/* Throughput */}
        <Card
          className="xl:col-span-2"
          title={t("throughput")}
          subtitle={t("throughputSubtitle")}
          action={
            <Link href="/analytics/operations" className="btn-ghost btn-sm">
              {t("operations")} <ArrowRight size={13} aria-hidden />
            </Link>
          }
        >
          {operations.isLoading ? (
            <SkeletonRows rows={4} />
          ) : operations.data?.daily_throughput.length ? (
            <>
              <ResponsiveContainer width="100%" height={210}>
                <AreaChart data={operations.data.daily_throughput}>
                  <defs>
                    <linearGradient id="pagesFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="rgb(var(--bhumi-primary))" stopOpacity={0.28} />
                      <stop offset="100%" stopColor="rgb(var(--bhumi-primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="rgb(var(--bhumi-border))"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: "rgb(var(--bhumi-muted))" }}
                    tickFormatter={(value: string) => value.slice(5)}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "rgb(var(--bhumi-muted))" }}
                    axisLine={false}
                    tickLine={false}
                    width={40}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="pages"
                    stroke="rgb(var(--bhumi-primary))"
                    strokeWidth={2}
                    fill="url(#pagesFill)"
                    name={t("pagesDigitized")}
                  />
                </AreaChart>
              </ResponsiveContainer>

              <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 border-t border-line pt-3">
                <MiniStat label={t("avgProcessing")} value={formatDuration(operations.data.avg_processing_seconds)} />
                <MiniStat label={t("p95Processing")} value={formatDuration(operations.data.p95_processing_seconds)} />
                <MiniStat
                  label={t("avgPageQuality")}
                  value={operations.data.avg_page_quality ? `${(operations.data.avg_page_quality * 100).toFixed(0)}/100` : "—"}
                />
              </div>
            </>
          ) : (
            <EmptyState
              title={t("nothingProcessed")}
              description={t("uploadToPipeline")}
              icon={Upload}
              action={
                <Link href="/upload" className="btn-primary btn-sm">
                  {t("uploadDocuments")}
                </Link>
              }
            />
          )}
        </Card>

        {/* Review queue */}
        <Card
          title={t("reviewQueue")}
          subtitle={
            queueStats.data
              ? `${formatNumber(queueStats.data.total_open)} open · avg ${formatDuration(queueStats.data.avg_handling_seconds)} per record`
              : t("reviewQueueSubtitle")
          }
          action={
            <Link href="/review" className="btn-ghost btn-sm">
              {t("open")} <ArrowRight size={13} aria-hidden />
            </Link>
          }
          bodyClassName="p-0"
        >
          {!can(Perm.REVIEW_CLAIM) ? (
            <EmptyState
              title={t("notYourRole")}
              description={t("verificationHandledBy")}
            />
          ) : queue.isLoading ? (
            <div className="p-4">
              <SkeletonRows rows={5} />
            </div>
          ) : queue.data?.length ? (
            <ul className="divide-y divide-line">
              {queue.data.map((item) => (
                <li key={item.id}>
                  <Link
                    href={`/review/${item.record_id}`}
                    className="flex items-start gap-3 px-4 py-2.5 transition-colors hover:bg-surface-2"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="id-text truncate text-sm font-semibold text-ink">
                          {item.survey_number ?? "—"}
                        </span>
                        <QueuePill type={item.queue_type} />
                        {item.is_sla_breached && (
                          <span className="pill bg-danger-soft text-danger">SLA</span>
                        )}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-muted">
                        {item.owner_name ?? t("ownerNotRead")}
                        {item.low_confidence_fields.length > 0 &&
                          ` · ${item.low_confidence_fields.length} ${
                            item.low_confidence_fields.length > 1 ? t("weakFields") : t("weakField")
                          }`}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-sm font-bold tabular-nums text-ink">
                        {item.confidence_overall
                          ? `${Math.round(item.confidence_overall * 100)}%`
                          : "—"}
                      </span>
                      <span className="block text-2xs text-muted">
                        {relativeTime(item.created_at)}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              title={t("queueClear")}
              description={t("queueClearSub")}
              icon={CheckCircle2}
            />
          )}

          {queueStats.data && Object.keys(queueStats.data.by_type).length > 0 && (
            <div className="border-t border-line px-4 py-3">
              <div className="flex flex-wrap gap-2">
                {Object.entries(queueStats.data.by_type).map(([type, info]) => (
                  <Link
                    key={type}
                    href={`/review?queue_type=${type}`}
                    className="flex items-center gap-1.5 rounded-md border border-line px-2 py-1
                               text-2xs transition-colors hover:bg-surface-2"
                  >
                    <QueuePill type={type} />
                    <span className="font-bold tabular-nums text-ink">{info.count}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        {/* District progress */}
        <Card
          className="xl:col-span-2"
          title={t("progressByDistrict")}
          subtitle={t("progressSubtitle")}
          action={
            <Link href="/analytics/progress" className="btn-ghost btn-sm">
              {t("fullDrilldown")} <ArrowRight size={13} aria-hidden />
            </Link>
          }
          bodyClassName="p-0"
        >
          {progress.isLoading ? (
            <div className="p-4">
              <SkeletonRows rows={5} />
            </div>
          ) : progress.data?.items.length ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="table-head">{t("colDistrict")}</th>
                    <th className="table-head text-right">{t("colRecords")}</th>
                    <th className="table-head text-right">{t("colVerified")}</th>
                    <th className="table-head w-48">{t("colProgress")}</th>
                    <th className="table-head text-right">{t("colConfidence")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {progress.data.items.slice(0, 8).map((item) => (
                    <tr key={item.id} className="hover:bg-surface-2">
                      <td className="table-cell">
                        <Link
                          href={`/analytics/progress?district=${item.id}`}
                          className="font-medium text-ink hover:underline"
                        >
                          {item.name}
                        </Link>
                        {item.name_local && (
                          <span className="ml-1.5 text-xs text-muted">{item.name_local}</span>
                        )}
                      </td>
                      <td className="table-cell text-right tabular-nums">
                        {formatNumber(item.total)}
                      </td>
                      <td className="table-cell text-right tabular-nums text-success">
                        {formatNumber(item.verified)}
                      </td>
                      <td className="table-cell">
                        <ProgressBar
                          value={item.progress_pct}
                          showValue
                          tone={
                            item.progress_pct >= 75
                              ? "success"
                              : item.progress_pct >= 40
                                ? "primary"
                                : "warn"
                          }
                        />
                      </td>
                      <td className="table-cell text-right">
                        <span
                          className={cn(
                            "tabular-nums font-semibold",
                            (item.avg_confidence ?? 0) >= 0.9
                              ? "text-conf-high"
                              : (item.avg_confidence ?? 0) >= 0.8
                                ? "text-conf-medium"
                                : "text-conf-low",
                          )}
                        >
                          {item.avg_confidence
                            ? `${Math.round(item.avg_confidence * 100)}%`
                            : "—"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              title={t("noDistrictData")}
              description={t("districtDataWhen")}
            />
          )}
        </Card>

        {/* Pipeline health */}
        <Card
          title={t("pipelineHealth")}
          subtitle={t("whereDocsAre")}
        >
          {operations.isLoading ? (
            <SkeletonRows rows={4} />
          ) : operations.data ? (
            <>
              <ul className="space-y-2">
                {Object.entries(operations.data.documents_by_status)
                  .sort((a, b) => b[1] - a[1])
                  .map(([status, count]) => (
                    <li key={status} className="flex items-center gap-2">
                      <StatusPill status={status} />
                      <span className="ml-auto text-sm font-semibold tabular-nums text-ink">
                        {formatNumber(count)}
                      </span>
                    </li>
                  ))}
              </ul>

              {operations.data.top_failures.length > 0 && (
                <div className="mt-4 border-t border-line pt-3">
                  <p className="mb-2 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-muted">
                    <FileWarning size={12} aria-hidden /> {t("topFailureReasons")}
                  </p>
                  <ResponsiveContainer width="100%" height={110}>
                    <BarChart
                      data={operations.data.top_failures.slice(0, 5)}
                      layout="vertical"
                      margin={{ left: 0, right: 8 }}
                    >
                      <XAxis type="number" hide />
                      <YAxis
                        type="category"
                        dataKey="error_code"
                        width={130}
                        tick={{ fontSize: 10, fill: "rgb(var(--bhumi-muted))" }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip content={<ChartTooltip />} />
                      <Bar dataKey="count" radius={[0, 3, 3, 0]} barSize={11}>
                        {operations.data.top_failures.slice(0, 5).map((_, index) => (
                          <Cell key={index} fill="rgb(var(--bhumi-danger))" />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              <ConfidenceLegend className="mt-4 border-t border-line pt-3" />
            </>
          ) : null}
        </Card>
      </div>
    </>
  );
}

function greeting(t: (key: string) => string): string {
  const hour = new Date().getHours();
  if (hour < 12) return t("greetingMorning");
  if (hour < 17) return t("greetingAfternoon");
  return t("greetingEvening");
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-2xs uppercase tracking-wider text-muted">{label}</p>
      <p className="text-sm font-semibold tabular-nums text-ink">{value}</p>
    </div>
  );
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number; dataKey?: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-line bg-surface px-2.5 py-1.5 shadow-raised">
      {label && <p className="text-2xs font-medium text-muted">{label}</p>}
      {payload.map((entry, index) => (
        <p key={index} className="text-xs font-semibold tabular-nums text-ink">
          {entry.name ?? entry.dataKey}: {formatNumber(entry.value ?? 0)}
        </p>
      ))}
    </div>
  );
}
