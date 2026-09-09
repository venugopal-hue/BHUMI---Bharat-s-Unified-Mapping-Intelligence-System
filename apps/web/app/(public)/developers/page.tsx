"use client";

import Link from "next/link";
import { Code2, Key, Zap, Shield } from "lucide-react";
import { useTranslate } from "@/lib/preferences";

const ENDPOINTS = [
  { method: "GET",  path: "/api/v1/records",              descKey: "devE1" },
  { method: "GET",  path: "/api/v1/records/:id",          descKey: "devE2" },
  { method: "POST", path: "/api/v1/records/search",       descKey: "devE3" },
  { method: "GET",  path: "/api/v1/parcels/:id/confidence", descKey: "devE4" },
  { method: "POST", path: "/api/v1/upload",               descKey: "devE5" },
  { method: "GET",  path: "/api/v1/batches/:id/status",   descKey: "devE6" },
];

const METHOD_CLS: Record<string, string> = {
  GET:  "bg-success/10 text-success border-success/30",
  POST: "bg-primary/10 text-primary border-primary/30",
};

export default function DevelopersPage() {
  const t = useTranslate();

  const CARDS = [
    { icon: Key,   titleKey: "devCardKeys", bodyKey: "devCardKeysBody" },
    { icon: Shield,titleKey: "devCardSec",  bodyKey: "devCardSecBody" },
    { icon: Zap,   titleKey: "devCardRate", bodyKey: "devCardRateBody" },
    { icon: Code2, titleKey: "devCardSDK",  bodyKey: "devCardSDKBody" },
  ];

  const ENDPOINT_DESCS: Record<string, string> = {
    devE1: "List digitised land records with pagination and filters.",
    devE2: "Retrieve a single record by its BHUMI record ID.",
    devE3: "Full-text and spatial search across the records database.",
    devE4: "Fetch the AI confidence score for a land parcel.",
    devE5: "Submit documents for AI digitisation (multipart/form-data).",
    devE6: "Poll the processing status of an upload batch.",
  };

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <p className="text-2xs font-semibold uppercase tracking-wider text-muted">{t("devLabel")}</p>
      <h1 className="mt-1 text-3xl font-bold text-ink">{t("devTitle")}</h1>
      <p className="mt-2 text-sm text-muted">{t("devSubtitle")}</p>

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        {CARDS.map(({ icon: Icon, titleKey, bodyKey }) => (
          <div key={titleKey} className="rounded-card border border-line bg-surface-2 p-5">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Icon size={15} />
              </span>
              <h2 className="text-sm font-semibold text-ink">{t(titleKey)}</h2>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-muted">{t(bodyKey)}</p>
          </div>
        ))}
      </div>

      <section className="mt-10">
        <h2 className="text-base font-semibold text-ink">{t("devEndpoints")}</h2>
        <p className="mt-1 text-sm text-muted">
          {t("devBaseURL")}{" "}
          <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-ink">https://api.bhumi.gov.in</code>
        </p>
        <div className="relative mt-4">
          {/* Blurred table */}
          <div className="overflow-x-auto rounded-card border border-line select-none pointer-events-none blur-sm opacity-60">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-2xs font-semibold uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-4 py-3 text-left">{t("devColMethod")}</th>
                  <th className="px-4 py-3 text-left">{t("devColEndpoint")}</th>
                  <th className="px-4 py-3 text-left">{t("devColDesc")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {ENDPOINTS.map((e) => (
                  <tr key={e.path}>
                    <td className="px-4 py-3">
                      <span className={`pill border text-2xs font-bold ${METHOD_CLS[e.method]}`}>{e.method}</span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-ink">{e.path}</td>
                    <td className="px-4 py-3 text-muted">{ENDPOINT_DESCS[e.descKey]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Overlay */}
          <div className="absolute inset-0 flex flex-col items-center justify-center rounded-card bg-surface/60 backdrop-blur-[2px]">
            <span className="rounded-full bg-surface-2 border border-line px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-muted">
              Coming soon
            </span>
            <p className="mt-2 text-xs text-muted">API documentation is under development. Request early access below.</p>
          </div>
        </div>
      </section>

      <div className="mt-10 rounded-card border border-line bg-surface-2 p-6">
        <h2 className="text-sm font-semibold text-ink">{t("devRequestTitle")}</h2>
        <p className="mt-1 text-sm text-muted">{t("devRequestBody")}</p>
        <Link href="/contact" className="mt-4 inline-flex items-center gap-1.5 rounded-card bg-primary px-4 py-2 text-sm font-semibold text-primary-fg hover:opacity-90">
          {t("devRequestBtn")}
        </Link>
      </div>
    </div>
  );
}
