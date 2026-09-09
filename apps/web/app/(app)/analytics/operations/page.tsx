"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Clock, FileText } from "lucide-react";
import { LoadingState, PageHeader } from "@/components/ui/primitives";
import { insightsApi } from "@/lib/api";
import { cn, formatNumber } from "@/lib/utils";

export default function OperationsAnalyticsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["insights", "operations"],
    queryFn: () => insightsApi.operations(7),
    staleTime: 60_000,
  });

  if (isLoading) return <LoadingState />;

  const daily = (data?.daily_throughput ?? []) as { date: string; documents: number; pages: number }[];
  const topFailures = (data?.top_failures ?? []) as { error_code: string; count: number }[];
  const queueDepth = data?.queue_depth as Record<string, number> | undefined ?? {};
  const docsByStatus = data?.documents_by_status as Record<string, number> | undefined ?? {};
  const avgSec = data?.avg_processing_seconds ?? 0;
  const p95Sec = data?.p95_processing_seconds ?? 0;
  const maxDaily = Math.max(...daily.map((d) => d.documents), 1);
  const totalDocs = Object.values(docsByStatus).reduce((s, v) => s + v, 0);

  return (
    <>
      <PageHeader
        title="Operations Analytics"
        description="Processing throughput, queue depth, and pipeline health"
        breadcrumbs={[{ label: "Analytics" }, { label: "Operations" }]}
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-7">
        {[
          { label: "Total docs",       value: formatNumber(totalDocs),      icon: FileText,       color: "text-ink" },
          { label: "Avg processing",   value: avgSec >= 60 ? `${Math.floor(avgSec/60)}m ${Math.floor(avgSec%60)}s` : `${Math.round(avgSec)}s`,   icon: Clock, color: "text-ink" },
          { label: "P95 processing",   value: p95Sec >= 60 ? `${Math.floor(p95Sec/60)}m ${Math.floor(p95Sec%60)}s` : `${Math.round(p95Sec)}s`, icon: Clock, color: "text-warn" },
          { label: "Top failure",      value: topFailures[0]?.error_code?.replace(/_/g, " ") ?? "—", icon: AlertTriangle, color: "text-danger" },
        ].map((k) => {
          const Icon = k.icon;
          return (
            <div key={k.label} className="rounded-card border border-line bg-surface p-4">
              <div className="flex items-center gap-1.5 mb-1">
                <Icon size={13} className={k.color} />
                <span className="text-xs text-muted">{k.label}</span>
              </div>
              <div className={cn("text-xl font-bold tabular-nums", k.color)}>{k.value}</div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Daily throughput */}
        <div className="rounded-card border border-line overflow-hidden bg-surface">
          <div className="px-5 py-4 border-b border-line">
            <div className="font-semibold text-sm text-ink">Daily throughput</div>
            <div className="text-xs text-muted mt-0.5">Documents processed — last {daily.length} days</div>
          </div>
          <div className="px-5 py-5">
            {daily.length === 0 ? (
              <div className="text-center text-muted text-sm py-8">No data available</div>
            ) : (
              <div className="flex items-end gap-2 h-28">
                {daily.map((d) => {
                  const label = new Date(d.date).toLocaleDateString("en-IN", { weekday: "short" });
                  return (
                    <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
                      <div className="text-2xs text-muted font-mono tabular-nums">{d.documents}</div>
                      <div
                        className="w-full rounded-t-sm bg-primary/60 transition-all"
                        style={{ height: `${(d.documents / maxDaily) * 80}px`, minHeight: 2 }}
                      />
                      <div className="text-2xs text-muted">{label}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Documents by status */}
        <div className="rounded-card border border-line overflow-hidden bg-surface">
          <div className="px-5 py-4 border-b border-line">
            <div className="font-semibold text-sm text-ink">Documents by status</div>
            <div className="text-xs text-muted mt-0.5">Current breakdown across all batches</div>
          </div>
          <div className="divide-y divide-line">
            {Object.entries(docsByStatus).map(([status, count]) => {
              const pct = totalDocs > 0 ? (count / totalDocs) * 100 : 0;
              return (
                <div key={status} className="flex items-center gap-4 px-5 py-3">
                  <div className="w-32 shrink-0">
                    <span className="text-xs font-medium text-ink">{status.replace(/_/g, " ")}</span>
                  </div>
                  <div className="flex-1 h-2 rounded-full bg-surface-2 overflow-hidden">
                    <div className="h-full bg-primary/60 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs tabular-nums text-muted w-12 text-right">{count}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Queue depth */}
        {Object.keys(queueDepth).length > 0 && (
          <div className="rounded-card border border-line overflow-hidden bg-surface">
            <div className="px-5 py-4 border-b border-line">
              <div className="font-semibold text-sm text-ink">Queue depth</div>
              <div className="text-xs text-muted mt-0.5">Items waiting in each processing stage</div>
            </div>
            <div className="divide-y divide-line">
              {Object.entries(queueDepth).map(([stage, count]) => (
                <div key={stage} className="flex items-center justify-between px-5 py-3">
                  <span className="text-sm capitalize text-ink">{stage}</span>
                  <span className={cn("text-sm font-bold tabular-nums", count > 20 ? "text-danger" : count > 10 ? "text-warn" : "text-success")}>
                    {count}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Top failures */}
        {topFailures.length > 0 && (
          <div className="rounded-card border border-line overflow-hidden bg-surface">
            <div className="px-5 py-4 border-b border-line">
              <div className="font-semibold text-sm text-ink">Top failure reasons</div>
              <div className="text-xs text-muted mt-0.5">Most common processing errors</div>
            </div>
            <div className="divide-y divide-line">
              {topFailures.map((f: { error_code: string; count: number }) => (
                <div key={f.error_code} className="flex items-center justify-between px-5 py-3">
                  <span className="text-xs font-mono text-ink">{f.error_code}</span>
                  <span className="text-sm font-bold tabular-nums text-danger">{f.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
