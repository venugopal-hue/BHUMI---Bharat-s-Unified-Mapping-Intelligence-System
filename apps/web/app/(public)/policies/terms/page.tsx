"use client";

import { useTranslate } from "@/lib/preferences";

export default function TermsPage() {
  const t = useTranslate();
  const sections = [
    { title: t("termsS1T"), body: t("termsS1B") },
    { title: t("termsS2T"), body: t("termsS2B") },
    { title: t("termsS3T"), body: t("termsS3B") },
    { title: t("termsS4T"), body: t("termsS4B") },
    { title: t("termsS5T"), body: t("termsS5B") },
    { title: t("termsS6T"), body: t("termsS6B") },
    { title: t("termsS7T"), body: t("termsS7B") },
    { title: t("termsS8T"), body: t("termsS8B") },
    { title: t("termsS9T"), body: t("termsS9B") },
  ];
  return (
    <article className="mx-auto max-w-3xl px-6 py-12">
      <p className="text-2xs font-semibold uppercase tracking-wider text-muted">{t("policyLegal")}</p>
      <h1 className="mt-1 text-3xl font-bold text-ink">{t("termsTitle")}</h1>
      <p className="mt-2 text-sm text-muted">{t("policyEffective")} 1 April 2025 · {t("policyLastReviewed")} 1 September 2026</p>
      {sections.map((s) => (
        <section key={s.title} className="mt-8">
          <h2 className="text-base font-semibold text-ink">{s.title}</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">{s.body}</p>
        </section>
      ))}
    </article>
  );
}
