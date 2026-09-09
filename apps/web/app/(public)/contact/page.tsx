"use client";

import { useState } from "react";
import { Mail, Phone, MapPin, Send, CheckCircle2, Clock } from "lucide-react";
import { useTranslate } from "@/lib/preferences";

type FormState = {
  name: string;
  email: string;
  subject: string;
  category: string;
  message: string;
};

const CATEGORIES = [
  "General enquiry",
  "Technical support",
  "Account & access",
  "Data discrepancy",
  "API / Developer access",
  "Feedback & suggestions",
  "Press & media",
  "Other",
];

export default function ContactPage() {
  const t = useTranslate();
  const [form, setForm] = useState<FormState>({
    name: "", email: "", subject: "", category: "", message: "",
  });
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const set = (field: keyof FormState) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    await new Promise((r) => setTimeout(r, 1200));
    setLoading(false);
    setSubmitted(true);
  };

  const RESPONSE_TIMES = [
    { label: "Critical issues",    time: "4 hours" },
    { label: "Technical support",  time: "1 working day" },
    { label: "General enquiries",  time: "3 working days" },
    { label: "API access",         time: "5 working days" },
  ];

  if (submitted) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-success/10 text-success">
          <CheckCircle2 size={32} />
        </span>
        <h1 className="mt-4 text-2xl font-bold text-ink">{t("contactSuccessTitle")}</h1>
        <p className="mt-2 max-w-sm text-sm text-muted">
          {t("contactSuccessDesc")}{" "}
          <strong className="text-ink">{form.email}</strong>{" "}
          {t("contactSuccessDesc2")}
        </p>
        <button
          type="button"
          onClick={() => { setSubmitted(false); setForm({ name: "", email: "", subject: "", category: "", message: "" }); }}
          className="mt-6 text-sm text-primary hover:underline"
        >
          {t("contactSendAnother")}
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-14">
      <div className="mb-10">
        <p className="text-2xs font-semibold uppercase tracking-wider text-muted">{t("contactGetInTouch")}</p>
        <h1 className="mt-1 text-3xl font-bold text-ink">{t("contactTitle")}</h1>
        <p className="mt-2 text-sm text-muted">{t("contactSubtitle")}</p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[280px_1fr]">
        {/* Left — contact info */}
        <aside className="space-y-6">
          <div className="rounded-xl border border-line bg-surface-2 p-5 space-y-5">
            <ContactItem icon={Mail}  label={t("contactLabelEmail")} value="helpdesk-bhumi@gov.in" />
            <ContactItem icon={Phone} label={t("contactLabelPhone")} value="1800-111-4567" sub={t("contactPhoneSub")} />
            <ContactItem icon={MapPin} label={t("contactLabelAddr")} value={t("contactAddrLine1")} sub={t("contactAddrLine2")} />
          </div>

          <div className="rounded-xl border border-line bg-surface-2 p-5">
            <div className="flex items-center gap-2 mb-3">
              <Clock size={14} className="text-muted" />
              <p className="text-xs font-semibold text-ink">{t("contactRespTimes")}</p>
            </div>
            <ul className="space-y-2.5">
              {RESPONSE_TIMES.map((r) => (
                <li key={r.label} className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-muted">{r.label}</span>
                  <span className="font-semibold text-ink">{r.time}</span>
                </li>
              ))}
            </ul>
          </div>
        </aside>

        {/* Right — form */}
        <form onSubmit={handleSubmit} className="rounded-xl border border-line bg-surface p-6 space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label={t("contactFieldName")} required>
              <input type="text" required placeholder={t("contactNamePh")} value={form.name} onChange={set("name")} className="form-input" />
            </Field>
            <Field label={t("contactFieldEmail")} required>
              <input type="email" required placeholder={t("contactEmailPh")} value={form.email} onChange={set("email")} className="form-input" />
            </Field>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label={t("contactFieldCat")} required>
              <select required value={form.category} onChange={set("category")} className="form-input">
                <option value="">{t("contactFieldCatPh")}</option>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label={t("contactFieldSubj")} required>
              <input type="text" required placeholder={t("contactFieldSubjPh")} value={form.subject} onChange={set("subject")} className="form-input" />
            </Field>
          </div>

          <Field label={t("contactFieldMsg")} required>
            <textarea required rows={6} placeholder={t("contactFieldMsgPh")} value={form.message} onChange={set("message")} className="form-input resize-none" />
          </Field>

          <div className="flex items-center justify-between gap-4 flex-wrap pt-1">
            <p className="text-xs text-muted">
              {t("contactPrivacy")}{" "}
              <a href="/policies/privacy" className="text-primary hover:underline">{t("contactPrivacyLink")}</a>
              {t("contactPrivacyEnd")}
            </p>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-fg hover:opacity-90 disabled:opacity-60 transition-opacity"
            >
              {loading ? (
                <><span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />{t("contactSending")}</>
              ) : (
                <><Send size={14} />{t("contactSend")}</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold text-ink">
        {label}{required && <span className="ml-0.5 text-danger">*</span>}
      </label>
      {children}
    </div>
  );
}

function ContactItem({ icon: Icon, label, value, sub }: { icon: React.ElementType; label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon size={14} />
      </span>
      <div>
        <p className="text-2xs font-semibold uppercase tracking-wider text-muted">{label}</p>
        <p className="mt-0.5 text-sm font-medium text-ink">{value}</p>
        {sub && <p className="mt-0.5 whitespace-pre-line text-xs text-muted">{sub}</p>}
      </div>
    </div>
  );
}
