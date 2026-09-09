"use client";

import Link from "next/link";
import { useTranslate } from "@/lib/preferences";

export default function SitemapPage() {
  const t = useTranslate();

  const SECTIONS = [
    {
      title: t("sitemapSec1"),
      links: [
        { href: "/", label: t("landingNavSearch") },
        { href: "/contact", label: t("contactTitle") },
        { href: "/help", label: t("helpTitle") },
        { href: "/developers", label: t("devTitle") },
      ],
    },
    {
      title: t("sitemapSec2"),
      links: [
        { href: "/policies/terms", label: t("termsTitle") },
        { href: "/policies/privacy", label: t("privacyTitle") },
        { href: "/policies/copyright", label: t("copyrightTitle") },
        { href: "/policies/hyperlinking", label: t("hyperlinkTitle") },
      ],
    },
    {
      title: t("sitemapSec3"),
      links: [
        { href: "/accessibility", label: t("accessTitle") },
        { href: "/sitemap", label: t("sitemapTitle") },
      ],
    },
    {
      title: t("sitemapSec4"),
      links: [
        { href: "/dashboard", label: "Dashboard" },
        { href: "/records", label: "Records" },
        { href: "/documents", label: "Documents" },
        { href: "/upload", label: "Upload" },
        { href: "/review", label: "Review Queue" },
        { href: "/map", label: "Map" },
        { href: "/analytics/progress", label: "Progress Analytics" },
        { href: "/analytics/accuracy", label: "Accuracy Analytics" },
        { href: "/analytics/operations", label: "Operations Analytics" },
        { href: "/duplicates", label: "Duplicate Detection" },
        { href: "/batches", label: "Batch Jobs" },
        { href: "/notifications", label: "Notifications" },
        { href: "/settings", label: "Settings" },
      ],
    },
  ];

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <p className="text-2xs font-semibold uppercase tracking-wider text-muted">{t("sitemapNav")}</p>
      <h1 className="mt-1 text-3xl font-bold text-ink">{t("sitemapTitle")}</h1>
      <p className="mt-2 text-sm text-muted">{t("sitemapSubtitle")}</p>

      <div className="mt-10 grid gap-8 sm:grid-cols-2">
        {SECTIONS.map((s) => (
          <div key={s.title}>
            <h2 className="text-2xs font-semibold uppercase tracking-wider text-muted">{s.title}</h2>
            <ul className="mt-3 space-y-2">
              {s.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-sm text-primary hover:underline">{l.label}</Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
