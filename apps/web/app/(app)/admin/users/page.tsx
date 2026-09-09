"use client";

import { useCallback, useEffect, useState } from "react";
import {
  collection, getDocs, doc, updateDoc, serverTimestamp, query, orderBy,
} from "firebase/firestore";
import {
  CheckCircle2, Clock, XCircle, RefreshCw, ShieldCheck, User, Building2, Shield, Search, X, UserPlus,
} from "lucide-react";

import { Card, EmptyState, PageHeader, SkeletonRows } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { db } from "@/lib/firebase";
import { useAuth, ROLE_MAP, Perm, type BhumiProfile } from "@/lib/auth";
import { Can } from "@/components/rbac/Can";

const STATUS_CHIP: Record<BhumiProfile["status"], { label: string; cls: string }> = {
  pending:   { label: "Pending",   cls: "bg-warn/10 text-warn border-warn/30" },
  active:    { label: "Active",    cls: "bg-success/10 text-success border-success/30" },
  suspended: { label: "Suspended", cls: "bg-danger/10 text-danger border-danger/30" },
  rejected:  { label: "Rejected",  cls: "bg-surface-2 text-muted border-line" },
};

const DOMAIN_CHIP: Record<string, string> = {
  platform:   "bg-primary/10 text-primary border-primary/30",
  government: "bg-surface-2 text-muted border-line",
};

type FilterStatus = BhumiProfile["status"] | "all";
type FilterDomain = "all" | "platform" | "government";

interface InviteForm {
  fullName: string;
  email: string;
  role: string;
  state: string;
  district: string;
}

function InviteModal({ onClose, onInvite }: { onClose: () => void; onInvite: (form: InviteForm) => void }) {
  const [form, setForm] = useState<InviteForm>({ fullName: "", email: "", role: "", state: "", district: "" });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.email || !form.fullName || !form.role) return;
    onInvite(form);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="card w-full max-w-md mx-4 shadow-raised">
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <h2 className="text-base font-semibold text-ink">Invite user</h2>
          <button type="button" onClick={onClose} className="text-muted hover:text-ink transition-colors">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-ink mb-1">Full name <span className="text-danger">*</span></label>
            <input
              className="input w-full"
              placeholder="e.g. Rajesh Kumar"
              value={form.fullName}
              onChange={(e) => setForm((p) => ({ ...p, fullName: e.target.value }))}
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink mb-1">Email <span className="text-danger">*</span></label>
            <input
              type="email"
              className="input w-full"
              placeholder="officer@example.gov.in"
              value={form.email}
              onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink mb-1">Role <span className="text-danger">*</span></label>
            <select
              className="input w-full"
              value={form.role}
              onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))}
              required
            >
              <option value="">Select a role…</option>
              <optgroup label="Platform Team">
                {Object.values(ROLE_MAP).filter(r => r.domain === "platform").map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </optgroup>
              <optgroup label="Government Officers">
                {Object.values(ROLE_MAP).filter(r => r.domain === "government").map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </optgroup>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-ink mb-1">State</label>
              <input
                className="input w-full"
                placeholder="e.g. Rajasthan"
                value={form.state}
                onChange={(e) => setForm((p) => ({ ...p, state: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink mb-1">District</label>
              <input
                className="input w-full"
                placeholder="e.g. Jaipur"
                value={form.district}
                onChange={(e) => setForm((p) => ({ ...p, district: e.target.value }))}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn btn-secondary text-sm" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary text-sm">Send invitation</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function AdminUsersPage() {
  const toast = useToast();
  const { user } = useAuth();

  const [profiles, setProfiles]           = useState<BhumiProfile[]>([]);
  const [loading, setLoading]             = useState(true);
  const [filterStatus, setFilterStatus]   = useState<FilterStatus>("all");
  const [filterDomain, setFilterDomain]   = useState<FilterDomain>("all");
  const [acting, setActing]               = useState<string | null>(null);
  const [changingRole, setChangingRole]   = useState<string | null>(null);
  const [showInvite, setShowInvite]       = useState(false);
  const [search, setSearch]               = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, "bhumi_users"), orderBy("createdAt", "desc")));
      setProfiles(snap.docs.map((d) => d.data() as BhumiProfile));
    } catch {
      toast.error("Could not load users", "Check your Firebase connection.");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  const updateStatus = async (uid: string, status: BhumiProfile["status"]) => {
    setActing(uid);
    try {
      await updateDoc(doc(db, "bhumi_users", uid), {
        status,
        approvedAt: serverTimestamp(),
        approvedBy: user?.full_name ?? "admin",
      });
      setProfiles((prev) => prev.map((p) => p.uid === uid ? { ...p, status } : p));
      toast.success(
        status === "active" ? "Account activated"
          : status === "rejected" ? "Registration rejected"
          : "Account suspended",
        `User status updated to ${status}.`,
      );
    } catch {
      toast.error("Action failed", "Could not update user status.");
    } finally {
      setActing(null);
    }
  };

  const updateRole = async (uid: string, designation: string) => {
    const roleDef = ROLE_MAP[designation];
    if (!roleDef) return;
    setActing(uid);
    try {
      await updateDoc(doc(db, "bhumi_users", uid), {
        designation,
        domain: roleDef.domain,
        permissions: roleDef.permissions,
      });
      setProfiles((prev) =>
        prev.map((p) =>
          p.uid === uid
            ? { ...p, designation, domain: roleDef.domain, permissions: roleDef.permissions }
            : p,
        ),
      );
      toast.success("Role updated", `User assigned to ${roleDef.label}.`);
    } catch {
      toast.error("Action failed", "Could not update user role.");
    } finally {
      setActing(null);
      setChangingRole(null);
    }
  };

  const handleInvite = (form: InviteForm) => {
    // Store pending invite in localStorage until backend email API is wired
    try {
      const prev = JSON.parse(localStorage.getItem("bhumi.pending_invites") ?? "[]");
      prev.push({ ...form, at: new Date().toISOString(), status: "pending" });
      localStorage.setItem("bhumi.pending_invites", JSON.stringify(prev));
    } catch { /* storage unavailable */ }
    toast.success("Invite queued", `${form.email} will receive an invitation once the email service is connected.`);
    setShowInvite(false);
  };

  const shown = profiles.filter((p) => {
    if (filterStatus !== "all" && p.status !== filterStatus) return false;
    if (filterDomain !== "all" && p.domain !== filterDomain) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!p.fullName?.toLowerCase().includes(q) && !p.email?.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const pendingCount = profiles.filter((p) => p.status === "pending").length;

  return (
    <Can perm={Perm.USER_MANAGE} fallback={
      <div className="flex min-h-[40vh] items-center justify-center text-muted text-sm">
        You don&apos;t have permission to manage users.
      </div>
    }>
      {showInvite && (
        <InviteModal onClose={() => setShowInvite(false)} onInvite={handleInvite} />
      )}

      <PageHeader
        title="User Management"
        description="Review registrations, approve officers, and manage access across BHUMI."
        breadcrumbs={[{ label: "Admin" }, { label: "Users" }]}
        actions={
          <div className="flex gap-2">
            <button type="button" className="btn btn-primary text-sm" onClick={() => setShowInvite(true)}>
              <UserPlus size={14} /> Invite user
            </button>
            <button type="button" className="btn-secondary" onClick={load}>
              <RefreshCw size={14} /> Refresh
            </button>
          </div>
        }
      />

      {/* Pending alert */}
      {pendingCount > 0 && (
        <div className="mb-4 flex items-center gap-2 rounded-card border border-warn/30 bg-warn/5 px-4 py-2.5 text-sm text-warn">
          <Clock size={15} aria-hidden />
          <span><strong>{pendingCount}</strong> registration{pendingCount > 1 ? "s" : ""} awaiting approval.</span>
          <button
            type="button"
            className="ml-auto text-2xs font-semibold underline underline-offset-2"
            onClick={() => setFilterStatus("pending")}
          >
            View
          </button>
        </div>
      )}

      {/* Filters + Search */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            className="input pl-8 w-52 text-sm"
            placeholder="Search name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              type="button"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-ink"
              onClick={() => setSearch("")}
            >
              <X size={13} />
            </button>
          )}
        </div>

        <div className="h-4 w-px bg-line" />

        {/* Status filter */}
        <div className="flex flex-wrap gap-1.5">
          {(["all", "pending", "active", "suspended", "rejected"] as FilterStatus[]).map((s) => {
            const count = s === "all" ? profiles.length : profiles.filter((p) => p.status === s).length;
            return (
              <button
                key={s}
                type="button"
                onClick={() => setFilterStatus(s)}
                className={`pill border text-xs font-semibold transition-colors ${
                  filterStatus === s
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-line bg-surface text-muted hover:text-ink"
                }`}
              >
                {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)} ({count})
                {s === "pending" && count > 0 && (
                  <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-warn" />
                )}
              </button>
            );
          })}
        </div>

        <div className="h-4 w-px bg-line" />

        {/* Domain filter */}
        <div className="flex gap-1.5">
          {(["all", "government", "platform"] as FilterDomain[]).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setFilterDomain(d)}
              className={`pill border text-xs font-semibold transition-colors ${
                filterDomain === d
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-line bg-surface text-muted hover:text-ink"
              }`}
            >
              {d === "all" ? "All domains" : d.charAt(0).toUpperCase() + d.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <Card bodyClassName="p-0">
        {loading ? (
          <div className="p-4"><SkeletonRows rows={6} /></div>
        ) : shown.length === 0 ? (
          <EmptyState title="No users" description="No users match the selected filters." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-head">Officer</th>
                  <th className="table-head">Code</th>
                  <th className="table-head">Domain</th>
                  <th className="table-head">Role</th>
                  <th className="table-head">Jurisdiction</th>
                  <th className="table-head">Status</th>
                  <th className="table-head">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {shown.map((p) => {
                  const chip     = STATUS_CHIP[p.status];
                  const roleDef  = ROLE_MAP[p.designation];
                  const isActing = acting === p.uid;
                  const isMe     = p.uid === user?.id;

                  return (
                    <tr key={p.uid} className={`hover:bg-surface-2 ${isMe ? "bg-primary/5" : ""}`}>
                      {/* Officer */}
                      <td className="table-cell">
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                            <User size={14} />
                          </span>
                          <div>
                            <p className="text-sm font-semibold text-ink">
                              {p.fullName}
                              {isMe && <span className="ml-1.5 text-2xs text-primary font-normal">(you)</span>}
                            </p>
                            <p className="text-2xs text-muted">{p.email}</p>
                          </div>
                        </div>
                      </td>

                      {/* Code */}
                      <td className="table-cell font-mono text-xs text-muted">{p.employeeCode || "—"}</td>

                      {/* Domain */}
                      <td className="table-cell">
                        <span className={`pill border text-2xs font-semibold ${DOMAIN_CHIP[p.domain ?? "government"]}`}>
                          {p.domain === "platform"
                            ? <><Shield size={10} className="inline mr-1" />Platform</>
                            : <><Building2 size={10} className="inline mr-1" />Govt</>
                          }
                        </span>
                      </td>

                      {/* Role */}
                      <td className="table-cell">
                        {changingRole === p.uid ? (
                          <select
                            className="input text-xs py-1"
                            defaultValue={p.designation}
                            autoFocus
                            onBlur={() => setChangingRole(null)}
                            onChange={(e) => {
                              const newRole = e.target.value;
                              updateRole(p.uid, newRole);
                            }}
                          >
                            <optgroup label="Platform Team">
                              {Object.values(ROLE_MAP).filter(r => r.domain === "platform").map(r => (
                                <option key={r.value} value={r.value}>{r.label}</option>
                              ))}
                            </optgroup>
                            <optgroup label="Government Officers">
                              {Object.values(ROLE_MAP).filter(r => r.domain === "government").map(r => (
                                <option key={r.value} value={r.value}>{r.label}</option>
                              ))}
                            </optgroup>
                          </select>
                        ) : (
                          <button
                            type="button"
                            disabled={isMe}
                            onClick={() => setChangingRole(p.uid)}
                            className="text-xs text-ink hover:text-primary hover:underline underline-offset-2 disabled:cursor-default disabled:no-underline"
                            title={isMe ? "Cannot change your own role" : "Click to change role"}
                          >
                            {roleDef?.label ?? p.designation}
                          </button>
                        )}
                      </td>

                      {/* Jurisdiction */}
                      <td className="table-cell text-xs text-muted">
                        {p.district ? `${p.district}, ` : ""}{p.state || "—"}
                      </td>

                      {/* Status */}
                      <td className="table-cell">
                        <span className={`pill border text-2xs font-semibold ${chip.cls}`}>{chip.label}</span>
                      </td>

                      {/* Actions */}
                      <td className="table-cell">
                        <div className="flex items-center gap-1.5">
                          {!isMe && p.status !== "active" && (
                            <button
                              type="button"
                              disabled={isActing}
                              onClick={() => updateStatus(p.uid, "active")}
                              className="flex items-center gap-1 rounded border border-success/30 bg-success/10 px-2 py-1 text-2xs font-semibold text-success hover:bg-success/20 disabled:opacity-50"
                            >
                              {isActing ? <RefreshCw size={11} className="animate-spin" /> : <CheckCircle2 size={11} />}
                              Approve
                            </button>
                          )}
                          {!isMe && p.status === "pending" && (
                            <button
                              type="button"
                              disabled={isActing}
                              onClick={() => updateStatus(p.uid, "rejected")}
                              className="flex items-center gap-1 rounded border border-danger/30 bg-danger/10 px-2 py-1 text-2xs font-semibold text-danger hover:bg-danger/20 disabled:opacity-50"
                            >
                              <XCircle size={11} /> Reject
                            </button>
                          )}
                          {!isMe && p.status === "active" && (
                            <button
                              type="button"
                              disabled={isActing}
                              onClick={() => updateStatus(p.uid, "suspended")}
                              className="flex items-center gap-1 rounded border border-line bg-surface-2 px-2 py-1 text-2xs font-semibold text-muted hover:text-danger disabled:opacity-50"
                            >
                              <XCircle size={11} /> Suspend
                            </button>
                          )}
                          {!isMe && p.status === "suspended" && (
                            <button
                              type="button"
                              disabled={isActing}
                              onClick={() => updateStatus(p.uid, "active")}
                              className="flex items-center gap-1 rounded border border-success/30 bg-success/10 px-2 py-1 text-2xs font-semibold text-success hover:bg-success/20 disabled:opacity-50"
                            >
                              <ShieldCheck size={11} /> Reinstate
                            </button>
                          )}
                          {isMe && (
                            <span className="text-2xs text-muted italic">—</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </Can>
  );
}
