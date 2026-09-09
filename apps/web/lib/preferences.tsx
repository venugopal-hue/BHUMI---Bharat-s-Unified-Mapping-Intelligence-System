"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { STRINGS } from "./i18n";

/**
 * Accessibility and display preferences.
 *
 * Text size, contrast and language switching are not nice-to-haves here — GIGW
 * 3.0 requires them on a government site, and they are the difference between
 * a usable and an unusable screen for a lot of counter staff.
 */

type Theme = "light" | "dark";
type Contrast = "normal" | "high";
type Density = "comfortable" | "compact";
export type Locale = "en" | "hi" | "mr";

interface Preferences {
  theme: Theme;
  contrast: Contrast;
  density: Density;
  locale: Locale;
  fontScale: number;
  sidebarCollapsed: boolean;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  setContrast: (contrast: Contrast) => void;
  toggleContrast: () => void;
  setDensity: (density: Density) => void;
  setLocale: (locale: Locale) => void;
  adjustFontScale: (direction: "up" | "down" | "reset") => void;
  toggleSidebar: () => void;
}

const PreferencesContext = createContext<Preferences | null>(null);

const STORAGE_KEY = "bhumi.preferences";
const FONT_STEPS = [0.875, 1, 1.125, 1.25];

interface Stored {
  theme: Theme;
  contrast: Contrast;
  density: Density;
  locale: Locale;
  fontScale: number;
  sidebarCollapsed: boolean;
}

const DEFAULTS: Stored = {
  theme: "light",
  contrast: "normal",
  density: "comfortable",
  locale: "en",
  fontScale: 1,
  sidebarCollapsed: false,
};

function read(): Stored {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Stored>) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Stored>(DEFAULTS);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setState(read());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const root = document.documentElement;
    root.dataset.theme = state.theme;
    root.dataset.contrast = state.contrast;
    root.dataset.density = state.density;
    root.lang = state.locale;
    root.style.setProperty("--font-scale", String(state.fontScale));
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* private browsing — preferences simply do not persist */
    }
  }, [state, hydrated]);

  const update = useCallback(
    (partial: Partial<Stored>) => setState((prev) => ({ ...prev, ...partial })),
    [],
  );

  const adjustFontScale = useCallback((direction: "up" | "down" | "reset") => {
    setState((prev) => {
      if (direction === "reset") return { ...prev, fontScale: 1 };
      const index = FONT_STEPS.indexOf(prev.fontScale);
      const current = index === -1 ? 1 : index;
      const next =
        direction === "up"
          ? Math.min(current + 1, FONT_STEPS.length - 1)
          : Math.max(current - 1, 0);
      return { ...prev, fontScale: FONT_STEPS[next] };
    });
  }, []);

  const value = useMemo<Preferences>(
    () => ({
      ...state,
      setTheme: (theme) => update({ theme }),
      toggleTheme: () => update({ theme: state.theme === "light" ? "dark" : "light" }),
      setContrast: (contrast) => update({ contrast }),
      toggleContrast: () =>
        update({ contrast: state.contrast === "normal" ? "high" : "normal" }),
      setDensity: (density) => update({ density }),
      setLocale: (locale) => update({ locale }),
      adjustFontScale,
      toggleSidebar: () => update({ sidebarCollapsed: !state.sidebarCollapsed }),
    }),
    [state, update, adjustFontScale],
  );

  return (
    <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>
  );
}

export function usePreferences(): Preferences {
  const context = useContext(PreferencesContext);
  if (!context) throw new Error("usePreferences must be used inside <PreferencesProvider>.");
  return context;
}

/** Returns a translate function bound to the current locale. */
export function useTranslate() {
  const { locale } = usePreferences();
  return useCallback(
    (key: string, ...replacements: string[]) => {
      const template = STRINGS[key]?.[locale] ?? STRINGS[key]?.["en"] ?? key;
      if (!replacements.length) return template;
      return replacements.reduce((s, r, i) => s.replace(`{${i}}`, r), template);
    },
    [locale],
  );
}
