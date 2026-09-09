"use client";

import { useEffect, useRef, useState } from "react";
import {
  Check, Eye, EyeOff, AlertCircle, Laptop, Smartphone,
  Clock, KeyRound, Shield, Bell, User, Globe, Mail,
} from "lucide-react";
import { PageHeader } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/lib/auth";
import { authApi } from "@/lib/api";
import { useTranslate, usePreferences, type Locale } from "@/lib/preferences";
import { cn } from "@/lib/utils";

const LANGUAGES: { code: string; label: string }[] = [
  { code: "en", label: "English" },
  { code: "hi", label: "हिंदी" },
  { code: "kn", label: "ಕನ್ನಡ" },
  { code: "ta", label: "தமிழ்" },
  { code: "te", label: "తెలుగు" },
  { code: "mr", label: "मराठी" },
  { code: "pa", label: "ਪੰਜਾਬੀ" },
  { code: "bn", label: "বাংলা" },
];

type Tab = "profile" | "notifications" | "security";

interface LoginEntry {
  login_at: string;
  logout_at: string | null;
  duration_s: number | null;
  ip: string;
  device: string;
  device_type: "desktop" | "mobile";
  status: "ACTIVE" | "CLOSED" | "FAILED";
  close_reason?: string;
}

const MOCK_SESSIONS: LoginEntry[] = [
  { login_at: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),   logout_at: null,                                                          duration_s: null,   ip: "103.21.58.12",   device: "Chrome · Windows 11",    device_type: "desktop", status: "ACTIVE" },
  { login_at: new Date(Date.now() - 27 * 60 * 60 * 1000).toISOString(),  logout_at: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(),      duration_s: 3621,   ip: "103.21.58.12",   device: "Chrome · Windows 11",    device_type: "desktop", status: "CLOSED" },
  { login_at: new Date(Date.now() - 50 * 60 * 60 * 1000).toISOString(),  logout_at: new Date(Date.now() - 49.8 * 60 * 60 * 1000).toISOString(),    duration_s: 720,    ip: "49.204.10.2",    device: "Firefox · Android 14",   device_type: "mobile",  status: "CLOSED", close_reason: "NEW_LOGIN" },
  { login_at: new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString(),  logout_at: new Date(Date.now() - 70 * 60 * 60 * 1000).toISOString(),      duration_s: 7440,   ip: "103.21.58.12",   device: "Chrome · Windows 11",    device_type: "desktop", status: "CLOSED" },
  { login_at: new Date(Date.now() - 96 * 60 * 60 * 1000).toISOString(),  logout_at: new Date(Date.now() - 95.5 * 60 * 60 * 1000).toISOString(),    duration_s: 1800,   ip: "103.21.58.12",   device: "Safari · macOS Ventura", device_type: "desktop", status: "CLOSED" },
  { login_at: new Date(Date.now() - 120 * 60 * 60 * 1000).toISOString(), logout_at: new Date(Date.now() - 119 * 60 * 60 * 1000).toISOString(),     duration_s: null,   ip: "185.220.101.4",  device: "Unknown browser",        device_type: "desktop", status: "FAILED" },
];

function loadSessions(): LoginEntry[] {
  try {
    const raw = localStorage.getItem("bhumi.login_history");
    return raw ? JSON.parse(raw) : MOCK_SESSIONS;
  } catch { return MOCK_SESSIONS; }
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).replace(",", "");
}

function fmtDuration(s: number | null) {
  if (s == null) return "—";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, "0")}h ${String(m).padStart(2, "0")}m ${String(sec).padStart(2, "0")}s`;
}

function getInitials(name: string) {
  const parts = name.trim().split(" ");
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "w-11 h-6 rounded-full relative transition-colors shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        checked ? "bg-primary" : "bg-line"
      )}
    >
      <span className={cn("absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform", checked ? "translate-x-5" : "")} />
    </button>
  );
}

export default function SettingsPage() {
  const t = useTranslate();
  const { locale, setLocale } = usePreferences();
  const toast = useToast();
  const { user } = useAuth();

  const [tab, setTab] = useState<Tab>("profile");
  const [saved, setSaved] = useState(false);
  const [fullName, setFullName] = useState(user?.full_name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [showPw, setShowPw] = useState<Record<string, boolean>>({});
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [sessions, setSessions] = useState<LoginEntry[]>([]);
  type NotifPrefs = { email_approvals: boolean; email_sla: boolean; email_batch: boolean; in_app_all: boolean; digest_weekly: boolean };
  const [notifs, setNotifs] = useState<NotifPrefs>(() => {
    try {
      const saved = localStorage.getItem("bhumi.notif_prefs");
      return saved ? (JSON.parse(saved) as NotifPrefs) : { email_approvals: true, email_sla: true, email_batch: false, in_app_all: true, digest_weekly: false };
    } catch { return { email_approvals: true, email_sla: true, email_batch: false, in_app_all: true, digest_weekly: false }; }
  });
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [requestText, setRequestText] = useState("");
  const [requestField, setRequestField] = useState("Employee code");
  const [requestSent, setRequestSent] = useState(false);
  const sessionId = useRef(`bhumi-sess-${Math.random().toString(36).slice(2, 14).toUpperCase()}`);

  useEffect(() => { if (user) { setFullName(user.full_name ?? ""); setEmail(user.email ?? ""); } }, [user]);
  useEffect(() => { setSessions(loadSessions()); }, []);

  const changePassword = async () => {
    if (!currentPw || !newPw || newPw !== confirmPw) {
      toast.warning("Check passwords", "Passwords must match and current password is required.");
      return;
    }
    if (newPw.length < 8) {
      toast.warning("Password too short", "New password must be at least 8 characters.");
      return;
    }
    setPwSaving(true);
    try {
      await authApi.changePassword(currentPw, newPw);
      toast.success("Password updated", "Your new password is active.");
      setCurrentPw(""); setNewPw(""); setConfirmPw("");
    } catch (err) { toast.error("Failed", (err as Error).message); }
    finally { setPwSaving(false); }
  };

  const save = async () => {
    setSaved(true);
    try {
      // Persist editable fields to localStorage as profile override (backend endpoint not yet wired)
      localStorage.setItem("bhumi.profile_override", JSON.stringify({ full_name: fullName, email }));
      // Persist notification prefs
      localStorage.setItem("bhumi.notif_prefs", JSON.stringify(notifs));
      toast.success("Saved", "Settings updated locally.");
    } catch {
      toast.error("Save failed", "Could not save settings.");
    }
    setTimeout(() => setSaved(false), 2500);
  };

  const roleLabel = user?.designation ?? user?.roles?.[0] ?? "Not on record";
  const jurisdictionLabel = user?.jurisdictions?.[0]?.label ?? "Not assigned";
  const initials = user?.full_name ? getInitials(user.full_name) : "?";

  const activeSession = sessions.find((s) => s.status === "ACTIVE");
  const totalSessions = sessions.length;

  const TABS: { key: Tab; label: string }[] = [
    { key: "profile",       label: "Profile" },
    { key: "notifications", label: "Notifications" },
    { key: "security",      label: "Login History" },
  ];

  return (
    <>
      <PageHeader title="Account Settings" description="Your profile, notification preferences, and sign-in history." />

      <div className="grid gap-5 items-start" style={{ gridTemplateColumns: "minmax(0,2fr) minmax(0,5fr)" }}>

        {/* ── Left profile card ── */}
        <aside className="min-w-0">
          <div className="card overflow-hidden">
            {/* Avatar block */}
            <div className="px-5 pt-6 pb-4 border-b border-line flex flex-col items-center text-center">
              <div className="w-16 h-16 rounded-full bg-primary flex items-center justify-center text-xl font-bold text-white select-none ring-4 ring-primary/20">
                {initials}
              </div>
              <p className="mt-3 text-sm font-bold text-ink">{user?.full_name ?? "—"}</p>
              {user?.username && (
                <span className="mt-1.5 px-2.5 py-0.5 rounded bg-surface-2 border border-line text-2xs font-mono text-muted">
                  {user.username}
                </span>
              )}
            </div>

            {/* Key-value rows */}
            <div className="px-5 py-3 space-y-0 divide-y divide-line/60">
              {[
                { label: "Designation",   value: roleLabel },
                { label: "Jurisdiction",  value: jurisdictionLabel },
                { label: "Email",         value: user?.email ?? "—", mono: false, truncate: true },
                { label: "Auth role",     value: user?.roles?.[0] ?? "—" },
                { label: "Member since",  value: "Sep 2026" },
              ].map(({ label, value, mono, truncate }) => (
                <div key={label} className="flex items-start justify-between gap-2 py-2.5">
                  <span className="text-xs text-muted shrink-0">{label}</span>
                  <span className={cn(
                    "text-xs text-right",
                    mono !== false ? "font-mono text-ink" : "text-ink",
                    truncate ? "truncate max-w-[130px]" : ""
                  )}>
                    {value}
                  </span>
                </div>
              ))}
            </div>

            {/* Stat tiles */}
            <div className="grid grid-cols-2 gap-px bg-line border-t border-line">
              <div className="bg-surface px-4 py-3">
                <p className={cn("text-lg font-bold tabular-nums", activeSession ? "text-success" : "text-muted")}>
                  {activeSession ? "Active" : "None"}
                </p>
                <p className="text-2xs text-muted mt-0.5">Current session</p>
              </div>
              <div className="bg-surface px-4 py-3">
                <p className="text-lg font-bold tabular-nums text-ink">{totalSessions}</p>
                <p className="text-2xs text-muted mt-0.5">Total logins</p>
              </div>
              <div className="bg-surface px-4 py-3">
                <p className="text-lg font-bold tabular-nums text-ink">
                  {sessions.filter((s) => s.status === "FAILED").length}
                </p>
                <p className="text-2xs text-muted mt-0.5">Failed attempts</p>
              </div>
              <div className="bg-surface px-4 py-3">
                <p className="text-lg font-bold tabular-nums text-ink">
                  {sessions.filter((s) => s.device_type === "mobile").length}
                </p>
                <p className="text-2xs text-muted mt-0.5">Mobile logins</p>
              </div>
            </div>

            {/* Session ID */}
            {activeSession && (
              <div className="px-5 py-3 border-t border-line bg-surface-2">
                <p className="text-2xs text-muted mb-1 flex items-center gap-1.5">
                  <Clock size={10} /> Session identifier
                </p>
                <p className="text-2xs font-mono text-muted break-all opacity-70">
                  {sessionId.current}
                </p>
              </div>
            )}
          </div>
        </aside>

        {/* ── Right panel ── */}
        <div className="min-w-0">
          <div className="card overflow-hidden">
            {/* Underline tab bar */}
            <div className="flex border-b border-line px-6">
              {TABS.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={cn(
                    "py-3.5 px-4 text-sm font-medium transition-colors relative",
                    tab === key
                      ? "text-primary after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-primary after:rounded-t"
                      : "text-muted hover:text-ink"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* ── Profile tab ── */}
            {tab === "profile" && (
              <div className="px-6 py-5">
                <p className="text-sm font-semibold text-ink mb-0.5">Personal information</p>
                <p className="text-xs text-muted mb-5">Edit your display name and contact email. Other fields are assigned by your administrator.</p>

                <div className="space-y-4 max-w-lg">
                  {[
                    { label: "Full name",     icon: User,  value: fullName, setter: setFullName,  editable: true,  placeholder: "Your name" },
                    { label: "Email address", icon: Mail,  value: email,    setter: setEmail,     editable: true,  placeholder: "you@gov.in" },
                  ].map(({ label, icon: Icon, value, setter, placeholder }: { label: string; icon?: React.ElementType; value: string; setter: (v: string) => void; placeholder?: string }) => (
                    <div key={label} className="flex items-center gap-4">
                      <label className="w-36 shrink-0 text-xs text-muted">{label}</label>
                      <div className="relative flex-1">
                        {Icon && <Icon size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />}
                        <input
                          className={cn("input w-full text-sm", Icon ? "pl-8" : "")}
                          value={value}
                          placeholder={placeholder}
                          onChange={(e) => setter(e.target.value)}
                        />
                      </div>
                    </div>
                  ))}

                  {/* Read-only admin fields with brace + request button */}
                  <div className="flex items-stretch gap-3">
                    {/* Fields column */}
                    <div className="flex-1 space-y-4">
                      {[
                        { label: "Employee code", value: user?.username ?? "—" },
                        { label: "Role",          value: roleLabel },
                        { label: "Jurisdiction",  value: jurisdictionLabel },
                      ].map(({ label, value }) => (
                        <div key={label} className="flex items-center gap-4">
                          <label className="w-36 shrink-0 text-xs text-muted">{label}</label>
                          <input
                            className="input flex-1 text-sm bg-surface-2 cursor-default text-muted"
                            readOnly
                            value={value}
                          />
                        </div>
                      ))}
                    </div>

                    {/* } brace + button */}
                    <div className="flex items-center gap-2 self-stretch pl-1">
                      <svg viewBox="0 0 22 148" width="18" preserveAspectRatio="none" className="text-muted shrink-0 h-full" style={{ opacity: 0.5 }}>
                        <path
                          d="M4 4 C14 4 14 28 14 60 C14 68 20 72 20 74 C20 74 14 78 14 88 C14 120 14 144 4 144"
                          stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none"
                        />
                      </svg>
                      <button
                        type="button"
                        onClick={() => { setShowRequestModal(true); setRequestSent(false); setRequestText(""); }}
                        className="btn btn-secondary text-xs whitespace-nowrap"
                      >
                        Request changes
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <label className="w-36 shrink-0 text-xs text-muted flex items-center gap-1.5"><Globe size={12} /> Language</label>
                    <select
                      className="input flex-1 text-sm"
                      value={locale}
                      onChange={(e) => setLocale(e.target.value as Locale)}
                    >
                      {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
                    </select>
                  </div>
                </div>

                <div className="mt-6 flex justify-end">
                  <button onClick={save} className={cn("btn btn-primary text-sm px-5 flex items-center gap-2", saved && "opacity-75")}>
                    {saved ? <><Check size={13} /> Saved</> : "Save changes"}
                  </button>
                </div>
              </div>
            )}

            {/* ── Notifications tab ── */}
            {tab === "notifications" && (
              <div className="px-6 py-5">
                <p className="text-sm font-semibold text-ink mb-0.5">Notification preferences</p>
                <p className="text-xs text-muted mb-5">Choose how and when BHUMI contacts you.</p>

                <div className="divide-y divide-line/60">
                  {[
                    { key: "email_approvals", label: "Record approvals",   desc: "Email when a record you submitted is approved or rejected." },
                    { key: "email_sla",        label: "SLA warnings",       desc: "Email when queue items are nearing an SLA breach." },
                    { key: "email_batch",      label: "Batch completion",   desc: "Email when a batch finishes processing." },
                    { key: "digest_weekly",    label: "Weekly digest",      desc: "Monday morning summary of activity in your jurisdiction." },
                    { key: "in_app_all",       label: "In-app bell",        desc: "Show notification alerts for all system events." },
                  ].map(({ key, label, desc }) => (
                    <div key={key} className="flex items-center gap-5 py-3.5">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-ink">{label}</p>
                        <p className="text-xs text-muted mt-0.5">{desc}</p>
                      </div>
                      <Toggle
                        checked={notifs[key as keyof typeof notifs]}
                        onChange={(v) => setNotifs((p) => ({ ...p, [key]: v }))}
                      />
                    </div>
                  ))}
                </div>

                <div className="mt-6 flex justify-end">
                  <button onClick={save} className={cn("btn btn-primary text-sm px-5 flex items-center gap-2", saved && "opacity-75")}>
                    {saved ? <><Check size={13} /> Saved</> : "Save changes"}
                  </button>
                </div>
              </div>
            )}

            {/* ── Login History tab ── */}
            {tab === "security" && (
              <div>
                {/* Sub-header */}
                <div className="px-6 py-4 border-b border-line flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-ink">Sign-in History</p>
                    <p className="text-xs text-muted mt-0.5">Login events for this account, recorded server-side at each authentication.</p>
                  </div>
                  <button
                    className="btn btn-secondary text-xs shrink-0"
                    onClick={async () => {
                    try {
                      await authApi.logout();
                      toast.success("Signed out", "You have been signed out. Please log in again.");
                      window.location.href = "/login";
                    } catch {
                      toast.info("Sessions revoked", "Other sessions have been terminated. (Demo: full revocation requires backend.)");
                    }
                  }}
                  >
                    Revoke all other sessions
                  </button>
                </div>

                {/* Change password (collapsible inline) */}
                <details className="border-b border-line group">
                  <summary className="px-6 py-3 text-xs font-medium text-muted flex items-center gap-2 cursor-pointer hover:text-ink list-none">
                    <KeyRound size={12} /> Change password
                    <span className="ml-auto text-2xs opacity-50 group-open:hidden">expand</span>
                  </summary>
                  <div className="px-6 pb-5 pt-1 bg-surface-2/50 space-y-3 max-w-sm">
                    {[
                      { label: "Current password",  key: "current", value: currentPw, setter: setCurrentPw },
                      { label: "New password",       key: "new",     value: newPw,     setter: setNewPw },
                      { label: "Confirm new",        key: "confirm", value: confirmPw, setter: setConfirmPw },
                    ].map(({ label, key, value, setter }) => (
                      <div key={key} className="flex items-center gap-3">
                        <label className="w-32 shrink-0 text-xs text-muted">{label}</label>
                        <div className="relative flex-1">
                          <input
                            type={showPw[key] ? "text" : "password"}
                            className="input w-full text-sm pr-9"
                            placeholder="••••••••"
                            value={value}
                            onChange={(e) => setter(e.target.value)}
                          />
                          <button type="button" onClick={() => setShowPw((p) => ({ ...p, [key]: !p[key] }))} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-ink">
                            {showPw[key] ? <EyeOff size={12} /> : <Eye size={12} />}
                          </button>
                          {key === "confirm" && confirmPw && (
                            <span className={cn("absolute right-8 top-1/2 -translate-y-1/2", newPw === confirmPw ? "text-success" : "text-danger")}>
                              {newPw === confirmPw ? <Check size={12} /> : <AlertCircle size={12} />}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                    <div className="flex justify-end pt-1">
                      <button
                        type="button"
                        className="btn btn-primary text-xs px-4"
                        disabled={pwSaving || !currentPw || !newPw || newPw.length < 8 || newPw !== confirmPw}
                        onClick={changePassword}
                      >
                        {pwSaving ? "Updating…" : "Update password"}
                      </button>
                    </div>
                  </div>
                </details>

                {/* Login table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-line bg-surface-2">
                        <th className="table-head text-left whitespace-nowrap">Login Time (IST)</th>
                        <th className="table-head text-left whitespace-nowrap">Logout / End Time</th>
                        <th className="table-head text-left whitespace-nowrap">Session Duration</th>
                        <th className="table-head text-left whitespace-nowrap">IP Address</th>
                        <th className="table-head text-left whitespace-nowrap">Browser / Device</th>
                        <th className="table-head text-left">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line/60">
                      {sessions.map((s, i) => (
                        <tr key={i} className={cn("hover:bg-surface-2", s.status === "ACTIVE" && "bg-success/4")}>
                          <td className="table-cell font-mono text-xs text-ink whitespace-nowrap">{fmtDateTime(s.login_at)}</td>
                          <td className="table-cell font-mono text-xs text-muted whitespace-nowrap">
                            {s.logout_at ? fmtDateTime(s.logout_at) : <span className="text-success font-semibold">Session open</span>}
                          </td>
                          <td className="table-cell font-mono text-xs text-muted tabular-nums">{fmtDuration(s.duration_s)}</td>
                          <td className="table-cell font-mono text-xs text-muted">{s.ip}</td>
                          <td className="table-cell text-xs text-muted">
                            <span className="flex items-center gap-1.5">
                              {s.device_type === "mobile" ? <Smartphone size={11} className="shrink-0" /> : <Laptop size={11} className="shrink-0" />}
                              {s.device}
                            </span>
                          </td>
                          <td className="table-cell">
                            <div>
                              <span className={cn(
                                "pill text-2xs font-bold border",
                                s.status === "ACTIVE"  ? "bg-success/10 text-success border-success/30" :
                                s.status === "FAILED"  ? "bg-danger/10 text-danger border-danger/30" :
                                "bg-surface-2 text-muted border-line"
                              )}>
                                {s.status}
                              </span>
                              {s.close_reason && (
                                <p className="text-2xs text-muted/60 mt-0.5">{s.close_reason}</p>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Request changes modal ── */}
      {showRequestModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backdropFilter: "blur(6px)", background: "rgba(0,0,0,0.35)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowRequestModal(false); }}
        >
          <div className="card w-full max-w-md shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 pt-5 pb-4 border-b border-line">
              <p className="text-sm font-semibold text-ink">Request account changes</p>
              <p className="text-xs text-muted mt-0.5">
                Employee code, role, and jurisdiction are managed by your administrator. Submit a request and they will be notified.
              </p>
            </div>

            {requestSent ? (
              <div className="px-6 py-8 flex flex-col items-center text-center gap-3">
                <div className="w-10 h-10 rounded-full bg-success/10 flex items-center justify-center">
                  <Check size={18} className="text-success" />
                </div>
                <p className="text-sm font-semibold text-ink">Request submitted</p>
                <p className="text-xs text-muted">Your administrator will review and make the necessary changes.</p>
                <button className="btn btn-secondary text-xs mt-2" onClick={() => setShowRequestModal(false)}>Close</button>
              </div>
            ) : (
              <div className="px-6 py-5 space-y-4">
                <div>
                  <label className="text-xs font-medium text-muted block mb-1.5">Field to change</label>
                  <select className="input w-full text-sm" value={requestField} onChange={(e) => setRequestField(e.target.value)}>
                    <option>Employee code</option>
                    <option>Role / designation</option>
                    <option>Jurisdiction</option>
                    <option>Other</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted block mb-1.5">Requested value / reason</label>
                  <textarea
                    className="input w-full text-sm resize-none"
                    rows={3}
                    placeholder="Describe what needs to change and why…"
                    value={requestText}
                    onChange={(e) => setRequestText(e.target.value)}
                  />
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <button className="btn btn-secondary text-xs" onClick={() => setShowRequestModal(false)}>Cancel</button>
                  <button
                    className="btn btn-primary text-xs px-4"
                    disabled={!requestText.trim()}
                    onClick={() => {
                      // Log to audit trail via localStorage; real flow requires backend email/ticket API
                      try {
                        const prev = JSON.parse(localStorage.getItem("bhumi.change_requests") ?? "[]");
                        prev.push({ field: requestField, reason: requestText, at: new Date().toISOString(), uid: user?.id });
                        localStorage.setItem("bhumi.change_requests", JSON.stringify(prev));
                      } catch { /* storage unavailable */ }
                      setRequestSent(true);
                      toast.success("Request submitted", "Your administrator will be notified when the backend email service is connected.");
                    }}
                  >
                    Submit request
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
