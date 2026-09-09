"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import {
  ShieldCheck,
  AlertTriangle,
  XCircle,
  Search,
  Plus,
  ToggleLeft,
  ToggleRight,
  ChevronDown,
  ChevronUp,
  X,
} from "lucide-react";
import { LoadingState, PageHeader } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { validationApi } from "@/lib/api";
import { cn } from "@/lib/utils";

const SEVERITY_CONFIG: Record<string, { label: string; color: string; icon: typeof ShieldCheck }> = {
  BLOCKING: { label: "Blocking", color: "text-red-600 bg-red-50",    icon: XCircle       },
  ERROR:    { label: "Error",    color: "text-red-600 bg-red-50",    icon: XCircle       },
  WARNING:  { label: "Warning",  color: "text-amber-600 bg-amber-50", icon: AlertTriangle },
  INFO:     { label: "Info",     color: "text-blue-600 bg-blue-50",   icon: ShieldCheck   },
};

const CATEGORIES = ["ALL", "COMPLETENESS", "FORMAT", "TEMPORAL", "CONSISTENCY", "SPATIAL"];
const OPERATORS = ["GT", "LT", "EQ", "REGEX", "IN"];
const SEVERITIES = ["ERROR", "WARNING", "INFO"];

type Rule = { id: string; rule_key: string; name: string; category?: string; severity: string; message_en?: string; description_en?: string; is_enabled: boolean };

interface RuleForm {
  name: string;
  description: string;
  category: string;
  field: string;
  operator: string;
  threshold: string;
  severity: string;
}

const emptyForm: RuleForm = { name: "", description: "", category: "COMPLETENESS", field: "", operator: "EQ", threshold: "", severity: "WARNING" };

function RuleModal({
  initial,
  onClose,
  onSave,
}: {
  initial?: RuleForm & { id?: string };
  onClose: () => void;
  onSave: (form: RuleForm, id?: string) => void;
}) {
  const [form, setForm] = useState<RuleForm>(initial ?? emptyForm);
  const isEdit = !!initial?.id;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(form, initial?.id);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="card w-full max-w-lg mx-4 shadow-raised">
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <h2 className="text-base font-semibold text-ink">{isEdit ? "Edit rule" : "New rule"}</h2>
          <button type="button" onClick={onClose} className="text-muted hover:text-ink transition-colors">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-ink mb-1">Name <span className="text-red-500">*</span></label>
            <input className="input w-full" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} required />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink mb-1">Description</label>
            <textarea className="input w-full" rows={2} value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-ink mb-1">Category</label>
              <select className="input w-full" value={form.category} onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}>
                {CATEGORIES.filter((c) => c !== "ALL").map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-ink mb-1">Severity</label>
              <select className="input w-full" value={form.severity} onChange={(e) => setForm((p) => ({ ...p, severity: e.target.value }))}>
                {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-ink mb-1">Field</label>
            <input className="input w-full" placeholder="e.g. survey_number" value={form.field} onChange={(e) => setForm((p) => ({ ...p, field: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-ink mb-1">Operator</label>
              <select className="input w-full" value={form.operator} onChange={(e) => setForm((p) => ({ ...p, operator: e.target.value }))}>
                {OPERATORS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-ink mb-1">Threshold</label>
              <input className="input w-full" type="number" placeholder="0" value={form.threshold} onChange={(e) => setForm((p) => ({ ...p, threshold: e.target.value }))} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn btn-secondary text-sm" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary text-sm">{isEdit ? "Save changes" : "Create rule"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function ValidationRulesPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("ALL");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [localEnabled, setLocalEnabled] = useState<Record<string, boolean>>({});
  const [localRules, setLocalRules] = useState<Rule[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editRule, setEditRule] = useState<(RuleForm & { id: string }) | null>(null);

  const { data: apiRules, isLoading } = useQuery({
    queryKey: ["validation", "rules"],
    queryFn: () => validationApi.rules(),
    staleTime: 60_000,
  });

  // Reset local overrides when window regains focus (truth from server)
  useEffect(() => {
    const handler = () => queryClient.invalidateQueries({ queryKey: ["validation", "rules"] });
    window.addEventListener("focus", handler);
    return () => window.removeEventListener("focus", handler);
  }, [queryClient]);

  const baseRules: Rule[] = (apiRules ?? []).map((r: Rule) => ({
    ...r,
    is_enabled: r.id in localEnabled ? localEnabled[r.id] : r.is_enabled,
  }));

  const rules: Rule[] = [...baseRules, ...localRules].map((r) => ({
    ...r,
    is_enabled: r.id in localEnabled ? localEnabled[r.id] : r.is_enabled,
  }));

  const toggle = (id: string) =>
    setExpanded((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const toggleEnabled = (id: string) =>
    setLocalEnabled((prev) => {
      const cur = rules.find((r) => r.id === id);
      return { ...prev, [id]: !(cur?.is_enabled ?? true) };
    });

  const filtered = rules.filter((r: Rule) => {
    const q = search.toLowerCase();
    const matchSearch = (r.name ?? "").toLowerCase().includes(q) || r.rule_key.toLowerCase().includes(q);
    const matchCat = category === "ALL" || r.category === category;
    return matchSearch && matchCat;
  });

  const [deleteConfirm, setDeleteConfirm] = useState<Rule | null>(null);

  const handleSave = (form: RuleForm, id?: string) => {
    if (id) {
      setLocalRules((prev) => prev.map((r) => r.id === id ? { ...r, name: form.name, description_en: form.description, category: form.category, severity: form.severity } : r));
      toast.success("Rule updated", `"${form.name}" saved locally. Persists until page reload.`);
    } else {
      const newRule: Rule = {
        id: `local-${Date.now()}`,
        rule_key: form.name.toLowerCase().replace(/\s+/g, "_"),
        name: form.name,
        category: form.category,
        severity: form.severity,
        message_en: form.description,
        description_en: form.description,
        is_enabled: true,
      };
      setLocalRules((prev) => [...prev, newRule]);
      toast.success("Rule created locally", `"${form.name}" added. Will not persist to backend until the validation API supports rule creation.`);
    }
    setModalOpen(false);
    setEditRule(null);
  };

  const handleDelete = (rule: Rule) => setDeleteConfirm(rule);
  const confirmDelete = () => {
    if (!deleteConfirm) return;
    setLocalRules((prev) => prev.filter((r) => r.id !== deleteConfirm.id));
    toast.success("Rule removed", `"${deleteConfirm.name}" has been removed from this session.`);
    setExpanded((prev) => { const n = new Set(prev); n.delete(deleteConfirm.id); return n; });
    setDeleteConfirm(null);
  };

  if (isLoading) return <LoadingState />;

  return (
    <>
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="card w-full max-w-sm mx-4 shadow-raised p-5">
            <h2 className="text-base font-semibold text-ink mb-2">Delete rule</h2>
            <p className="text-sm text-muted mb-4">Remove <strong className="text-ink">{deleteConfirm.name}</strong>? This cannot be undone.</p>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn btn-secondary text-sm" onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button type="button" className="btn btn-primary text-sm bg-danger border-danger hover:bg-danger/90" onClick={confirmDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {(modalOpen || editRule) && (
        <RuleModal
          initial={editRule ?? undefined}
          onClose={() => { setModalOpen(false); setEditRule(null); }}
          onSave={handleSave}
        />
      )}

      <PageHeader
        title="Validation Rules"
        description="Configure field-level and cross-field validation rules"
        actions={
          <button className="btn btn-primary flex items-center gap-2 text-sm" onClick={() => setModalOpen(true)}>
            <Plus size={14} />
            New rule
          </button>
        }
      />

      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: "Active rules", value: rules.filter((r) => r.is_enabled).length, color: "text-green-600" },
          { label: "Blocking", value: rules.filter((r) => r.severity === "BLOCKING" && r.is_enabled).length, color: "text-red-600" },
          { label: "Warnings", value: rules.filter((r) => r.severity === "WARNING" && r.is_enabled).length, color: "text-amber-600" },
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
            placeholder="Search rules…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-1 flex-wrap">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={cn(
                "px-2.5 py-1.5 rounded-md text-xs font-medium border transition-colors",
                category === c ? "bg-bhumi-primary text-white border-bhumi-primary" : "bg-surface border-line text-muted hover:text-ink"
              )}
            >
              {c === "ALL" ? "All" : c}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        {filtered.map((rule) => {
          const sc = SEVERITY_CONFIG[rule.severity] ?? SEVERITY_CONFIG.INFO;
          const Icon = sc.icon;
          const isOpen = expanded.has(rule.id);
          const passes = (rule as unknown as Record<string, number>).passes_30d ?? 0;
          const fails = (rule as unknown as Record<string, number>).fails_30d ?? 0;
          const failRate = passes + fails > 0 ? fails / (passes + fails) : 0;

          return (
            <div key={rule.id} className={cn("card overflow-hidden", !rule.is_enabled && "opacity-60")}>
              <div className="flex items-center gap-4 px-5 py-3">
                <button onClick={() => toggle(rule.id)} className="flex-1 flex items-start gap-3 text-left">
                  <Icon size={15} className={cn("shrink-0 mt-0.5", sc.color.split(" ")[0])} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{rule.name}</span>
                      <span className={cn("pill text-xs", sc.color)}>{sc.label}</span>
                      {!rule.is_enabled && <span className="pill text-xs bg-surface-2 text-muted">Disabled</span>}
                    </div>
                    <div className="text-xs text-muted mt-0.5 font-mono">{rule.rule_key}{(rule as Record<string, unknown>).execution_order ? ` · order ${(rule as Record<string, unknown>).execution_order}` : ""}</div>
                  </div>
                  <div className="text-right shrink-0">
                    {passes + fails > 0 && (
                      <>
                        <div className={cn("text-xs font-semibold", failRate > 0.05 ? "text-red-600" : "text-green-600")}>
                          {(failRate * 100).toFixed(1)}% fail
                        </div>
                        <div className="text-xs text-muted">{(passes + fails).toLocaleString()} checks / 30d</div>
                      </>
                    )}
                  </div>
                  {isOpen ? <ChevronUp size={14} className="text-muted shrink-0 mt-1" /> : <ChevronDown size={14} className="text-muted shrink-0 mt-1" />}
                </button>
                <button
                  onClick={() => toggleEnabled(rule.id)}
                  className="shrink-0 text-muted hover:text-ink transition-colors"
                  title={rule.is_enabled ? "Disable rule" : "Enable rule"}
                >
                  {rule.is_enabled
                    ? <ToggleRight size={22} className="text-bhumi-primary" />
                    : <ToggleLeft size={22} />}
                </button>
              </div>

              {isOpen && (
                <div className="border-t border-line px-5 py-4 space-y-3">
                  <p className="text-sm text-muted">{rule.description_en ?? rule.message_en ?? "—"}</p>
                  <div className="flex gap-4 text-xs text-muted">
                    <span>Category: <strong className="text-ink">{rule.category ?? "—"}</strong></span>
                    <span>Applies to: <strong className="text-ink">{((rule as Record<string, unknown>).applies_to as string[] | undefined)?.length ? ((rule as Record<string, unknown>).applies_to as string[]).join(", ") : "All types"}</strong></span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="btn btn-secondary text-xs py-1.5"
                      onClick={() => setEditRule({
                        id: rule.id,
                        name: rule.name,
                        description: rule.description_en ?? rule.message_en ?? "",
                        category: rule.category ?? "COMPLETENESS",
                        field: (rule as Record<string, unknown>).field as string ?? "",
                        operator: "EQ",
                        threshold: "",
                        severity: rule.severity,
                      })}
                    >
                      Edit rule
                    </button>
                    <button
                      className="btn btn-secondary text-xs py-1.5 text-red-600 hover:bg-red-50"
                      onClick={() => handleDelete(rule)}
                    >
                      Delete
                    </button>
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
