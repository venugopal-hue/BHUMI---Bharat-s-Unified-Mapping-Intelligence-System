"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { BhumiLogo } from "@/components/gov/BhumiMark";
import { usePreferences, useTranslate } from "@/lib/preferences";

const LANG_OPTIONS = [
  { code: "en", label: "EN" },
  { code: "hi", label: "हि" },
] as const;

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { locale, setLocale } = usePreferences();
  const t = useTranslate();

  return (
    <div className="flex min-h-screen flex-col bg-ground">
      {/* Gov strip */}
      <div className="bg-primary text-primary-fg">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-1.5 text-2xs">
          <span className="opacity-80">{t("landingGovStrip")}</span>
          <span className="hidden opacity-70 sm:block">{t("landingGovStripHi")}</span>
        </div>
      </div>

      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-line bg-surface/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/">
            <BhumiLogo />
          </Link>

          <div className="flex items-center gap-2">
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

            <button
              type="button"
              onClick={() => router.back()}
              className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-muted hover:text-ink transition-colors"
            >
              <ArrowLeft size={13} />
              Back
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>
    </div>
  );
}
