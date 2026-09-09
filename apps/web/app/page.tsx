"use client";

import Link from "next/link";

import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  Clock,
  FileSearch,
  Globe2,
  Lock,
  MapPin,
  Scan,
  Search,
  Shield,
  Sparkles,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";

import { BhumiLogo } from "@/components/gov/BhumiMark";
import { GovFooter } from "@/components/gov/GovFooter";
import { usePreferences, useTranslate } from "@/lib/preferences";

/* ------------------------------------------------------------------ */
/* Static data                                                          */
/* ------------------------------------------------------------------ */
const STAT_KEYS = [
  { value: "2.4 Cr+", labelKey: "landingStatRecords",  icon: FileSearch },
  { value: "28",      labelKey: "landingStatStates",   icon: MapPin },
  { value: "97.3%",   labelKey: "landingStatAccuracy", icon: TrendingUp },
  { value: "4 min",   labelKey: "landingStatTime",     icon: Clock },
];

const STATES = [
  "Maharashtra", "Uttar Pradesh", "Tamil Nadu", "Rajasthan",
  "Madhya Pradesh", "Karnataka", "Gujarat", "West Bengal",
  "Odisha", "Telangana", "Bihar", "Andhra Pradesh",
];

const LANG_OPTIONS = [
  { code: "en", label: "EN" },
  { code: "hi", label: "हि" },
] as const;

/* ------------------------------------------------------------------ */
/* Page                                                                 */
/* ------------------------------------------------------------------ */
export default function LandingPage() {

  const { locale, setLocale } = usePreferences();
  const t = useTranslate();

  const PIPELINE = [
    { step: "01", icon: Scan,         title: t("landingStep1Title"), desc: t("landingStep1Desc") },
    { step: "02", icon: Sparkles,     title: t("landingStep2Title"), desc: t("landingStep2Desc") },
    { step: "03", icon: CheckCircle2, title: t("landingStep3Title"), desc: t("landingStep3Desc") },
    { step: "04", icon: Globe2,       title: t("landingStep4Title"), desc: t("landingStep4Desc") },
  ];

  const FEATURES = [
    { icon: FileSearch, title: t("landingF1Title"), desc: t("landingF1Desc") },
    { icon: MapPin,     title: t("landingF2Title"), desc: t("landingF2Desc") },
    { icon: Shield,     title: t("landingF3Title"), desc: t("landingF3Desc") },
    { icon: BarChart3,  title: t("landingF4Title"), desc: t("landingF4Desc") },
    { icon: Lock,       title: t("landingF5Title"), desc: t("landingF5Desc") },
    { icon: Zap,        title: t("landingF6Title"), desc: t("landingF6Desc") },
  ];

  const CONFIDENCE_BANDS = [
    { band: t("landingConfHighBand"), pct: "≥ 95%", label: t("landingConfHighLabel"), color: "bg-conf-high",   icon: "✓" },
    { band: t("landingConfGoodBand"), pct: "≥ 85%", label: t("landingConfGoodLabel"), color: "bg-conf-good",   icon: "~" },
    { band: t("landingConfMedBand"),  pct: "≥ 70%", label: t("landingConfMedLabel"),  color: "bg-conf-medium", icon: "?" },
    { band: t("landingConfLowBand"),  pct: "< 70%", label: t("landingConfLowLabel"),  color: "bg-conf-low",    icon: "!" },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-ground">

      {/* ── Government strip ────────────────────────────── */}
      <div className="bg-primary text-primary-fg">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-1.5 text-2xs">
          <span className="opacity-80">{t("landingGovStrip")}</span>
          <span className="hidden opacity-70 sm:block">{t("landingGovStripHi")}</span>
        </div>
      </div>

      {/* ── Top nav ─────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-line bg-surface/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <BhumiLogo />

          <nav className="hidden items-center gap-5 text-sm text-muted lg:flex">
            <a href="#how-it-works" className="hover:text-ink transition-colors">{t("landingNavHowItWorks")}</a>
            <a href="#features"     className="hover:text-ink transition-colors">{t("landingNavFeatures")}</a>
            <a href="#stakeholders" className="hover:text-ink transition-colors">{t("landingNavStakeholders")}</a>
            <a href="#coverage"     className="hover:text-ink transition-colors">{t("landingNavCoverage")}</a>
            <a href="#contact-cta"  className="hover:text-ink transition-colors">{t("landingNavContact")}</a>
          </nav>

          <div className="flex items-center gap-2">
            {/* Language switcher */}
            <div className="hidden items-center gap-1 sm:flex">
              {LANG_OPTIONS.map((l) => (
                <button
                  key={l.code}
                  type="button"
                  onClick={() => setLocale(l.code)}
                  className={`rounded px-2.5 py-1 text-xs font-semibold transition-colors ${
                    locale === l.code
                      ? "bg-primary text-primary-fg"
                      : "border border-line text-muted hover:text-ink"
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>

            <div className="hidden h-4 w-px bg-line sm:block" />

            <Link href="/login" className="btn-primary btn-sm gap-1.5">
              {t("landingStaffSignIn")} <ArrowRight size={13} />
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">

        {/* ── Hero ─────────────────────────────────────────── */}
        <section className="relative overflow-hidden border-b border-line bg-surface">
          <div className="pointer-events-none absolute inset-0 grid-paper opacity-40" />

          <div className="relative mx-auto max-w-7xl px-4 py-20 sm:py-28 lg:py-32">
            <div className="grid gap-16 lg:grid-cols-2 lg:items-center">
              <div className="max-w-xl">
                <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-2xs font-semibold text-primary">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                  {t("landingBadge")}
                </div>

                <h1 className="text-4xl font-bold leading-[1.15] tracking-tight text-ink sm:text-5xl lg:text-[3.2rem]">
                  Digitized. Verified.{" "}
                  <span className="text-primary">Trusted.</span>
                </h1>

                <p className="mt-5 text-base leading-relaxed text-muted sm:text-lg">
                  {t("landingDesc")}
                </p>

                <div className="mt-8 flex flex-wrap gap-3">
                  <Link href="/login" className="btn-primary gap-2 px-5 py-2.5 text-sm">
                    {t("landingOfficerPortal")} <ArrowRight size={15} />
                  </Link>
                </div>

                <div className="mt-8 flex flex-wrap items-center gap-4 border-t border-line pt-6 text-2xs text-muted">
                  <span className="flex items-center gap-1.5"><Shield size={12} className="text-primary" /> {t("landingTrustGIGW")}</span>
                  <span className="flex items-center gap-1.5"><Lock size={12} className="text-primary" /> {t("landingTrustEnc")}</span>
                  <span className="flex items-center gap-1.5"><CheckCircle2 size={12} className="text-primary" /> {t("landingTrustNIC")}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {STAT_KEYS.map(({ value, labelKey, icon: Icon }) => (
                  <div key={labelKey} className="card flex flex-col gap-3 p-5 animate-fade-up">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/8 text-primary">
                      <Icon size={18} />
                    </div>
                    <p className="text-3xl font-bold tabular-nums text-primary leading-none">{value}</p>
                    <p className="text-xs text-muted">{t(labelKey)}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── How it works ─────────────────────────────────── */}
        <section id="how-it-works" className="border-b border-line py-20">
          <div className="mx-auto max-w-7xl px-4">
            <div className="mb-14 text-center">
              <p className="text-2xs font-semibold uppercase tracking-widest text-primary">{t("landingPipelineLabel")}</p>
              <h2 className="mt-2 text-3xl font-bold text-ink">{t("landingPipelineTitle")}</h2>
              <p className="mt-3 max-w-xl mx-auto text-muted">{t("landingPipelineDesc")}</p>
            </div>
            <div className="relative grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
              <div className="pointer-events-none absolute top-10 left-0 right-0 hidden h-px border-t border-dashed border-line lg:block" />
              {PIPELINE.map(({ step, icon: Icon, title, desc }) => (
                <div key={step} className="relative flex flex-col items-start gap-4">
                  <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl border border-primary/20 bg-primary/5">
                    <Icon size={28} className="text-primary" />
                    <span className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-2xs font-bold text-primary-fg shadow">
                      {step.slice(1)}
                    </span>
                  </div>
                  <h3 className="font-semibold text-ink">{title}</h3>
                  <p className="text-sm leading-relaxed text-muted">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Features ─────────────────────────────────────── */}
        <section id="features" className="border-b border-line bg-surface py-20">
          <div className="mx-auto max-w-7xl px-4">
            <div className="mb-14 text-center">
              <p className="text-2xs font-semibold uppercase tracking-widest text-primary">{t("landingFeatLabel")}</p>
              <h2 className="mt-2 text-3xl font-bold text-ink">{t("landingFeatTitle")}</h2>
              <p className="mt-3 max-w-xl mx-auto text-muted">{t("landingFeatDesc")}</p>
            </div>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(({ icon: Icon, title, desc }) => (
                <div key={title} className="card card-hover group flex flex-col gap-3 p-6">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/8 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-fg">
                    <Icon size={20} />
                  </div>
                  <h3 className="font-semibold text-ink">{title}</h3>
                  <p className="text-sm leading-relaxed text-muted">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Confidence bands ─────────────────────────────── */}
        <section className="border-b border-line py-20">
          <div className="mx-auto max-w-7xl px-4">
            <div className="grid gap-12 lg:grid-cols-2 lg:items-center lg:gap-20">
              <div>
                <p className="text-2xs font-semibold uppercase tracking-widest text-primary">{t("landingConfLabel")}</p>
                <h2 className="mt-2 text-3xl font-bold text-ink">{t("landingConfTitle")}</h2>
                <p className="mt-4 leading-relaxed text-muted">{t("landingConfDesc1")}</p>
                <p className="mt-3 leading-relaxed text-muted">{t("landingConfDesc2")}</p>
              </div>
              <div className="flex flex-col gap-3">
                {CONFIDENCE_BANDS.map((row) => (
                  <div key={row.band} className="flex items-center gap-4 rounded-xl border border-line bg-surface px-5 py-4 transition-shadow hover:shadow-sm">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${row.color} text-white font-bold text-sm`}>
                      {row.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-ink text-sm">
                        {row.band} confidence
                        <span className="ml-2 font-mono text-2xs text-muted">{row.pct}</span>
                      </p>
                      <p className="text-xs text-muted mt-0.5">{row.label}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── Who uses BHUMI ───────────────────────────────── */}
        <section id="stakeholders" className="border-b border-line bg-surface py-20">
          <div className="mx-auto max-w-7xl px-4">
            <div className="mb-12 text-center">
              <p className="text-2xs font-semibold uppercase tracking-widest text-primary">{t("landingStakLabel")}</p>
              <h2 className="mt-2 text-3xl font-bold text-ink">{t("landingStakTitle")}</h2>
            </div>
            <div className="grid gap-5 sm:grid-cols-3">
              {[
                { icon: Users,  role: t("landingRoleOfficer"),  desc: t("landingRoleOfficerDesc") },
                { icon: Globe2, role: t("landingRoleDC"),      desc: t("landingRoleDCDesc") },
                { icon: Search, role: t("landingRoleCitizen"), desc: t("landingRoleCitizenDesc") },
              ].map(({ icon: Icon, role, desc }) => (
                <div key={role} className="card flex flex-col gap-4 p-6">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/8 text-primary">
                    <Icon size={20} />
                  </div>
                  <h3 className="font-semibold text-ink">{role}</h3>
                  <p className="text-sm leading-relaxed text-muted">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Comparison table ─────────────────────────────── */}
        <section id="coverage" className="border-b border-line py-10">
          <div className="mx-auto max-w-4xl px-4">
            <div className="mb-6 flex flex-col items-center gap-1 text-center sm:flex-row sm:items-end sm:justify-between sm:text-left">
              <div>
                <p className="text-2xs font-semibold uppercase tracking-widest text-primary">{t("landingCompLabel")}</p>
                <h2 className="mt-0.5 text-2xl font-bold text-ink">{t("landingCompTitle")}</h2>
              </div>
              <p className="text-xs text-muted sm:max-w-xs sm:text-right">{t("landingCompDesc")}</p>
            </div>

            <div className="overflow-x-auto rounded-xl border border-line shadow-sm">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-line">
                    <th className="px-4 py-2.5 text-left text-2xs font-semibold uppercase tracking-wider text-muted w-1/3">{t("landingCompMetric")}</th>
                    <th className="bg-surface-2 px-4 py-2.5 text-center text-2xs font-semibold uppercase tracking-wider text-muted w-1/3">{t("landingCompManual")}</th>
                    <th className="bg-primary/5 px-4 py-2.5 text-center text-2xs font-semibold uppercase tracking-wider text-primary w-1/3">{t("landingCompBhumi")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {[
                    { metric: t("landingCompR1"), manual: t("landingCompR1Manual"), bhumi: t("landingCompR1Bhumi") },
                    { metric: t("landingCompR2"), manual: t("landingCompR2Manual"), bhumi: t("landingCompR2Bhumi") },
                    { metric: t("landingCompR3"), manual: t("landingCompR3Manual"), bhumi: t("landingCompR3Bhumi") },
                    { metric: t("landingCompR4"), manual: t("landingCompR4Manual"), bhumi: t("landingCompR4Bhumi") },
                    { metric: t("landingCompR5"), manual: t("landingCompR5Manual"), bhumi: t("landingCompR5Bhumi") },
                    { metric: t("landingCompR6"), manual: t("landingCompR6Manual"), bhumi: t("landingCompR6Bhumi") },
                  ].map((row) => (
                    <tr key={row.metric} className="hover:bg-surface-2/40 transition-colors">
                      <td className="px-4 py-2.5 font-medium text-ink">{row.metric}</td>
                      <td className="bg-surface-2/20 px-4 py-2.5 text-center text-muted">
                        <span className="inline-flex items-center gap-1">
                          <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-danger/50" />
                          {row.manual}
                        </span>
                      </td>
                      <td className="bg-primary/5 px-4 py-2.5 text-center font-semibold text-primary">
                        <span className="inline-flex items-center gap-1">
                          <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-success" />
                          {row.bhumi}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="mt-2 text-center text-2xs text-muted/70">{t("landingCompFootnote")}</p>
          </div>
        </section>


        {/* ── CTA strip ────────────────────────────────────── */}
        <section id="contact-cta" className="bg-primary py-16">
          <div className="mx-auto max-w-4xl px-4 text-center">
            <h2 className="text-2xl font-bold text-primary-fg sm:text-3xl">{t("landingCTATitle")}</h2>
            <p className="mt-3 text-primary-fg/75 max-w-lg mx-auto">{t("landingCTADesc")}</p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link href="/login" className="rounded-lg bg-white px-6 py-2.5 text-sm font-semibold text-primary hover:bg-white/90 transition-colors">
                {t("landingOfficerSignIn")}
              </Link>
              <Link href="/contact" className="rounded-lg border border-primary-fg/30 px-6 py-2.5 text-sm font-semibold text-primary-fg hover:bg-primary-fg/10 transition-colors">
                {t("landingContactUs")}
              </Link>
            </div>
          </div>
        </section>

      </main>

      <GovFooter />
    </div>
  );
}
