"use client";

import { useTranslate } from "@/lib/preferences";

export default function HyperlinkingPage() {
  const t = useTranslate();
  const sections = [
    { title: t("hyperlinkS1T"), body: t("hyperlinkS1B") },
    { title: t("hyperlinkS2T"), body: t("hyperlinkS2B") },
    { title: t("hyperlinkS3T"), body: t("hyperlinkS3B") },
    { title: t("hyperlinkS4T"), body: t("hyperlinkS4B") },
  ];
  return (
    <article className="mx-auto max-w-3xl px-6 py-12">
      <p className="text-2xs font-semibold uppercase tracking-wider text-muted">{t("policyLegal")}</p>
      <h1 className="mt-1 text-3xl font-bold text-ink">{t("hyperlinkTitle")}</h1>
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
