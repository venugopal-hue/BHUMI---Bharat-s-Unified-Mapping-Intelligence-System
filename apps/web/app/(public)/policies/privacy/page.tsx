"use client";

import { useTranslate } from "@/lib/preferences";

export default function PrivacyPage() {
  const t = useTranslate();
  const sections = [
    { title: t("privacyS1T"), body: t("privacyS1B") },
    { title: t("privacyS2T"), body: t("privacyS2B") },
    { title: t("privacyS3T"), body: t("privacyS3B") },
    { title: t("privacyS4T"), body: t("privacyS4B") },
    { title: t("privacyS5T"), body: t("privacyS5B") },
    { title: t("privacyS6T"), body: t("privacyS6B") },
    { title: t("privacyS7T"), body: t("privacyS7B") },
    { title: t("privacyS8T"), body: t("privacyS8B") },
    { title: t("privacyS9T"), body: t("privacyS9B") },
  ];
  return (
    <article className="mx-auto max-w-3xl px-6 py-12">
      <p className="text-2xs font-semibold uppercase tracking-wider text-muted">{t("policyLegal")}</p>
      <h1 className="mt-1 text-3xl font-bold text-ink">{t("privacyTitle")}</h1>
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
