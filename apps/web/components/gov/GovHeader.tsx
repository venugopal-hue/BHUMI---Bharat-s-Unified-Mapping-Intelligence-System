"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Bell,
  Contrast,
  Globe,
  LogOut,
  Menu,
  Moon,
  Search,
  Settings,
  Sun,
  User as UserIcon,
} from "lucide-react";

import { useAuth } from "@/lib/auth";
import { usePreferences, useTranslate, type Locale } from "@/lib/preferences";
import { cn } from "@/lib/utils";

import { BhumiLogo } from "./BhumiMark";

/**
 * The government masthead.
 *
 * The thin top strip carries the emblem, the owning ministry and the
 * accessibility controls GIGW 3.0 mandates — text size, contrast, language.
 * They live above the product chrome because they are statutory, not optional.
 */
export function GovHeader({ onOpenCommand }: { onOpenCommand?: () => void }) {
  const { user, logout } = useAuth();
  const {
    theme,
    toggleTheme,
    contrast,
    toggleContrast,
    locale,
    setLocale,
    fontScale,
    adjustFontScale,
    toggleSidebar,
  } = usePreferences();
  const t = useTranslate();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 no-print">
      {/* Statutory strip */}
      <div className="border-b border-line bg-surface-2">
        <div className="flex h-8 items-center justify-between gap-4 px-4">
          <p className="flex items-center gap-2 truncate text-2xs text-muted">
            <span aria-hidden className="text-sm leading-none">
              🇮🇳
            </span>
            <span className="truncate">
              Government of India · Department of Land Resources · Ministry of Rural Development
            </span>
          </p>

          <div className="flex shrink-0 items-center gap-1">
            <div
              className="flex items-center rounded border border-line"
              role="group"
              aria-label="Text size"
            >
              <button
                type="button"
                onClick={() => adjustFontScale("down")}
                className="px-1.5 py-0.5 text-2xs text-muted hover:text-ink"
                aria-label="Decrease text size"
              >
                A−
              </button>
              <button
                type="button"
                onClick={() => adjustFontScale("reset")}
                className={cn(
                  "border-x border-line px-1.5 py-0.5 text-2xs",
                  fontScale === 1 ? "text-ink font-semibold" : "text-muted hover:text-ink",
                )}
                aria-label="Reset text size"
              >
                A
              </button>
              <button
                type="button"
                onClick={() => adjustFontScale("up")}
                className="px-1.5 py-0.5 text-2xs text-muted hover:text-ink"
                aria-label="Increase text size"
              >
                A+
              </button>
            </div>

            <button
              type="button"
              onClick={toggleContrast}
              className={cn(
                "rounded p-1.5 text-muted hover:bg-surface hover:text-ink",
                contrast === "high" && "bg-primary text-primary-fg hover:text-primary-fg",
              )}
              aria-label="Toggle high contrast"
              aria-pressed={contrast === "high"}
              title="High contrast"
            >
              <Contrast size={14} />
            </button>

            <button
              type="button"
              onClick={toggleTheme}
              className="rounded p-1.5 text-muted hover:bg-surface hover:text-ink"
              aria-label={theme === "light" ? "Switch to dark theme" : "Switch to light theme"}
              title="Theme"
            >
              {theme === "light" ? <Moon size={14} /> : <Sun size={14} />}
            </button>

            <label className="sr-only" htmlFor="locale-select">
              Language
            </label>
            <div className="flex items-center gap-1 rounded border border-line px-1.5">
              <Globe size={12} className="text-muted" aria-hidden />
              <select
                id="locale-select"
                value={locale}
                onChange={(e) => setLocale(e.target.value as Locale)}
                className="bg-transparent py-0.5 text-2xs text-ink focus:outline-none"
              >
                <option value="en">English</option>
                <option value="hi">हिन्दी</option>
                <option value="mr">मराठी</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Product chrome */}
      <div className="border-b border-line bg-surface">
        <div className="flex h-14 items-center gap-3 px-4">
          <button
            type="button"
            onClick={toggleSidebar}
            className="rounded-md p-2 text-muted hover:bg-surface-2 hover:text-ink lg:hidden"
            aria-label="Toggle navigation"
          >
            <Menu size={18} />
          </button>

          <Link href="/dashboard" className="rounded-md focus-visible:ring-2">
            <BhumiLogo animated />
          </Link>

          <button
            type="button"
            onClick={onOpenCommand}
            className="ml-4 hidden max-w-md flex-1 items-center gap-2 rounded-md border border-line
                       bg-surface-2 px-3 py-1.5 text-left text-sm text-muted transition-colors
                       hover:border-primary/40 hover:text-ink md:flex"
          >
            <Search size={15} aria-hidden />
            <span className="flex-1 truncate">
              Search records, batches, villages…
            </span>
            <kbd className="rounded border border-line bg-surface px-1.5 py-0.5 font-mono text-2xs text-muted">
              Ctrl K
            </kbd>
          </button>

          <div className="ml-auto flex items-center gap-1">
            <Link
              href="/notifications"
              className="relative rounded-md p-2 text-muted hover:bg-surface-2 hover:text-ink"
              aria-label="Notifications"
            >
              <Bell size={18} />
            </Link>

            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((open) => !open)}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-surface-2"
                aria-expanded={menuOpen}
                aria-haspopup="menu"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-2xs font-bold text-primary-fg">
                  {(user?.full_name ?? "?")
                    .split(" ")
                    .map((part) => part[0])
                    .slice(0, 2)
                    .join("")
                    .toUpperCase()}
                </span>
                <span className="hidden text-left leading-tight sm:block">
                  <span className="block text-xs font-semibold text-ink">
                    {user?.full_name ?? "Signed out"}
                  </span>
                  <span className="block text-2xs text-muted">
                    {user?.designation ?? "—"}
                  </span>
                </span>
              </button>

              {menuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setMenuOpen(false)}
                    aria-hidden
                  />
                  <div
                    role="menu"
                    className="absolute right-0 z-50 mt-1 w-64 animate-fade-up rounded-card border
                               border-line bg-surface p-1 shadow-overlay"
                  >
                    <div className="border-b border-line px-3 py-2.5">
                      <p className="text-sm font-semibold text-ink">{user?.full_name}</p>
                      <p className="text-2xs text-muted">{user?.email}</p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {user?.roles.map((role) => (
                          <span
                            key={role}
                            className="pill bg-primary-soft text-primary"
                          >
                            {role.replace(/_/g, " ")}
                          </span>
                        ))}
                      </div>
                      {user?.jurisdictions.length ? (
                        <p className="mt-2 text-2xs text-muted">
                          Jurisdiction:{" "}
                          {user.jurisdictions.map((j) => j.label ?? j.level).join(", ")}
                        </p>
                      ) : null}
                    </div>

                    <Link
                      href="/settings"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-2 rounded px-3 py-2 text-sm text-ink hover:bg-surface-2"
                      role="menuitem"
                    >
                      <Settings size={15} aria-hidden /> {t("settings")}
                    </Link>
                    <Link
                      href="/settings/profile"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-2 rounded px-3 py-2 text-sm text-ink hover:bg-surface-2"
                      role="menuitem"
                    >
                      <UserIcon size={15} aria-hidden /> Profile & security
                    </Link>
                    <button
                      type="button"
                      onClick={() => void logout()}
                      className="flex w-full items-center gap-2 rounded px-3 py-2 text-sm text-danger hover:bg-danger-soft"
                      role="menuitem"
                    >
                      <LogOut size={15} aria-hidden /> {t("signOut")}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
