"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Copy,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Search,
  MapPin,
} from "lucide-react";
import { LoadingState, PageHeader } from "@/components/ui/primitives";
import Link from "next/link";
import { useToast } from "@/components/ui/Toast";
import { validationApi } from "@/lib/api";
import { cn } from "@/lib/utils";

const MATCH_LABELS: Record<string, string> = {
  EXACT_SURVEY: "Exact survey match",
  FUZZY_OWNER: "Fuzzy owner match",
  FUZZY_NAME_AREA: "Fuzzy name + area",
  CADASTRAL_OVERLAP: "Cadastral overlap",
};

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  OPEN: { label: "Open", color: "text-amber-600 bg-amber-50" },
  RESOLVED: { label: "Resolved", color: "text-green-600 bg-green-50" },
  FALSE_POSITIVE: { label: "False positive", color: "text-muted bg-surface-2" },
};

type DuplicateCluster = {
  id: string;
  cluster_key: string;
  match_type: string;
  score: number;
  record_ids: string[];
};

export default function DuplicatesPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // Track resolution status locally after mutations since API returns flat data
  const [localStatus, setLocalStatus] = useState<Record<string, string>>({});

  const { data: clusters, isLoading } = useQuery({
    queryKey: ["duplicates"],
    queryFn: () => validationApi.duplicates(),
    staleTime: 60_000,
  });

  const resolveMutation = useMutation({
    mutationFn: ({ clusterId, payload }: { clusterId: string; payload: unknown }) =>
      validationApi.resolveDuplicate(clusterId, payload),
    onSuccess: (_, { clusterId, payload }) => {
      const resolution = (payload as { resolution: string }).resolution;
      setLocalStatus((prev) => ({ ...prev, [clusterId]: resolution === "FALSE_POSITIVE" ? "FALSE_POSITIVE" : "RESOLVED" }));
      toast.success("Cluster resolved", "Duplicate cluster has been marked as " + (resolution === "FALSE_POSITIVE" ? "false positive" : "resolved") + ".");
      queryClient.invalidateQueries({ queryKey: ["duplicates"] });
    },
    onError: (err) => {
      toast.error("Could not resolve", (err as Error).message);
    },
  });

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const enriched = (clusters ?? []).map((c: DuplicateCluster) => ({
    ...c,
    // localStatus overrides API status after user action; fall back to API status if present
    status: localStatus[c.id] ?? (c as DuplicateCluster & { status?: string }).status ?? "OPEN",
  }));

  const filtered = enriched.filter((c) => {
    const q = search.toLowerCase();
    const matchSearch = c.cluster_key.toLowerCase().includes(q) ||
      c.record_ids.some((id: string) => id.toLowerCase().includes(q));
    const matchStatus = statusFilter === "ALL" || c.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const openCount = enriched.filter((c) => c.status === "OPEN").length;
  const resolvedCount = enriched.filter((c) => c.status === "RESOLVED").length;

  if (isLoading) return <LoadingState />;

  return (
    <>
      <PageHeader
        title="Duplicate Clusters"
        description="Potential duplicate land records identified by AI"
      />

      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: "Open", value: openCount, color: "text-amber-600" },
          { label: "Resolved", value: resolvedCount, color: "text-green-600" },
          { label: "Total clusters", value: enriched.length, color: "text-ink" },
        ].map((s) => (
          <div key={s.label} className="card p-4">
            <div className={cn("text-2xl font-bold", s.color)}>{s.value}</div>
            <div className="text-xs text-muted mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            className="input pl-8 w-full"
            placeholder="Search clusters…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-1">
          {["ALL", "OPEN", "RESOLVED", "FALSE_POSITIVE"].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                "px-3 py-1.5 rounded-md text-xs font-medium border transition-colors",
                statusFilter === s
                  ? "bg-bhumi-primary text-white border-bhumi-primary"
                  : "bg-surface border-line text-muted hover:text-ink"
              )}
            >
              {s === "ALL" ? "All" : STATUS_CONFIG[s]?.label ?? s}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {filtered.length === 0 && (
          <div className="card p-8 text-center text-muted text-sm">No clusters match your filter.</div>
        )}
        {filtered.map((cluster) => {
          const open = expanded.has(cluster.id);
          const sc = STATUS_CONFIG[cluster.status];
          const isPending = resolveMutation.isPending && resolveMutation.variables?.clusterId === cluster.id;
          return (
            <div key={cluster.id} className="card overflow-hidden">
              <button
                onClick={() => toggle(cluster.id)}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-surface-2 transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <Copy size={16} className="text-muted shrink-0" />
                  <div>
                    <div className="font-medium text-ink text-sm font-mono">{cluster.cluster_key}</div>
                    <div className="text-xs text-muted mt-0.5">
                      {MATCH_LABELS[cluster.match_type] ?? cluster.match_type} ·{" "}
                      {cluster.record_ids.length} records · similarity {(cluster.score * 100).toFixed(0)}%
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={cn("pill text-xs", sc?.color)}>{sc?.label}</span>
                  {open ? <ChevronUp size={15} className="text-muted" /> : <ChevronDown size={15} className="text-muted" />}
                </div>
              </button>

              {open && (
                <div className="border-t border-line px-5 py-4">
                  <div className="text-xs text-muted mb-3 font-medium uppercase tracking-wide">Member records</div>
                  <div className="space-y-2">
                    {cluster.record_ids.map((rid: string, idx: number) => (
                      <div
                        key={rid}
                        className={cn(
                          "flex items-center justify-between rounded-lg px-4 py-3 border",
                          idx === 0 ? "border-bhumi-primary/30 bg-bhumi-primary/5" : "border-line bg-surface"
                        )}
                      >
                        <div className="flex items-center gap-3">
                          {idx === 0
                            ? <span title="Primary record"><CheckCircle2 size={14} className="text-bhumi-primary shrink-0" /></span>
                            : <span title="Duplicate candidate"><AlertTriangle size={14} className="text-amber-500 shrink-0" /></span>
                          }
                          <div>
                            <Link href={`/records/${rid}`} className="font-medium text-sm font-mono hover:text-primary hover:underline">{rid}</Link>
                            <div className="text-xs text-muted flex items-center gap-1 mt-0.5">
                              <MapPin size={10} />
                              Click to open record
                            </div>
                          </div>
                        </div>
                        {idx === 0 && (
                          <span className="text-xs text-bhumi-primary font-medium">Primary</span>
                        )}
                      </div>
                    ))}
                  </div>
                  {cluster.status === "OPEN" && (
                    <div className="flex gap-2 mt-4">
                      <button
                        disabled={isPending}
                        onClick={() => resolveMutation.mutate({ clusterId: cluster.id, payload: { resolution: "MERGE", primary_record_id: cluster.record_ids[0] } })}
                        className="btn btn-primary text-xs py-1.5 disabled:opacity-60"
                      >
                        {isPending ? "Resolving…" : "Mark primary & merge"}
                      </button>
                      <button
                        disabled={isPending}
                        onClick={() => resolveMutation.mutate({ clusterId: cluster.id, payload: { resolution: "FALSE_POSITIVE" } })}
                        className="btn btn-secondary text-xs py-1.5 disabled:opacity-60"
                      >
                        Mark as false positive
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
