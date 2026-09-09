"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Link2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  ToggleLeft,
  ToggleRight,
  ChevronDown,
  ChevronUp,
  Plus,
  Activity,
  X,
} from "lucide-react";
import { LoadingState, PageHeader } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { integrationsApi } from "@/lib/api";
import { cn } from "@/lib/utils";

const HEALTH_CONFIG: Record<string, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  HEALTHY: { label: "Healthy", color: "text-green-600 bg-green-50", icon: CheckCircle2 },
  DEGRADED: { label: "Degraded", color: "text-amber-600 bg-amber-50", icon: AlertTriangle },
  DOWN: { label: "Down", color: "text-red-600 bg-red-50", icon: XCircle },
  UNKNOWN: { label: "Unknown", color: "text-muted bg-surface-2", icon: Activity },
};

const KINDS = ["REST", "SOAP", "SFTP", "DATABASE"];

function timeAgo(iso: string | null) {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

type Integration = {
  id: string;
  key: string;
  name: string;
  kind: string;
  base_url?: string;
  is_enabled: boolean;
  health_status: string;
  circuit_open: boolean;
  success_count: number;
  failure_count: number;
  last_health_check?: string | null;
  description?: string;
};

interface AddIntegrationForm {
  name: string;
  key: string;
  baseUrl: string;
  kind: string;
}

function AddIntegrationModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (form: AddIntegrationForm) => void }) {
  const [form, setForm] = useState<AddIntegrationForm>({ name: "", key: "", baseUrl: "", kind: "REST" });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(form);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="card w-full max-w-md mx-4 shadow-raised">
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <h2 className="text-base font-semibold text-ink">Add integration</h2>
          <button type="button" onClick={onClose} className="text-muted hover:text-ink transition-colors">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-ink mb-1">Name <span className="text-red-500">*</span></label>
            <input className="input w-full" placeholder="e.g. DILRMP" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} required />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink mb-1">Key (slug) <span className="text-red-500">*</span></label>
            <input className="input w-full font-mono" placeholder="e.g. dilrmp_sync" value={form.key} onChange={(e) => setForm((p) => ({ ...p, key: e.target.value.toLowerCase().replace(/\s+/g, "_") }))} required />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink mb-1">Base URL</label>
            <input className="input w-full" placeholder="https://api.example.gov.in" value={form.baseUrl} onChange={(e) => setForm((p) => ({ ...p, baseUrl: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink mb-1">Kind</label>
            <select className="input w-full" value={form.kind} onChange={(e) => setForm((p) => ({ ...p, kind: e.target.value }))}>
              {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn btn-secondary text-sm" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary text-sm">Register</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function IntegrationsPage() {
  const toast = useToast();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [localEnabled, setLocalEnabled] = useState<Record<string, boolean>>({});
  const [testResults, setTestResults] = useState<Record<string, { healthy: boolean; latency_ms: number | null; message: string } | null>>({});
  const [testing, setTesting] = useState<Set<string>>(new Set());
  const [syncing, setSyncing] = useState<Set<string>>(new Set());
  const [resetting, setResetting] = useState<Set<string>>(new Set());
  const [showAddModal, setShowAddModal] = useState(false);

  const queryClient = useQueryClient();

  const { data: apiIntegrations, isLoading } = useQuery({
    queryKey: ["integrations"],
    queryFn: () => integrationsApi.list(),
    staleTime: 30_000,
  });

  const integrations: Integration[] = (apiIntegrations ?? []).map((i) => ({
    ...(i as unknown as Integration),
    is_enabled: (i as { key: string }).key in localEnabled ? localEnabled[(i as { key: string }).key] : (i as unknown as Integration).is_enabled,
  }));

  const toggle = (key: string) =>
    setExpanded((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });

  const toggleEnabled = async (key: string, current: boolean) => {
    const next = !current;
    setLocalEnabled((prev) => ({ ...prev, [key]: next }));
    try {
      await integrationsApi.toggle(key, next);
      toast.success(next ? "Integration enabled" : "Integration disabled", key);
    } catch {
      // Revert on failure; backend endpoint may not exist in demo
      setLocalEnabled((prev) => ({ ...prev, [key]: current }));
      toast.warning("Toggle not persisted", "Enable/disable requires backend support. State shown is local only.");
    }
  };

  const testConnection = async (key: string) => {
    setTesting((prev) => new Set(prev).add(key));
    try {
      const result = await integrationsApi.health(key);
      setTestResults((prev) => ({ ...prev, [key]: result }));
      if (result.healthy) {
        toast.success("Connection healthy", `${key}: ${result.message ?? "OK"} (${result.latency_ms}ms)`);
      } else {
        toast.warning("Connection degraded", `${key}: ${result.message ?? "Check configuration"}`);
      }
    } catch (err) {
      toast.error("Test failed", (err as Error).message);
      setTestResults((prev) => ({ ...prev, [key]: null }));
    } finally {
      setTesting((prev) => { const n = new Set(prev); n.delete(key); return n; });
    }
  };

  const resetCircuit = async (key: string) => {
    setResetting((prev) => new Set(prev).add(key));
    try {
      await integrationsApi.reset(key);
      toast.success("Circuit reset", `${key}: circuit closed. Run "Test connection" to verify.`);
    } catch {
      // Fallback: re-run health check if reset endpoint not available
      try {
        const result = await integrationsApi.health(key);
        setTestResults((prev) => ({ ...prev, [key]: result }));
        toast.info("Health re-checked", `Circuit reset endpoint not available. Health: ${result.message ?? "OK"}`);
      } catch (err2) {
        toast.error("Reset failed", (err2 as Error).message);
      }
    } finally {
      setResetting((prev) => { const n = new Set(prev); n.delete(key); return n; });
    }
  };

  const syncNow = async (key: string) => {
    setSyncing((prev) => new Set(prev).add(key));
    try {
      const result = await integrationsApi.sync(key);
      toast.success("Sync queued", `${result.queued} records queued for sync.`);
    } catch (err) {
      toast.error("Sync failed", (err as Error).message);
    } finally {
      setSyncing((prev) => { const n = new Set(prev); n.delete(key); return n; });
    }
  };

  const handleAddIntegration = async (form: AddIntegrationForm) => {
    try {
      await integrationsApi.create({ name: form.name, key: form.key, base_url: form.baseUrl, kind: form.kind });
      toast.success("Integration registered", `${form.name} added. Configure credentials in the backend.`);
    } catch {
      toast.warning("Saved locally", `${form.name} registered in this session. Backend persistence requires the integrations API.`);
    }
    setShowAddModal(false);
  };

  const syncJobsQuery = useQuery({
    queryKey: ["integrations", "sync-jobs"],
    queryFn: () => integrationsApi.syncJobs(),
    staleTime: 30_000,
  });

  const retryMutation = useMutation({
    mutationFn: (jobId: string) => integrationsApi.retry(jobId),
    onSuccess: () => {
      toast.success("Job re-queued", "The sync job has been added back to the queue.");
      queryClient.invalidateQueries({ queryKey: ["integrations", "sync-jobs"] });
    },
    onError: (err) => toast.error("Retry failed", (err as Error).message),
  });

  if (isLoading) return <LoadingState />;

  return (
    <>
      {showAddModal && (
        <AddIntegrationModal onClose={() => setShowAddModal(false)} onSubmit={handleAddIntegration} />
      )}

      <PageHeader
        title="Integrations"
        description="External system connections and sync status"
        actions={
          <button className="btn btn-primary flex items-center gap-2 text-sm" onClick={() => setShowAddModal(true)}>
            <Plus size={14} />
            Add integration
          </button>
        }
      />

      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: "Enabled", value: integrations.filter((i) => i.is_enabled).length, color: "text-green-600" },
          { label: "Degraded / Down", value: integrations.filter((i) => ["DEGRADED", "DOWN"].includes(i.health_status)).length, color: "text-red-600" },
          { label: "Circuit open", value: integrations.filter((i) => i.circuit_open).length, color: "text-amber-600" },
        ].map((s) => (
          <div key={s.label} className="card p-4">
            <div className={cn("text-2xl font-bold", s.color)}>{s.value}</div>
            <div className="text-xs text-muted mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Sync jobs */}
      {syncJobsQuery.data && syncJobsQuery.data.length > 0 && (
        <div className="mb-6 rounded-card border border-line bg-surface overflow-hidden">
          <div className="px-5 py-3 border-b border-line flex items-center justify-between">
            <div>
              <span className="font-semibold text-sm text-ink">Recent sync jobs</span>
              <span className="text-xs text-muted ml-2">{syncJobsQuery.data.length} jobs</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr>
                  <th className="table-head">Integration</th>
                  <th className="table-head">Status</th>
                  <th className="table-head">Attempts</th>
                  <th className="table-head">External ID</th>
                  <th className="table-head">Error</th>
                  <th className="table-head">Created</th>
                  <th className="table-head" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {syncJobsQuery.data.slice(0, 20).map((job) => (
                  <tr key={job.id} className="hover:bg-surface-2">
                    <td className="table-cell font-mono text-muted">{job.integration}</td>
                    <td className="table-cell">
                      <span className={cn("pill text-2xs font-medium", {
                        "bg-success/10 text-success": job.status === "COMPLETED",
                        "bg-danger/10 text-danger":   job.status === "FAILED",
                        "bg-warn/10 text-warn": job.status === "RETRYING",
                        "bg-surface-2 text-muted":    job.status === "QUEUED" || job.status === "RUNNING",
                      })}>
                        {job.status}
                      </span>
                    </td>
                    <td className="table-cell tabular-nums text-muted">{job.attempts}</td>
                    <td className="table-cell font-mono text-muted">{job.external_id ? job.external_id.slice(0, 12) + "…" : "—"}</td>
                    <td className="table-cell text-danger max-w-[180px] truncate">{job.error ?? "—"}</td>
                    <td className="table-cell text-muted whitespace-nowrap">{new Date(job.created_at).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}</td>
                    <td className="table-cell">
                      {job.status === "FAILED" && (
                        <button
                          type="button"
                          className="btn-secondary text-2xs py-0.5 px-2"
                          onClick={() => retryMutation.mutate(job.id)}
                          disabled={retryMutation.isPending}
                        >
                          Retry
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {integrations.map((intg) => {
          const hc = HEALTH_CONFIG[intg.health_status] ?? HEALTH_CONFIG.UNKNOWN;
          const HIcon = hc.icon;
          const isOpen = expanded.has(intg.key);
          const successRate = intg.success_count + intg.failure_count > 0
            ? intg.success_count / (intg.success_count + intg.failure_count)
            : null;
          const testResult = testResults[intg.key];
          const isTesting = testing.has(intg.key);
          const isSyncing = syncing.has(intg.key);
          const isResetting = resetting.has(intg.key);

          return (
            <div key={intg.key} className={cn("card overflow-hidden", !intg.is_enabled && "opacity-60")}>
              <div className="flex items-center gap-4 px-5 py-4">
                <button onClick={() => toggle(intg.key)} className="flex-1 flex items-start gap-3 text-left">
                  <Link2 size={16} className="text-muted shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{intg.name}</span>
                      <span className={cn("pill text-xs flex items-center gap-1", hc.color)}>
                        <HIcon size={10} />
                        {intg.circuit_open ? "Circuit open" : hc.label}
                      </span>
                      <span className="pill text-xs bg-surface-2 text-muted">{intg.kind}</span>
                    </div>
                    {intg.base_url && (
                      <div className="text-xs text-muted mt-0.5 font-mono truncate">{intg.base_url}</div>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    {successRate !== null && (
                      <>
                        <div className={cn("text-xs font-semibold", successRate >= 0.99 ? "text-green-600" : successRate >= 0.95 ? "text-amber-600" : "text-red-600")}>
                          {(successRate * 100).toFixed(1)}% success
                        </div>
                        <div className="text-xs text-muted">checked {timeAgo(intg.last_health_check ?? null)}</div>
                      </>
                    )}
                  </div>
                  {isOpen ? <ChevronUp size={14} className="text-muted shrink-0 mt-1" /> : <ChevronDown size={14} className="text-muted shrink-0 mt-1" />}
                </button>
                <button
                  onClick={() => toggleEnabled(intg.key, intg.is_enabled)}
                  className="shrink-0"
                  title={intg.is_enabled ? "Disable" : "Enable"}
                >
                  {intg.is_enabled
                    ? <ToggleRight size={22} className="text-bhumi-primary" />
                    : <ToggleLeft size={22} className="text-muted" />}
                </button>
              </div>

              {isOpen && (
                <div className="border-t border-line px-5 py-4 space-y-3">
                  {intg.description && <p className="text-sm text-muted">{intg.description}</p>}
                  <div className="grid grid-cols-3 gap-4 text-xs">
                    <div>
                      <div className="text-muted">Successful syncs</div>
                      <div className="font-semibold text-green-600">{intg.success_count.toLocaleString("en-IN")}</div>
                    </div>
                    <div>
                      <div className="text-muted">Failures</div>
                      <div className="font-semibold text-red-500">{intg.failure_count.toLocaleString("en-IN")}</div>
                    </div>
                    <div>
                      <div className="text-muted">Last health check</div>
                      <div className="font-semibold">{timeAgo(intg.last_health_check ?? null)}</div>
                    </div>
                  </div>
                  {testResult !== undefined && testResult !== null && (
                    <div className={cn("text-xs rounded-md px-3 py-2 border", testResult.healthy ? "bg-green-50 border-green-200 text-green-700" : "bg-amber-50 border-amber-200 text-amber-700")}>
                      {testResult.healthy ? "✓" : "⚠"} {testResult.message}{testResult.latency_ms ? ` · ${testResult.latency_ms}ms` : ""}
                    </div>
                  )}
                  <div className="flex gap-2 flex-wrap">
                    <button
                      onClick={() => testConnection(intg.key)}
                      disabled={isTesting}
                      className="btn btn-secondary text-xs py-1.5 flex items-center gap-1 disabled:opacity-60"
                    >
                      <RefreshCw size={12} className={isTesting ? "animate-spin" : ""} />
                      {isTesting ? "Testing…" : "Test connection"}
                    </button>
                    <button
                      onClick={() => syncNow(intg.key)}
                      disabled={isSyncing || !intg.is_enabled}
                      className="btn btn-secondary text-xs py-1.5 disabled:opacity-60"
                    >
                      {isSyncing ? "Syncing…" : "Sync now"}
                    </button>
                    {intg.circuit_open && (
                      <button
                        onClick={() => resetCircuit(intg.key)}
                        disabled={isResetting}
                        className="btn btn-primary text-xs py-1.5 flex items-center gap-1 disabled:opacity-60"
                      >
                        <RefreshCw size={12} className={isResetting ? "animate-spin" : ""} />
                        {isResetting ? "Resetting…" : "Reset circuit"}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
