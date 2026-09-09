"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, AlertTriangle, CheckCircle2, Info, X, Clock, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/ui/primitives";
import { useTranslate } from "@/lib/preferences";
import { cn } from "@/lib/utils";
import { notificationsApi } from "@/lib/api";

interface Notification {
  id: string;
  title: string;
  body: string;
  link?: string | null;
  severity: string;
  read_at: string | null;
  created_at: string;
}

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

export default function NotificationsPage() {
  const t = useTranslate();
  const router = useRouter();
  const [notes, setNotes]     = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [filter, setFilter]   = useState<"ALL" | "UNREAD">("ALL");

  useEffect(() => {
    setLoading(true);
    notificationsApi.list()
      .then((data) => setNotes(data as Notification[]))
      .catch(() => setError("Failed to load notifications. Please try again."))
      .finally(() => setLoading(false));
  }, []);

  const markAllRead = async () => {
    await notificationsApi.markAllRead();
    setNotes((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
  };

  const markRead = async (id: string) => {
    await notificationsApi.markRead(id);
    setNotes((prev) => prev.map((n) => n.id === id ? { ...n, read_at: n.read_at ?? new Date().toISOString() } : n));
  };

  const handleClick = async (n: Notification) => {
    if (!n.read_at) await markRead(n.id);
    if (n.link) router.push(n.link);
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

      {loading && (
        <div className="card p-12 flex items-center justify-center gap-2 text-muted">
          <Loader2 size={18} className="animate-spin" />
          <span className="text-sm">Loading notifications…</span>
        </div>
      )}

      {error && !loading && (
        <div className="card p-6 text-center">
          <p className="text-sm text-danger">{error}</p>
        </div>
      )}

      {!loading && !error && displayed.length === 0 && (
        <div className="card p-12 text-center">
          <Bell size={32} className="mx-auto text-muted mb-3 opacity-30" />
          <p className="text-muted text-sm">{t("noNotifications")}</p>
        </div>
      )}

      {!loading && !error && (
        <div className="space-y-2">
          {displayed.map((n) => {
            const sc = SEVERITY_CONFIG[n.severity] ?? SEVERITY_CONFIG.INFO;
            const Icon = sc.icon;
            const isUnread = !n.read_at;
            return (
              <div
                key={n.id}
                onClick={() => handleClick(n)}
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
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
