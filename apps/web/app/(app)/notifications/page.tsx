"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, AlertTriangle, CheckCircle2, Info, X, Clock } from "lucide-react";
import { PageHeader } from "@/components/ui/primitives";
import { useTranslate } from "@/lib/preferences";
import { cn } from "@/lib/utils";

const MOCK_NOTIFICATIONS = [
  { id: "n-001", title: "Record approved",           body: "Land record for Ramesh Kumar (Survey 142/3, Sanganer) has been approved and published.", link: "/records",           severity: "SUCCESS", read_at: null,                    created_at: "2026-09-06T08:15:00Z" },
  { id: "n-002", title: "SLA breach warning",        body: "12 records in the PRIORITY queue are at risk of breaching their 24-hour SLA. Immediate action required.", link: "/review",    severity: "WARNING", read_at: null,                    created_at: "2026-09-06T07:30:00Z" },
  { id: "n-003", title: "Batch processing complete", body: "Batch UP/2025/K/0019 has finished processing. 512 documents ready for review.", link: "/batches",           severity: "INFO",    read_at: null,                    created_at: "2026-09-05T18:00:00Z" },
  { id: "n-004", title: "Duplicate cluster detected",body: "A potential duplicate was found for survey number 31 in Berasia, Bhopal. Please review.", link: "/duplicates",      severity: "WARNING", read_at: "2026-09-05T14:00:00Z", created_at: "2026-09-05T13:45:00Z" },
  { id: "n-005", title: "New model version promoted",body: "OCR model bhumi-ocr-hi-v2.4 has been promoted to production at 100% traffic.", link: "/admin/models",   severity: "INFO",    read_at: "2026-09-04T10:00:00Z", created_at: "2026-09-04T09:55:00Z" },
  { id: "n-006", title: "Integration circuit open",  body: "The DILRMP sync integration has entered circuit-open state after 5 consecutive failures.", link: "/admin/integrations", severity: "ERROR",   read_at: "2026-09-03T16:00:00Z", created_at: "2026-09-03T15:50:00Z" },
];

const SEVERITY_CONFIG: Record<string, { color: string; bg: string; icon: typeof Info }> = {
  SUCCESS: { color: "text-green-600", bg: "bg-green-50 border-green-200",   icon: CheckCircle2 },
  INFO:    { color: "text-blue-600",  bg: "bg-blue-50 border-blue-200",     icon: Info },
  WARNING: { color: "text-amber-600", bg: "bg-amber-50 border-amber-200",   icon: AlertTriangle },
  ERROR:   { color: "text-red-600",   bg: "bg-red-50 border-red-200",       icon: AlertTriangle },
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const LS_KEY = "bhumi.notifications";

function loadState(): { readIds: string[]; dismissedIds: string[] } {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : { readIds: [], dismissedIds: [] };
  } catch { return { readIds: [], dismissedIds: [] }; }
}

function saveState(readIds: string[], dismissedIds: string[]) {
  try { localStorage.setItem(LS_KEY, JSON.stringify({ readIds, dismissedIds })); } catch {}
}

export default function NotificationsPage() {
  const t = useTranslate();
  const router = useRouter();
  const [notes, setNotes] = useState(() => {
    const state = loadState();
    return MOCK_NOTIFICATIONS
      .filter((n) => !state.dismissedIds.includes(n.id))
      .map((n) => state.readIds.includes(n.id) ? { ...n, read_at: n.read_at ?? new Date().toISOString() } : n);
  });
  const [filter, setFilter] = useState<"ALL" | "UNREAD">("ALL");

  const markAllRead = () =>
    setNotes((prev) => {
      const updated = prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() }));
      saveState(updated.map((n) => n.id), []);
      return updated;
    });
  const dismiss = (id: string) => setNotes((prev) => {
    const next = prev.filter((n) => n.id !== id);
    const { readIds } = loadState();
    saveState(readIds, MOCK_NOTIFICATIONS.map((n) => n.id).filter((i) => !next.find((n) => n.id === i)));
    return next;
  });
  const markRead = (id: string) =>
    setNotes((prev) => {
      const updated = prev.map((n) => n.id === id ? { ...n, read_at: n.read_at ?? new Date().toISOString() } : n);
      const { dismissedIds } = loadState();
      saveState(updated.filter((n) => n.read_at).map((n) => n.id), dismissedIds);
      return updated;
    });

  const handleNotificationClick = (n: typeof notes[number]) => {
    markRead(n.id);
    if (n.link) {
      router.push(n.link);
    }
  };

  const displayed = filter === "UNREAD" ? notes.filter((n) => !n.read_at) : notes;
  const unreadCount = notes.filter((n) => !n.read_at).length;

  return (
    <>
      <PageHeader
        title={t("notificationsTitle")}
        description={`${unreadCount} unread notification${unreadCount !== 1 ? "s" : ""}`}
        actions={
          unreadCount > 0 ? (
            <button onClick={markAllRead} className="btn btn-secondary text-sm">
              {t("markAllRead")}
            </button>
          ) : undefined
        }
      />

      <div className="flex gap-2 mb-5">
        {(["ALL", "UNREAD"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "px-3 py-1.5 rounded-md text-xs font-medium border transition-colors",
              filter === f ? "bg-primary text-primary-fg border-primary" : "bg-surface border-line text-muted hover:text-ink"
            )}
          >
            {f === "ALL" ? t("allStatuses") : `Unread (${unreadCount})`}
          </button>
        ))}
      </div>

      {displayed.length === 0 && (
        <div className="card p-12 text-center">
          <Bell size={32} className="mx-auto text-muted mb-3 opacity-30" />
          <p className="text-muted text-sm">{t("noNotifications")}</p>
        </div>
      )}

      <div className="space-y-2">
        {displayed.map((n) => {
          const sc = SEVERITY_CONFIG[n.severity] ?? SEVERITY_CONFIG.INFO;
          const Icon = sc.icon;
          const isUnread = !n.read_at;
          return (
            <div
              key={n.id}
              onClick={() => handleNotificationClick(n)}
              className={cn(
                "card px-5 py-4 flex items-start gap-4 cursor-pointer transition-colors hover:bg-surface-2 border",
                isUnread ? "border-primary/20 bg-primary/3" : "border-line"
              )}
            >
              <div className={cn("p-2 rounded-lg shrink-0 mt-0.5 border", sc.bg)}>
                <Icon size={16} className={sc.color} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm text-ink">{n.title}</span>
                  {isUnread && <span className="w-2 h-2 rounded-full bg-primary shrink-0" />}
                </div>
                <p className="text-sm text-muted mt-0.5 leading-relaxed">{n.body}</p>
                <div className="flex items-center gap-1 mt-1.5 text-xs text-muted">
                  <Clock size={10} />
                  {timeAgo(n.created_at)}
                  {n.read_at && <span className="ml-2 text-muted/60">· Read {timeAgo(n.read_at)}</span>}
                </div>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); dismiss(n.id); }}
                className="text-muted hover:text-ink transition-colors shrink-0"
                title="Dismiss"
              >
                <X size={15} />
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}
