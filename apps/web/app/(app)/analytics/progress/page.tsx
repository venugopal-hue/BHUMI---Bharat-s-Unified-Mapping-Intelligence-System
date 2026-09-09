"use client";

import { useQuery } from "@tanstack/react-query";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
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
  PageHeader,
  ProgressBar,
  SkeletonRows,
} from "@/components/ui/primitives";
import { insightsApi } from "@/lib/api";
import { formatNumber, formatPercent, cn } from "@/lib/utils";

const LEVELS = ["state", "district", "tehsil"] as const;
type Level = (typeof LEVELS)[number];

function ProgressPageInner() {
  const searchParams = useSearchParams();
  const [level, setLevel] = useState<Level>(
    (searchParams.get("level") as Level) ?? "district"
  );
  const [parentId, setParentId] = useState<string | undefined>(
    searchParams.get("district") ?? undefined
  );

  const { data, isLoading } = useQuery({
    queryKey: ["progress", level, parentId],
    queryFn: () => insightsApi.progress(level, parentId),
    staleTime: 60_000,
  });

  const items = data?.items ?? [];

  // KPI calculations
  const totalRecords   = items.reduce((sum, i) => sum + i.total, 0);
  const totalVerified  = items.reduce((sum, i) => sum + i.verified, 0);
  const overallPct     = totalRecords > 0 ? ((totalVerified / totalRecords) * 100).toFixed(1) : "0.0";
  const confItems      = items.filter((i) => i.avg_confidence != null);
  const avgConf        = confItems.length > 0
    ? ((confItems.reduce((sum, i) => sum + (i.avg_confidence ?? 0), 0) / confItems.length) * 100).toFixed(0)
    : null;

  return (
    <>
      <PageHeader
        title="Digitization progress"
        description="How many records have been extracted and verified, by administrative level."
        breadcrumbs={[{ label: "Analytics" }, { label: "Progress" }]}
      />

      {/* KPI summary cards */}
      {!isLoading && items.length > 0 && (
        <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="card p-4">
            <p className="text-2xl font-bold tabular-nums text-ink">{formatNumber(totalRecords)}</p>
            <p className="text-xs text-muted mt-0.5">Total records</p>
          </div>
          <div className="card p-4">
            <p className="text-2xl font-bold tabular-nums text-success">{formatNumber(totalVerified)}</p>
            <p className="text-xs text-muted mt-0.5">Total verified</p>
          </div>
          <div className="card p-4">
            <p className="text-2xl font-bold tabular-nums text-primary">{overallPct}%</p>
            <p className="text-xs text-muted mt-0.5">Overall progress</p>
          </div>
          <div className="card p-4">
            <p className={cn(
              "text-2xl font-bold tabular-nums",
              avgConf != null && Number(avgConf) >= 90 ? "text-conf-high" : avgConf != null && Number(avgConf) >= 80 ? "text-conf-medium" : "text-conf-low"
            )}>
              {avgConf != null ? `${avgConf}%` : "—"}
            </p>
            <p className="text-xs text-muted mt-0.5">Avg confidence</p>
          </div>
        </div>
      )}

      <div className="mb-4 flex items-center gap-2">
        {LEVELS.map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => {
              setLevel(l);
              setParentId(undefined);
            }}
            className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
              level === l
                ? "bg-primary text-primary-fg"
                : "bg-surface border border-line text-muted hover:text-ink"
            }`}
          >
            {l}
          </button>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        {/* Table */}
        <Card
          title={`Progress by ${level}`}
          subtitle={`${formatNumber(items.length)} ${level}s shown`}
          bodyClassName="p-0"
        >
          {isLoading ? (
            <div className="p-4">
              <SkeletonRows rows={8} />
            </div>
          ) : !items.length ? (
            <EmptyState title="No data yet" description="Records appear here once they are processed." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="table-head">Name</th>
                    <th className="table-head text-right">Total</th>
                    <th className="table-head text-right">Verified</th>
                    <th className="table-head text-right">Pending</th>
                    <th className="table-head w-40">Progress</th>
                    <th className="table-head text-right">Confidence</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {[...items]
                    .sort((a, b) => b.progress_pct - a.progress_pct)
                    .map((item) => (
                      <tr key={item.id} className="hover:bg-surface-2">
                        <td className="table-cell">
                          <button
                            type="button"
                            className="text-left font-medium text-ink hover:text-primary hover:underline"
                            onClick={() => {
                              if (level !== "tehsil") {
                                setLevel(level === "state" ? "district" : "tehsil");
                                setParentId(item.id);
                              }
                            }}
                          >
                            {item.name}
                          </button>
                          {item.name_local && (
                            <span className="ml-1.5 text-xs text-muted">{item.name_local}</span>
                          )}
                          <div className="text-2xs text-muted/70">{item.lgd_code}</div>
                        </td>
                        <td className="table-cell text-right tabular-nums">
                          {formatNumber(item.total)}
                        </td>
                        <td className="table-cell text-right tabular-nums text-success">
                          {formatNumber(item.verified)}
                        </td>
                        <td className="table-cell text-right tabular-nums text-warn">
                          {formatNumber(item.pending)}
                        </td>
                        <td className="table-cell">
                          <ProgressBar
                            value={item.progress_pct}
                            showValue
                            tone={
                              item.progress_pct >= 80
                                ? "success"
                                : item.progress_pct >= 50
                                  ? "primary"
                                  : "warn"
                            }
                          />
                        </td>
                        <td className="table-cell text-right">
                          <span
                            className={cn(
                              "tabular-nums font-semibold text-sm",
                              (item.avg_confidence ?? 0) >= 0.9
                                ? "text-conf-high"
                                : (item.avg_confidence ?? 0) >= 0.8
                                  ? "text-conf-medium"
                                  : "text-conf-low",
                            )}
                          >
                            {item.avg_confidence
                              ? `${(item.avg_confidence * 100).toFixed(0)}%`
                              : "—"}
                          </span>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Bar chart */}
        <Card
          title="Verification rate"
          subtitle="Top 12 by total records"
          bodyClassName="pt-2"
        >
          {isLoading ? (
            <SkeletonRows rows={5} />
          ) : !items.length ? (
            <EmptyState title="No data" />
          ) : (
            <>
              <ResponsiveContainer width="100%" height={340}>
                <BarChart
                  data={[...items]
                    .sort((a, b) => b.total - a.total)
                    .slice(0, 12)
                    .map((item) => ({
                      name:
                        item.name.length > 12
                          ? item.name.slice(0, 11) + "…"
                          : item.name,
                      verified: item.verified,
                      pending: item.pending,
                      pct: item.progress_pct,
                    }))}
                  layout="vertical"
                  margin={{ left: 4, right: 16 }}
                >
                  <CartesianGrid
                    horizontal={false}
                    strokeDasharray="3 3"
                    stroke="rgb(var(--bhumi-border))"
                  />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 11, fill: "rgb(var(--bhumi-muted))" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={90}
                    tick={{ fontSize: 11, fill: "rgb(var(--bhumi-muted))" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    cursor={false}
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      return (
                        <div className="rounded-md border border-line bg-surface px-2.5 py-1.5 shadow-raised text-xs">
                          <p className="font-semibold text-ink">{label}</p>
                          {payload.map((p, i) => (
                            <p key={i} className="text-muted">
                              {p.name}: {formatNumber(p.value as number)}
                            </p>
                          ))}
                        </div>
                      );
                    }}
                  />
                  <Bar
                    dataKey="verified"
                    name="Verified"
                    stackId="a"
                    fill="rgb(var(--bhumi-success))"
                    radius={[0, 0, 0, 0]}
                    barSize={14}
                    stroke="none"
                  />
                  <Bar
                    dataKey="pending"
                    name="Pending"
                    stackId="a"
                    fill="rgb(var(--bhumi-warn) / 0.4)"
                    radius={[0, 3, 3, 0]}
                    barSize={14}
                    stroke="none"
                  />
                </BarChart>
              </ResponsiveContainer>

              <ConfidenceLegend className="mt-3 border-t border-line pt-3" />
            </>
          )}
        </Card>
      </div>
    </>
  );
}

export default function ProgressPage() {
  return (
    <Suspense>
      <ProgressPageInner />
    </Suspense>
  );
}
