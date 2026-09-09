"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useTranslate } from "@/lib/preferences";

export default function HelpPage() {
  const t = useTranslate();

  const FAQS = [
    { q: t("helpQ1"),  a: t("helpA1") },
    { q: t("helpQ2"),  a: t("helpA2") },
    { q: t("helpQ3"),  a: t("helpA3") },
    { q: t("helpQ4"),  a: t("helpA4") },
    { q: t("helpQ5"),  a: t("helpA5") },
    { q: t("helpQ6"),  a: t("helpA6") },
    { q: t("helpQ7"),  a: t("helpA7") },
    { q: t("helpQ8"),  a: t("helpA8") },
    { q: t("helpQ9"),  a: t("helpA9") },
    { q: t("helpQ10"), a: t("helpA10") },
  ];

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <p className="text-2xs font-semibold uppercase tracking-wider text-muted">{t("helpSupport")}</p>
      <h1 className="mt-1 text-3xl font-bold text-ink">{t("helpTitle")}</h1>
      <p className="mt-2 text-sm text-muted">
        {t("helpSubtitle")}{" "}
        <Link href="/contact" className="text-primary hover:underline">{t("helpContactUs")}</Link>.
      </p>

      <div className="mt-10 divide-y divide-line">
        {FAQS.map((faq) => (
          <details key={faq.q} className="group py-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-semibold text-ink">
              {faq.q}
              <ChevronRight size={16} className="shrink-0 text-muted transition-transform group-open:rotate-90" />
            </summary>
            <p className="mt-3 text-sm leading-relaxed text-muted">{faq.a}</p>
          </details>
        ))}
      </div>

      <div className="mt-10 rounded-card border border-line bg-surface-2 p-6 text-center">
        <p className="text-sm font-semibold text-ink">{t("helpStillNeed")}</p>
        <p className="mt-1 text-sm text-muted">{t("helpAvail")}</p>
        <Link href="/contact" className="mt-4 inline-flex items-center gap-1.5 rounded-card bg-primary px-4 py-2 text-sm font-semibold text-primary-fg hover:opacity-90">
          {t("helpContactSupport")}
        </Link>
      </div>
    </div>
  );
}
