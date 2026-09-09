"use client";

import { useTranslate } from "@/lib/preferences";

export default function AccessibilityPage() {
  const t = useTranslate();
  const sections = [
    { title: t("accessS1T"), body: t("accessS1B") },
    { title: t("accessS2T"), body: t("accessS2B") },
    { title: t("accessS3T"), body: t("accessS3B") },
    { title: t("accessS4T"), body: t("accessS4B") },
    { title: t("accessS5T"), body: t("accessS5B") },
    { title: t("accessS6T"), body: t("accessS6B") },
  ];
  return (
    <article className="mx-auto max-w-3xl px-6 py-12">
      <p className="text-2xs font-semibold uppercase tracking-wider text-muted">{t("accessLabel")}</p>
      <h1 className="mt-1 text-3xl font-bold text-ink">{t("accessTitle")}</h1>
      <p className="mt-2 text-sm text-muted">{t("policyLastReviewed")} 1 September 2026</p>
      {sections.map((s) => (
        <section key={s.title} className="mt-8">
          <h2 className="text-base font-semibold text-ink">{s.title}</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">{s.body}</p>
        </section>
      ))}
    </article>
  );
}
