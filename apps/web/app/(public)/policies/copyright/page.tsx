"use client";

import { useTranslate } from "@/lib/preferences";

export default function CopyrightPage() {
  const t = useTranslate();
  const sections = [
    { title: t("copyrightS1T"), body: t("copyrightS1B") },
    { title: t("copyrightS2T"), body: t("copyrightS2B") },
    { title: t("copyrightS3T"), body: t("copyrightS3B") },
    { title: t("copyrightS4T"), body: t("copyrightS4B") },
    { title: t("copyrightS5T"), body: t("copyrightS5B") },
  ];
  return (
    <article className="mx-auto max-w-3xl px-6 py-12">
      <p className="text-2xs font-semibold uppercase tracking-wider text-muted">{t("policyLegal")}</p>
      <h1 className="mt-1 text-3xl font-bold text-ink">{t("copyrightTitle")}</h1>
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
