"use client";

import { useQuery } from "@tanstack/react-query";
import { Clock, ClipboardCheck, AlertTriangle, Edit3 } from "lucide-react";
import { Card, LoadingState, PageHeader } from "@/components/ui/primitives";
import { insightsApi } from "@/lib/api";
import { cn } from "@/lib/utils";

function fmtTime(secs: number | null) {
  if (secs == null) return "—";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

const AGING_COLORS: Record<string, string> = {
  "0-24h":  "bg-success",
  "24-72h": "bg-warn",
  "72h+":   "bg-danger",
};

export default function VerificationAnalyticsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["insights", "verification"],
    queryFn: () => insightsApi.verification(30),
    staleTime: 60_000,
  });

  if (isLoading) return <LoadingState />;

  const verifiers: { user_id: string | null; records_completed: number; avg_handling_seconds: number | null }[] =
    data?.verifiers ?? [];
  const slaBreaches: number = data?.sla_breaches ?? 0;
  const queueAging: Record<string, number> = data?.queue_aging ?? {};
  const fieldEdits: number = data?.field_edits ?? 0;

  const totalCompleted = verifiers.reduce((s, v) => s + v.records_completed, 0);
  const avgHandling =
    verifiers.length
      ? verifiers.reduce((s, v) => s + (v.avg_handling_seconds ?? 0), 0) / verifiers.length
      : null;
  const totalInQueue = Object.values(queueAging).reduce((s, v) => s + v, 0);
  const maxCompleted = Math.max(...verifiers.map((v) => v.records_completed), 1);

  return (
    <>
      <PageHeader
        title="Verification Analytics"
        description="Verifier performance, SLA compliance, and queue health over the last 30 days"
        breadcrumbs={[{ label: "Analytics" }, { label: "Verification" }]}
      />

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-7">
        {[
          { label: "Records reviewed",    value: totalCompleted.toLocaleString("en-IN"), icon: ClipboardCheck, color: "text-success" },
          { label: "SLA breaches",        value: slaBreaches.toString(),                 icon: AlertTriangle,  color: slaBreaches > 0 ? "text-danger" : "text-success" },
          { label: "Avg handling time",   value: fmtTime(avgHandling),                   icon: Clock,          color: "text-ink" },
          { label: "Field edits (30d)",   value: fieldEdits.toLocaleString("en-IN"),     icon: Edit3,          color: "text-primary" },
        ].map((k) => {
          const Icon = k.icon;
          return (
            <div key={k.label} className="rounded-card border border-line bg-surface p-5">
              <div className="flex items-center gap-2 mb-1">
                <Icon size={15} className={k.color} />
                <span className="text-xs text-muted">{k.label}</span>
              </div>
              <div className={cn("text-2xl font-bold tabular-nums", k.color)}>{k.value}</div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Verifier leaderboard */}
        <div className="rounded-card border border-line overflow-hidden bg-surface">
          <div className="px-5 py-4 border-b border-line">
            <div className="font-semibold text-sm text-ink">Verifier performance</div>
            <div className="text-xs text-muted mt-0.5">Records completed, sorted by throughput</div>
          </div>
          <div className="divide-y divide-line">
            {[...verifiers]
              .sort((a, b) => b.records_completed - a.records_completed)
              .map((v, i) => (
                <div key={v.user_id ?? i} className="px-5 py-3 flex items-center gap-4">
                  <div className="w-6 text-center shrink-0">
                    <span className="text-sm font-bold text-muted">{i + 1}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-ink truncate">
                      {v.user_id ?? "Unassigned"}
                    </div>
                    <div className="text-xs text-muted">
                      avg {fmtTime(v.avg_handling_seconds)} per record
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="w-28">
                      <div className="h-2 rounded-full bg-surface-2 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{ width: `${(v.records_completed / maxCompleted) * 100}%` }}
                        />
                      </div>
                    </div>
                    <span className="text-sm font-semibold tabular-nums text-ink w-8 text-right">
                      {v.records_completed}
                    </span>
                  </div>
                </div>
              ))}
            {verifiers.length === 0 && (
              <div className="px-5 py-8 text-center text-sm text-muted">No verifier data for this period</div>
            )}
          </div>
          {totalCompleted > 0 && (
            <div className="px-5 py-3 border-t border-line bg-surface-2">
              <span className="text-xs text-muted">{totalCompleted.toLocaleString("en-IN")} total reviews by {verifiers.length} verifier{verifiers.length !== 1 ? "s" : ""}</span>
            </div>
          )}
        </div>

        {/* Queue aging */}
        <div className="space-y-6">
          <div className="rounded-card border border-line overflow-hidden bg-surface">
            <div className="px-5 py-4 border-b border-line">
              <div className="font-semibold text-sm text-ink">Queue aging</div>
              <div className="text-xs text-muted mt-0.5">How long items have waited in the review queue</div>
            </div>
            <div className="px-5 py-4 space-y-3">
              {Object.entries(queueAging).length === 0 ? (
                <p className="text-sm text-muted text-center py-4">No queue data</p>
              ) : (
                Object.entries(queueAging).map(([band, count]) => {
                  const pct = totalInQueue > 0 ? (count / totalInQueue) * 100 : 0;
                  const barColor = AGING_COLORS[band] ?? "bg-primary";
                  return (
                    <div key={band} className="flex items-center gap-4">
                      <div className="w-16 shrink-0 text-xs font-medium text-ink">{band}</div>
                      <div className="flex-1">
                        <div className="h-2.5 rounded-full bg-surface-2 overflow-hidden">
                          <div className={cn("h-full rounded-full transition-all", barColor)} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                      <div className="w-16 text-right text-xs tabular-nums">
                        <span className="font-semibold text-ink">{count}</span>
                        <span className="text-muted ml-1">({pct.toFixed(0)}%)</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            {totalInQueue > 0 && (
              <div className="px-5 py-3 border-t border-line bg-surface-2">
                <span className="text-xs text-muted">{totalInQueue} items currently in queue</span>
                {queueAging["72h+"] > 0 && (
                  <span className="ml-2 text-xs font-medium text-danger">
                    · {queueAging["72h+"]} breached 72h SLA
                  </span>
                )}
              </div>
            )}
          </div>

          {/* SLA summary card */}
          <Card title="SLA compliance">
            <div className="grid grid-cols-2 gap-4 px-1">
              <div className="text-center">
                <div className={cn("text-3xl font-bold tabular-nums", slaBreaches === 0 ? "text-success" : "text-danger")}>
                  {slaBreaches}
                </div>
                <div className="text-xs text-muted mt-0.5">SLA breaches (30d)</div>
              </div>
              <div className="text-center">
                <div className={cn("text-3xl font-bold tabular-nums", slaBreaches === 0 ? "text-success" : "text-warn")}>
                  {totalCompleted > 0
                    ? `${(((totalCompleted - slaBreaches) / totalCompleted) * 100).toFixed(1)}%`
                    : "—"}
                </div>
                <div className="text-xs text-muted mt-0.5">On-time completion</div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
