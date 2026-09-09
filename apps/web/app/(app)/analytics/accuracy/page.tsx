"use client";

import { useQuery } from "@tanstack/react-query";
import { PageHeader, LoadingState } from "@/components/ui/primitives";
import { insightsApi } from "@/lib/api";
import { cn, languageLabel } from "@/lib/utils";

function AccuracyBar({ value, max = 100 }: { value: number; max?: number }) {
  const pct = (value / max) * 100;
  const color = value >= 95 ? "bg-success" : value >= 85 ? "bg-primary" : value >= 70 ? "bg-warn" : "bg-danger";
  return (
    <div className="h-2 rounded-full bg-surface-2 overflow-hidden w-full">
      <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
    </div>
  );
}

function AccuracyBadge({ value }: { value: number }) {
  const color = value >= 95 ? "text-success bg-success/10" : value >= 85 ? "text-primary bg-primary/10" : value >= 70 ? "text-warn bg-warn/10" : "text-danger bg-danger/10";
  return (
    <span className={cn("pill text-xs font-mono font-semibold", color)}>
      {value.toFixed(1)}%
    </span>
  );
}

export default function AccuracyAnalyticsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["insights", "accuracy"],
    queryFn: () => insightsApi.accuracy(90),
    staleTime: 60_000,
  });

  if (isLoading) return <LoadingState />;

  const fields = data?.fields ?? [];
  const byLang = data?.by_language ?? [];
  const histogram = data?.confidence_histogram ?? [];
  const maxHist = Math.max(...histogram.map((h: { count: number }) => h.count), 1);
  const totalCorrections = data?.total_corrections ?? 0;

  const overallAccuracy = fields.length
    ? fields.reduce((s: number, f: { accuracy_pct: number }) => s + f.accuracy_pct, 0) / fields.length
    : 0;

  return (
    <>
      <PageHeader
        title="Accuracy Analytics"
        description="AI extraction accuracy by field, language, and confidence distribution"
        breadcrumbs={[{ label: "Analytics" }, { label: "Accuracy" }]}
      />

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-7">
        {[
          { label: "Overall accuracy", value: `${overallAccuracy.toFixed(1)}%`, sub: "Avg across all fields", color: "text-success" },
          { label: "Records evaluated", value: ((data as Record<string, number> | undefined)?.total_records ?? (data as Record<string, number> | undefined)?.records_evaluated ?? fields.reduce((s: number, f: { extracted?: number }) => Math.max(s, f.extracted ?? 0), 0))?.toLocaleString("en-IN") ?? "—", sub: "Processed with ground truth", color: "text-ink" },
          { label: "Field corrections", value: totalCorrections.toLocaleString("en-IN"), sub: "By reviewing officers", color: "text-ink" },
          { label: "Languages", value: byLang.length.toString(), sub: "Indian scripts supported", color: "text-primary" },
        ].map((k) => (
          <div key={k.label} className="rounded-card border border-line bg-surface p-5">
            <div className={cn("text-2xl font-bold tabular-nums", k.color)}>{k.value}</div>
            <div className="text-xs text-muted mt-0.5">{k.label}</div>
            <div className="text-2xs text-muted/70 mt-1">{k.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Field accuracy table */}
        <div className="rounded-card border border-line overflow-hidden bg-surface">
          <div className="px-5 py-4 border-b border-line">
            <div className="font-semibold text-sm text-ink">Accuracy by field</div>
            <div className="text-xs text-muted mt-0.5">Sorted by accuracy, lowest first</div>
          </div>
          <div className="divide-y divide-line">
            {[...fields].sort((a: { accuracy_pct: number }, b: { accuracy_pct: number }) => a.accuracy_pct - b.accuracy_pct).map((f: { field: string; extracted: number; corrected: number; accuracy_pct: number }) => (
              <div key={f.field} className="px-5 py-3 flex items-center gap-4">
                <div className="w-40 shrink-0">
                  <div className="text-sm font-medium text-ink capitalize">{f.field.replace(/_/g, " ")}</div>
                  <div className="text-xs text-muted">{f.extracted.toLocaleString("en-IN")} samples · {f.corrected} corrections</div>
                </div>
                <div className="flex-1">
                  <AccuracyBar value={f.accuracy_pct} />
                </div>
                <AccuracyBadge value={f.accuracy_pct} />
              </div>
            ))}
          </div>
        </div>

        {/* Language breakdown */}
        <div className="rounded-card border border-line overflow-hidden bg-surface">
          <div className="px-5 py-4 border-b border-line">
            <div className="font-semibold text-sm text-ink">Corrections by language</div>
            <div className="text-xs text-muted mt-0.5">Total field corrections grouped by script</div>
          </div>
          <div className="divide-y divide-line">
            {byLang.map((l: { language: string; corrections: number; handwritten: number }) => {
              const pct = totalCorrections > 0 ? (l.corrections / totalCorrections) * 100 : 0;
              return (
                <div key={l.language} className="px-5 py-3 flex items-center gap-4">
                  <div className="w-32 shrink-0">
                    <div className="text-sm font-medium text-ink">{languageLabel(l.language)}</div>
                    <div className="text-xs text-muted">{l.corrections} corrections · {l.handwritten} handwritten</div>
                  </div>
                  <div className="flex-1">
                    <AccuracyBar value={pct} max={100} />
                  </div>
                  <span className="text-xs tabular-nums text-muted w-10 text-right">{pct.toFixed(0)}%</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Confidence histogram */}
      {histogram.length > 0 && (
        <div className="rounded-card border border-line mt-6 overflow-hidden bg-surface">
          <div className="px-5 py-4 border-b border-line">
            <div className="font-semibold text-sm text-ink">Confidence distribution</div>
            <div className="text-xs text-muted mt-0.5">Number of records per confidence band</div>
          </div>
          <div className="px-5 py-5">
            <div className="flex items-end gap-4 h-32">
              {histogram.map((h: { range: string; count: number }) => {
                const height = (h.count / maxHist) * 100;
                return (
                  <div key={h.range} className="flex-1 flex flex-col items-center gap-1">
                    <div className="text-xs font-mono text-muted tabular-nums">{h.count}</div>
                    <div className="w-full flex flex-col items-center relative" style={{ height: 80 }}>
                      <div className="w-full rounded-t-sm bg-primary/60 absolute bottom-0" style={{ height: `${height}%` }} />
                    </div>
                    <div className="text-2xs text-muted text-center">{h.range}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
