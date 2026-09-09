"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  CheckCircle2, Clock, XCircle, RefreshCw, ShieldCheck, User, Building2, Shield, Search, X, UserPlus,
  MessageSquare, ChevronDown, ChevronUp,
} from "lucide-react";

import { Card, EmptyState, PageHeader, SkeletonRows } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { useAuth, ROLE_MAP, Perm } from "@/lib/auth";
import { adminApi, type AdminUser, type ChangeRequest } from "@/lib/api";
import { Can } from "@/components/rbac/Can";
import { cn } from "@/lib/utils";

const STATUS_CHIP: Record<AdminUser["status"], { label: string; cls: string }> = {
  pending:   { label: "Pending",   cls: "bg-warn/10 text-warn border-warn/30" },
  active:    { label: "Active",    cls: "bg-success/10 text-success border-success/30" },
  suspended: { label: "Suspended", cls: "bg-danger/10 text-danger border-danger/30" },
  rejected:  { label: "Rejected",  cls: "bg-surface-2 text-muted border-line" },
};

const DOMAIN_CHIP: Record<string, string> = {
  platform:   "bg-primary/10 text-primary border-primary/30",
  government: "bg-surface-2 text-muted border-line",
};

type FilterStatus = AdminUser["status"] | "all";
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
      <div className="card w-full max-w-md shadow-2xl animate-in fade-in zoom-in-95 duration-150 p-6 space-y-4">
        <div>
          <p className="text-sm font-semibold text-ink">Invite officer</p>
          <p className="text-xs text-muted mt-0.5">They will receive an email with a temporary access link.</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-ink mb-1">Full name</label>
            <input className="input w-full" placeholder="e.g. Ramesh Sharma" value={form.fullName}
              onChange={(e) => setForm((p) => ({ ...p, fullName: e.target.value }))} required />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink mb-1">Government email</label>
            <input type="email" className="input w-full" placeholder="officer@gov.in" value={form.email}
              onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} required />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink mb-1">Role</label>
            <select className="input w-full" value={form.role}
              onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))} required>
              <option value="">Select role…</option>
              <optgroup label="Government Officers">
                {Object.values(ROLE_MAP).filter(r => r.domain === "government").map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </optgroup>
              <optgroup label="Platform Team">
                {Object.values(ROLE_MAP).filter(r => r.domain === "platform").map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </optgroup>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-ink mb-1">State</label>
              <input className="input w-full" placeholder="e.g. Rajasthan"
                value={form.state} onChange={(e) => setForm((p) => ({ ...p, state: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink mb-1">District</label>
              <input className="input w-full" placeholder="e.g. Jaipur"
                value={form.district} onChange={(e) => setForm((p) => ({ ...p, district: e.target.value }))} />
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
  const searchParams = useSearchParams();

  type PageTab = "users" | "change-requests";
  const [pageTab, setPageTab] = useState<PageTab>(
    searchParams.get("tab") === "change-requests" ? "change-requests" : "users"
  );

  const [profiles, setProfiles]           = useState<AdminUser[]>([]);
  const [loading, setLoading]             = useState(true);
  const [filterStatus, setFilterStatus]   = useState<FilterStatus>("all");
  const [filterDomain, setFilterDomain]   = useState<FilterDomain>("all");
  const [acting, setActing]               = useState<string | null>(null);
  const [changingRole, setChangingRole]   = useState<string | null>(null);
  const [showInvite, setShowInvite]       = useState(false);
  const [search, setSearch]               = useState("");

  const [changeRequests, setChangeRequests]     = useState<ChangeRequest[]>([]);
  const [crLoading, setCrLoading]               = useState(false);
  const [expandedCr, setExpandedCr]             = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminApi.listUsers();
      setProfiles(data);
    } catch {
      toast.error("Could not load users", "Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const loadChangeRequests = useCallback(async () => {
    setCrLoading(true);
    try {
      const data = await adminApi.listChangeRequests();
      setChangeRequests(data);
    } catch {
      toast.error("Could not load change requests", "Check your connection and try again.");
    } finally {
      setCrLoading(false);
    }
  }, [toast]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (pageTab === "change-requests") void loadChangeRequests();
  }, [pageTab, loadChangeRequests]);

  const updateStatus = async (id: string, status: AdminUser["status"]) => {
    setActing(id);
    try {
      const updated = await adminApi.updateUserStatus(id, status);
      setProfiles((prev) => prev.map((p) => p.id === id ? updated : p));
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

  const updateRole = async (id: string, designation: string) => {
    const roleDef = ROLE_MAP[designation];
    if (!roleDef) return;
    setActing(id);
    try {
      const updated = await adminApi.updateUserRole(id, designation);
      setProfiles((prev) => prev.map((p) => p.id === id ? updated : p));
      toast.success("Role updated", `User assigned to ${roleDef.label}.`);
    } catch {
      toast.error("Action failed", "Could not update user role.");
    } finally {
      setActing(null);
      setChangingRole(null);
    }
  };

  const handleInvite = async (form: InviteForm) => {
    try {
      await adminApi.inviteUser({ full_name: form.fullName, email: form.email, role: form.role, state: form.state, district: form.district });
      toast.success("Invitation sent", `${form.email} will receive an access link.`);
    } catch {
      toast.error("Invite failed", "Could not send invitation. Check your connection.");
    }
    setShowInvite(false);
  };

  const shown = profiles.filter((p) => {
    if (filterStatus !== "all" && p.status !== filterStatus) return false;
    if (filterDomain !== "all" && p.domain !== filterDomain) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!p.full_name?.toLowerCase().includes(q) && !p.email?.toLowerCase().includes(q)) return false;
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
            {pageTab === "users" && (
              <>
                <button type="button" className="btn btn-primary text-sm" onClick={() => setShowInvite(true)}>
                  <UserPlus size={14} /> Invite user
                </button>
                <button type="button" className="btn-secondary" onClick={load}>
                  <RefreshCw size={14} /> Refresh
                </button>
              </>
            )}
            {pageTab === "change-requests" && (
              <button type="button" className="btn-secondary" onClick={loadChangeRequests}>
                <RefreshCw size={14} /> Refresh
              </button>
            )}
          </div>
        }
      />

      {/* Page tab switcher */}
      <div className="flex gap-1 mb-5 border-b border-line">
        {([
          { key: "users",           label: "Officers",        badge: null },
          { key: "change-requests", label: "Change Requests", badge: changeRequests.length || null },
        ] as { key: PageTab; label: string; badge: number | null }[]).map(({ key, label, badge }) => (
          <button
            key={key}
            type="button"
            onClick={() => setPageTab(key)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors relative",
              pageTab === key
                ? "text-primary after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-primary after:rounded-t"
                : "text-muted hover:text-ink"
            )}
          >
            {label}
            {badge !== null && (
              <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-primary text-white text-2xs font-bold">
                {badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ══ CHANGE REQUESTS TAB ══ */}
      {pageTab === "change-requests" && (
        <Card bodyClassName="p-0">
          {crLoading ? (
            <div className="p-4"><SkeletonRows rows={4} /></div>
          ) : changeRequests.length === 0 ? (
            <EmptyState
              title="No change requests"
              description="When officers request changes to their employee code, role, or jurisdiction, they will appear here."
            />
          ) : (
            <div className="divide-y divide-line">
              {changeRequests.map((cr) => (
                <div key={cr.id} className="px-5 py-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary mt-0.5">
                      <MessageSquare size={14} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-ink">{cr.actor_username}</span>
                        <span className="pill border border-line bg-surface-2 text-muted text-2xs">
                          {cr.field}
                        </span>
                        <span className="text-xs text-muted ml-auto">
                          {new Date(cr.created_at).toLocaleString("en-IN", {
                            day: "2-digit", month: "short", year: "numeric",
                            hour: "2-digit", minute: "2-digit", hour12: false,
                          })}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="mt-1 flex items-center gap-1 text-xs text-muted hover:text-ink"
                        onClick={() => setExpandedCr(expandedCr === cr.id ? null : cr.id)}
                      >
                        {expandedCr === cr.id ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                        {expandedCr === cr.id ? "Hide reason" : "Show reason"}
                      </button>
                      {expandedCr === cr.id && (
                        <p className="mt-2 text-sm text-ink leading-relaxed bg-surface-2 rounded-lg border border-line px-3 py-2">
                          {cr.reason}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button
                        type="button"
                        className="btn btn-secondary text-xs"
                        onClick={() => {
                          setPageTab("users");
                          setSearch(cr.actor_username);
                        }}
                      >
                        Find user
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* ══ USERS TAB ══ */}
      {pageTab === "users" && <>

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
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            className="input pl-8 w-52 text-sm"
            placeholder="Search name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button type="button" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-ink"
              onClick={() => setSearch("")}>
              <X size={13} />
            </button>
          )}
        </div>

        <div className="h-4 w-px bg-line" />

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
                  const isActing = acting === p.id;
                  const isMe     = p.id === user?.id;

                  return (
                    <tr key={p.id} className={`hover:bg-surface-2 ${isMe ? "bg-primary/5" : ""}`}>
                      <td className="table-cell">
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                            <User size={14} />
                          </span>
                          <div>
                            <p className="text-sm font-semibold text-ink">
                              {p.full_name}
                              {isMe && <span className="ml-1.5 text-2xs text-primary font-normal">(you)</span>}
                            </p>
                            <p className="text-2xs text-muted">{p.email}</p>
                          </div>
                        </div>
                      </td>

                      <td className="table-cell font-mono text-xs text-muted">{p.username || "—"}</td>

                      <td className="table-cell">
                        <span className={`pill border text-2xs font-semibold ${DOMAIN_CHIP[p.domain ?? "government"]}`}>
                          {p.domain === "platform"
                            ? <><Shield size={10} className="inline mr-1" />Platform</>
                            : <><Building2 size={10} className="inline mr-1" />Govt</>
                          }
                        </span>
                      </td>

                      <td className="table-cell">
                        {changingRole === p.id ? (
                          <select
                            className="input text-xs py-1"
                            defaultValue={p.designation}
                            autoFocus
                            onBlur={() => setChangingRole(null)}
                            onChange={(e) => updateRole(p.id, e.target.value)}
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
                            className="text-xs text-ink hover:text-primary hover:underline text-left"
                            onClick={() => !isMe && setChangingRole(p.id)}
                            title={isMe ? "Cannot change your own role" : "Click to change role"}
                            disabled={isMe}
                          >
                            {roleDef?.label ?? p.designation ?? "—"}
                          </button>
                        )}
                      </td>

                      <td className="table-cell text-xs text-muted">
                        {p.jurisdictions?.[0]?.label ?? "—"}
                      </td>

                      <td className="table-cell">
                        <span className={`pill border text-2xs font-bold ${chip.cls}`}>
                          {chip.label}
                        </span>
                        {p.approved_by && (
                          <p className="text-2xs text-muted/60 mt-0.5">by {p.approved_by}</p>
                        )}
                      </td>

                      <td className="table-cell">
                        {isActing ? (
                          <span className="text-xs text-muted italic">Updating…</span>
                        ) : isMe ? (
                          <span className="text-xs text-muted italic">—</span>
                        ) : (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {p.status === "pending" && (
                              <>
                                <button
                                  type="button"
                                  className="pill border border-success/30 bg-success/10 text-success text-2xs font-semibold hover:bg-success/20"
                                  onClick={() => updateStatus(p.id, "active")}
                                >
                                  <CheckCircle2 size={11} className="inline mr-0.5" /> Approve
                                </button>
                                <button
                                  type="button"
                                  className="pill border border-danger/30 bg-danger/10 text-danger text-2xs font-semibold hover:bg-danger/20"
                                  onClick={() => updateStatus(p.id, "rejected")}
                                >
                                  <XCircle size={11} className="inline mr-0.5" /> Reject
                                </button>
                              </>
                            )}
                            {p.status === "active" && (
                              <button
                                type="button"
                                className="pill border border-warn/30 bg-warn/10 text-warn text-2xs font-semibold hover:bg-warn/20"
                                onClick={() => updateStatus(p.id, "suspended")}
                              >
                                Suspend
                              </button>
                            )}
                            {p.status === "suspended" && (
                              <button
                                type="button"
                                className="pill border border-success/30 bg-success/10 text-success text-2xs font-semibold hover:bg-success/20"
                                onClick={() => updateStatus(p.id, "active")}
                              >
                                <ShieldCheck size={11} className="inline mr-0.5" /> Reinstate
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      </>}
    </Can>
  );
}
