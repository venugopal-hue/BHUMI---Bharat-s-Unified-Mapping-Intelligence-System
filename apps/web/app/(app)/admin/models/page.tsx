"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Brain,
  CheckCircle2,
  Cpu,
  Play,
  RotateCcw,
  TrendingUp,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  Card,
  EmptyState,
  LoadingState,
  PageHeader,
  ProgressBar,
  SkeletonRows,
} from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { learningApi } from "@/lib/api";
import { formatDateTime, formatNumber, formatPercent } from "@/lib/utils";

export default function ModelsPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const modelsQuery = useQuery({
    queryKey: ["models"],
    queryFn: () => learningApi.models(),
    staleTime: 30_000,
  });

  const statsQuery = useQuery({
    queryKey: ["models", "corrections"],
    queryFn: () => learningApi.correctionStats(90),
    staleTime: 60_000,
  });

  const historyQuery = useQuery({
    queryKey: ["models", selectedKey, "history"],
    queryFn: () => learningApi.history(selectedKey!),
    enabled: !!selectedKey,
    staleTime: 60_000,
  });

  const promoteMutation = useMutation({
    mutationFn: (modelId: string) => learningApi.promote(modelId),
    onSuccess: (result) => {
      toast.success("Model promoted", `${result.version} is now active.`);
      queryClient.invalidateQueries({ queryKey: ["models"] });
    },
    onError: (err) => toast.error("Promotion failed", (err as Error).message),
  });

  const trainMutation = useMutation({
    mutationFn: (modelKey: string) => learningApi.train(modelKey),
    onSuccess: (result) => {
      toast.info("Training queued", `Run ID: ${result.run_id}`);
      queryClient.invalidateQueries({ queryKey: ["models"] });
    },
    onError: (err) => toast.error("Could not queue training", (err as Error).message),
  });

  const stats = statsQuery.data;

  return (
    <>
      <PageHeader
        title="Model registry"
        description="Trained OCR and extraction models. Promote a candidate to push it into the pipeline; the active model handles all new documents."
        breadcrumbs={[{ label: "Admin" }, { label: "Models" }]}
      />

      {stats && (
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="card px-4 py-3">
            <p className="text-2xs uppercase tracking-wider text-muted">Corrections (90d)</p>
            <p className="mt-1.5 text-2xl font-bold tabular-nums text-ink">
              {formatNumber(stats.total_corrections)}
            </p>
          </div>
          <div className="card px-4 py-3">
            <p className="text-2xs uppercase tracking-wider text-muted">Unused for training</p>
            <p className={`mt-1.5 text-2xl font-bold tabular-nums ${stats.ready_to_train ? "text-success" : "text-muted"}`}>
              {formatNumber(stats.unused_for_training)}
            </p>
            {stats.ready_to_train && (
              <p className="mt-0.5 text-2xs text-success">Ready to train</p>
            )}
          </div>
          <div className="card px-4 py-3">
            <p className="text-2xs uppercase tracking-wider text-muted">Handwritten share</p>
            <p className="mt-1.5 text-2xl font-bold tabular-nums text-ink">
              {formatPercent(stats.handwritten_share_pct)}
            </p>
          </div>
          <div className="card px-4 py-3">
            <p className="text-2xs uppercase tracking-wider text-muted">Training signal</p>
            <p className="mt-1.5 text-sm font-semibold text-ink">{stats.message}</p>
          </div>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        {/* Model list */}
        <Card title="Models" bodyClassName="p-0">
          {modelsQuery.isLoading ? (
            <div className="p-4">
              <SkeletonRows rows={4} />
            </div>
          ) : !modelsQuery.data?.length ? (
            <EmptyState title="No models" icon={Brain} />
          ) : (
            <div className="divide-y divide-line">
              {modelsQuery.data.map((model) => (
                <div
                  key={model.id}
                  className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-start"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Cpu size={15} className="shrink-0 text-muted" aria-hidden />
                      <span className="font-mono text-sm font-semibold text-ink">
                        {model.model_key}
                      </span>
                      <span className="id-text text-2xs text-muted">v{model.version}</span>
                      <StatusBadge status={model.status} />
                    </div>

                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-2xs text-muted">
                      {model.metrics.field_f1 && (
                        <span>
                          Field F1:{" "}
                          <strong className="text-ink">
                            {((model.metrics.field_f1 as number) * 100).toFixed(1)}%
                          </strong>
                        </span>
                      )}
                      {model.metrics.cer_printed && (
                        <span>
                          CER (printed):{" "}
                          <strong className="text-ink">
                            {((model.metrics.cer_printed as number) * 100).toFixed(1)}%
                          </strong>
                        </span>
                      )}
                      {model.metrics.cer_handwritten && (
                        <span>
                          CER (handwritten):{" "}
                          <strong className="text-ink">
                            {((model.metrics.cer_handwritten as number) * 100).toFixed(1)}%
                          </strong>
                        </span>
                      )}
                      {model.training_examples && (
                        <span>{formatNumber(model.training_examples)} training examples</span>
                      )}
                    </div>

                    {model.status === "ACTIVE" && (
                      <div className="mt-2">
                        <ProgressBar
                          value={model.traffic_pct}
                          className="w-40"
                          tone="success"
                        />
                        <p className="mt-0.5 text-2xs text-muted">
                          {model.traffic_pct}% of traffic
                        </p>
                      </div>
                    )}

                    <button
                      type="button"
                      className="mt-2 text-2xs text-primary hover:underline"
                      onClick={() =>
                        setSelectedKey(
                          selectedKey === model.model_key ? null : model.model_key,
                        )
                      }
                    >
                      {selectedKey === model.model_key ? "Hide" : "Show"} version history
                    </button>
                  </div>

                  <div className="flex shrink-0 gap-2">
                    {model.status === "TRAINED" && (
                      <button
                        type="button"
                        className="btn-success btn-sm"
                        onClick={() => promoteMutation.mutate(model.id)}
                        disabled={promoteMutation.isPending}
                      >
                        <CheckCircle2 size={13} aria-hidden /> Promote
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn-secondary btn-sm"
                      onClick={() => trainMutation.mutate(model.model_key)}
                      disabled={trainMutation.isPending || statsQuery.isLoading || !stats?.ready_to_train}
                      title={
                        statsQuery.isLoading
                          ? "Loading correction stats…"
                          : !stats?.ready_to_train
                          ? "Need at least 500 unused corrections to train"
                          : "Queue a new training run"
                      }
                    >
                      <Play size={13} aria-hidden />
                      {statsQuery.isLoading ? "Loading…" : "Train"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* History chart */}
        <div className="space-y-3">
          <Card
            title={selectedKey ? `${selectedKey} — accuracy history` : "Version history"}
            subtitle="Select a model to see accuracy over versions"
          >
            {!selectedKey ? (
              <EmptyState title="Pick a model" icon={TrendingUp} />
            ) : historyQuery.isLoading ? (
              <LoadingState />
            ) : historyQuery.data?.series.length ? (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={historyQuery.data.series}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="rgb(var(--bhumi-border))"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="version"
                    tick={{ fontSize: 10, fill: "rgb(var(--bhumi-muted))" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    domain={[0.8, 1]}
                    tick={{ fontSize: 10, fill: "rgb(var(--bhumi-muted))" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
                  />
                  <Tooltip
                    formatter={(value: number) => `${(value * 100).toFixed(2)}%`}
                  />
                  <Line
                    type="monotone"
                    dataKey="field_f1"
                    name="Field F1"
                    stroke="rgb(var(--bhumi-success))"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState title="No history yet" />
            )}
          </Card>

          {stats?.by_field.length ? (
            <Card title="Most-corrected fields (90d)" subtitle="Where verifiers make the most edits">
              <ul className="space-y-1.5">
                {stats.by_field.slice(0, 8).map((row) => (
                  <li key={row.field} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-xs text-ink">
                      {row.field}
                    </span>
                    <span className="shrink-0 tabular-nums text-sm font-semibold text-muted">
                      {row.count}
                    </span>
                    <div className="w-20">
                      <ProgressBar
                        value={(row.count / (stats.by_field[0]?.count ?? 1)) * 100}
                        tone="warn"
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}

function StatusBadge({ status }: { status: string }) {
  const meta: Record<string, string> = {
    ACTIVE:  "bg-success-soft text-success",
    TRAINED: "bg-info-soft text-info",
    CANARY:  "bg-warn-soft text-warn",
    STAGING: "bg-warn-soft text-warn",
    RETIRED: "bg-surface-2 text-muted border border-line",
  };
  return (
    <span className={`pill ${meta[status] ?? "bg-surface-2 text-muted"}`}>
      {status.toLowerCase()}
    </span>
  );
}
