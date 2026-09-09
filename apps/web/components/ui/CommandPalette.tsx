"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  Boxes,
  ClipboardCheck,
  CornerDownLeft,
  FileStack,
  Gauge,
  Map as MapIcon,
  Search,
  ShieldCheck,
  Upload,
  type LucideIcon,
} from "lucide-react";

import { recordsApi } from "@/lib/api";
import { cn, documentTypeLabel } from "@/lib/utils";

import { ConfidenceBadge } from "./Confidence";

/**
 * Ctrl+K palette.
 *
 * Small feature, disproportionate effect: a Tehsildar who knows a survey number
 * gets to the record in two seconds instead of navigating three screens.
 */
interface Command {
  id: string;
  label: string;
  hint?: string;
  icon: LucideIcon;
  href: string;
}

const PAGES: Command[] = [
  { id: "dashboard", label: "Dashboard", icon: Gauge, href: "/dashboard" },
  { id: "upload", label: "Upload documents", icon: Upload, href: "/upload" },
  { id: "batches", label: "Batches", icon: Boxes, href: "/batches" },
  { id: "documents", label: "Documents", icon: FileStack, href: "/documents" },
  { id: "review", label: "Review queue", hint: "Start verifying", icon: ClipboardCheck, href: "/review" },
  { id: "records", label: "Search records", icon: Search, href: "/records" },
  { id: "map", label: "Cadastral map", icon: MapIcon, href: "/map" },
  { id: "audit", label: "Audit trail", icon: ShieldCheck, href: "/admin/audit" },
  { id: "progress", label: "Digitization progress", icon: Gauge, href: "/analytics/progress" },
];

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setCursor(0);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const trimmed = query.trim();

  const { data: records = [] } = useQuery({
    queryKey: ["command", "records", trimmed],
    queryFn: () => recordsApi.search({ q: trimmed, page_size: 6 }),
    enabled: open && trimmed.length >= 2,
    staleTime: 10_000,
  });

  const pages = useMemo(() => {
    if (!trimmed) return PAGES;
    const lowered = trimmed.toLowerCase();
    return PAGES.filter((page) => page.label.toLowerCase().includes(lowered));
  }, [trimmed]);

  const results = useMemo(
    () => [
      ...pages.map((page) => ({ kind: "page" as const, ...page })),
      ...records.map((record) => ({
        kind: "record" as const,
        id: record.id,
        href: `/records/${record.id}`,
        record,
      })),
    ],
    [pages, records],
  );

  useEffect(() => setCursor(0), [results.length]);

  if (!open) return null;

  const go = (href: string) => {
    router.push(href);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[95] flex items-start justify-center bg-ink/40 p-4 pt-[12vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-card border border-line bg-surface shadow-overlay"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-line px-4">
          <Search size={16} className="text-muted" aria-hidden />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setCursor((c) => Math.min(c + 1, results.length - 1));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setCursor((c) => Math.max(c - 1, 0));
              } else if (event.key === "Enter" && results[cursor]) {
                event.preventDefault();
                go(results[cursor].href);
              }
            }}
            placeholder="Jump to a page, or search by survey number or owner name…"
            className="flex-1 bg-transparent py-3.5 text-sm text-ink placeholder:text-muted focus:outline-none"
            aria-label="Search"
          />
          <kbd className="rounded border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-2xs text-muted">
            Esc
          </kbd>
        </div>

        <div className="max-h-[52vh] overflow-y-auto p-1.5">
          {results.length === 0 && (
            <p className="px-3 py-8 text-center text-sm text-muted">
              {trimmed.length < 2
                ? "Type at least two characters to search records."
                : `Nothing matched “${trimmed}”.`}
            </p>
          )}

          {results.map((result, index) => {
            const selected = index === cursor;
            if (result.kind === "page") {
              const Icon = result.icon;
              return (
                <button
                  key={`page-${result.id}`}
                  type="button"
                  onMouseEnter={() => setCursor(index)}
                  onClick={() => go(result.href)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left",
                    selected ? "bg-primary-soft" : "hover:bg-surface-2",
                  )}
                >
                  <Icon size={16} className="shrink-0 text-muted" aria-hidden />
                  <span className="flex-1 text-sm text-ink">{result.label}</span>
                  {result.hint && <span className="text-2xs text-muted">{result.hint}</span>}
                  {selected && <CornerDownLeft size={13} className="text-muted" aria-hidden />}
                </button>
              );
            }

            const record = result.record;
            return (
              <button
                key={`record-${result.id}`}
                type="button"
                onMouseEnter={() => setCursor(index)}
                onClick={() => go(result.href)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left",
                  selected ? "bg-primary-soft" : "hover:bg-surface-2",
                )}
              >
                <FileStack size={16} className="shrink-0 text-muted" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-ink">
                    <span className="id-text font-semibold">
                      {record.survey_number ?? record.khasra_number ?? "—"}
                    </span>
                    {record.owner_name ? ` · ${record.owner_name}` : ""}
                  </span>
                  <span className="block truncate text-2xs text-muted">
                    {documentTypeLabel(record.document_type)}
                    {record.record_year ? ` · ${record.record_year}` : ""}
                  </span>
                </span>
                <ConfidenceBadge value={record.confidence_overall} size="sm" />
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-3 border-t border-line bg-surface-2 px-4 py-2 text-2xs text-muted">
          <span>
            <kbd className="font-mono">↑↓</kbd> navigate
          </span>
          <span>
            <kbd className="font-mono">↵</kbd> open
          </span>
          <span className="ml-auto">Searches owner names in any script</span>
        </div>
      </div>
    </div>
  );
}
