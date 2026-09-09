"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { CheckCircle2, Download, RefreshCw, ShieldCheck, XCircle } from "lucide-react";

import { Card, EmptyState, PageHeader, SkeletonRows } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { vaultApi } from "@/lib/api";
import { useTranslate } from "@/lib/preferences";
import type { AuditEntry } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

type DaysFilter = 7 | 30 | 90;

function exportCsv(entries: AuditEntry[]) {
  if (!entries?.length) return;
  const header = ["ID", "When", "Actor", "IP", "Action", "Entity Type", "Entity ID", "Hash"];
  const rows = entries.map((e) => [
    e.id,
    e.at,
    e.actor ?? "system",
    e.actor_ip ?? "",
    e.action,
    e.entity_type ?? "",
    e.entity_id ?? "",
    e.chain_hash,
  ]);
  const csv = [header, ...rows]
    .map((r) => r.map(String).map((v) => `"${v.replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "bhumi_audit.csv"; a.click();
  URL.revokeObjectURL(url);
}

export default function AuditPage() {
  const t = useTranslate();
  const toast = useToast();
  const [action, setAction] = useState("");
  const [actor, setActor] = useState("");
  const [days, setDays] = useState<DaysFilter>(30);

  const { data: entries, isLoading } = useQuery({
    queryKey: ["audit", action, actor, days],
    queryFn: () => vaultApi.audit({ action: action || undefined, actor: actor || undefined, page_size: 50, days }),
    staleTime: 15_000,
  });

  const { data: summary } = useQuery({
    queryKey: ["audit", "summary", days],
    queryFn: () => vaultApi.auditSummary(days),
    staleTime: 60_000,
  });

  const { data: vaultStats } = useQuery({
    queryKey: ["vault", "stats"],
    queryFn: () => vaultApi.stats(),
    staleTime: 120_000,
  });

  const verifyMutation = useMutation({
    mutationFn: () => vaultApi.verifyChain(),
    onSuccess: (result) => {
      const intact = result.intact ?? false;
      const checked = result.checked ?? 0;
      if (intact) {
        toast.success(t("chainVerified"), `Checked ${checked} entries. Chain is intact.`);
      } else {
        toast.error(t("chainBroken"), result.broken_at_id ? `Broken at entry ${result.broken_at_id}.` : "Chain integrity check failed.");
      }
    },
    onError: (err) => toast.error("Verification failed", (err as Error).message),
  });

  const DAY_OPTIONS: DaysFilter[] = [7, 30, 90];

  return (
    <>
      <PageHeader
        title={t("auditTitle")}
        description={t("auditDesc")}
        breadcrumbs={[{ label: "Admin" }, { label: t("audit") }]}
        actions={
          <div className="flex gap-2">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => exportCsv(entries ?? [])}
              disabled={!entries?.length}
            >
              <Download size={14} aria-hidden /> Export CSV
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => verifyMutation.mutate()}
              disabled={verifyMutation.isPending}
            >
              {verifyMutation.isPending ? <RefreshCw size={14} className="animate-spin" aria-hidden /> : <ShieldCheck size={14} aria-hidden />}
              {" "}{verifyMutation.isSuccess ? t("chainVerified") : "Verify chain"}
            </button>
          </div>
        }
      />

      {/* Date range filter */}
      <div className="mb-4 flex items-center gap-2">
        <span className="text-xs text-muted font-medium">Period:</span>
        {DAY_OPTIONS.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDays(d)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium border transition-colors ${
              days === d
                ? "bg-primary text-primary-fg border-primary"
                : "bg-surface border-line text-muted hover:text-ink"
            }`}
          >
            Last {d} days
          </button>
        ))}
      </div>

      {summary && (
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <div className="card px-4 py-3">
            <p className="text-2xs uppercase tracking-wider text-muted">Total entries ({days}d)</p>
            <p className="mt-1.5 text-2xl font-bold tabular-nums text-ink">{summary.total_entries.toLocaleString("en-IN")}</p>
          </div>
          <div className="card px-4 py-3">
            <p className="text-2xs uppercase tracking-wider text-muted">Failed logins ({days}d)</p>
            <p className={`mt-1.5 text-2xl font-bold tabular-nums ${summary.failed_logins > 0 ? "text-danger" : "text-success"}`}>{summary.failed_logins}</p>
          </div>
          <div className="card px-4 py-3">
            <p className="text-2xs uppercase tracking-wider text-muted">Chain status</p>
            <p className="mt-1.5 flex items-center gap-2 text-sm font-semibold">
              {verifyMutation.data ? (
                (verifyMutation.data.intact ?? false)
                  ? <><CheckCircle2 size={18} className="text-success" aria-hidden /> {t("chainVerified")}</>
                  : <><XCircle size={18} className="text-danger" aria-hidden /> {t("chainBroken")}</>
              ) : (
                <span className="text-muted">Not checked this session</span>
              )}
            </p>
          </div>
        </div>
      )}

      {vaultStats && (
        <div className="mb-6 grid gap-3 sm:grid-cols-4">
          {[
            { label: "Documents stored",      value: vaultStats.documents_stored.toLocaleString("en-IN"),  sub: "Total in secure vault" },
            { label: "Pages stored",          value: vaultStats.pages_stored.toLocaleString("en-IN"),      sub: "Individual scanned pages" },
            { label: "Storage used",          value: `${vaultStats.storage_gb.toFixed(1)} GB`,             sub: "Encrypted at rest" },
            { label: "Duplicates prevented",  value: vaultStats.duplicates_prevented.toLocaleString("en-IN"), sub: "Via dedup engine" },
          ].map((s) => (
            <div key={s.label} className="card px-4 py-3">
              <p className="text-2xs uppercase tracking-wider text-muted">{s.label}</p>
              <p className="mt-1.5 text-xl font-bold tabular-nums text-ink">{s.value}</p>
              <p className="text-2xs text-muted/70 mt-0.5">{s.sub}</p>
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[1fr_280px]">
        <Card
          title="Event log"
          subtitle="Most recent first"
          action={
            <div className="flex gap-2">
              <input className="input py-1 text-xs w-32" placeholder={t("auditAction")} value={action} onChange={(e) => setAction(e.target.value)} />
              <input className="input py-1 text-xs w-32" placeholder={t("auditActor")}  value={actor}  onChange={(e) => setActor(e.target.value)} />
            </div>
          }
          bodyClassName="p-0"
        >
          {isLoading ? (
            <div className="p-4"><SkeletonRows rows={10} /></div>
          ) : !entries?.length ? (
            <EmptyState title="No entries" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="table-head">#</th>
                    <th className="table-head">When</th>
                    <th className="table-head">{t("auditActor")}</th>
                    <th className="table-head">{t("auditAction")}</th>
                    <th className="table-head">{t("auditEntity")}</th>
                    <th className="table-head">{t("auditHash")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {entries.map((entry) => (
                    <tr key={entry.id} className="hover:bg-surface-2">
                      <td className="table-cell tabular-nums text-muted text-2xs">{entry.id}</td>
                      <td className="table-cell text-xs text-muted whitespace-nowrap">{formatDateTime(entry.at)}</td>
                      <td className="table-cell">
                        <p className="text-sm text-ink">{entry.actor ?? "system"}</p>
                        {entry.actor_ip && <p className="text-2xs text-muted font-mono">{entry.actor_ip}</p>}
                      </td>
                      <td className="table-cell">
                        <span className="pill bg-surface-2 text-ink border border-line font-mono text-2xs">{entry.action}</span>
                      </td>
                      <td className="table-cell text-xs text-muted">
                        {entry.entity_type}
                        {entry.entity_id && <span className="ml-1 font-mono text-2xs opacity-60">{entry.entity_id.slice(0, 8)}</span>}
                      </td>
                      <td className="table-cell">
                        <span className="id-text text-2xs text-muted opacity-70">{entry.chain_hash.slice(0, 12)}…</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {summary?.by_action && (
          <Card title={`Top actions (${days}d)`}>
            <ul className="space-y-1.5">
              {summary.by_action.slice(0, 12).map((row) => (
                <li key={row.action} className="flex items-center justify-between gap-2">
                  <span className="truncate font-mono text-xs text-ink">{row.action}</span>
                  <span className="shrink-0 tabular-nums text-sm font-semibold text-muted">{row.count.toLocaleString("en-IN")}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </>
  );
}
