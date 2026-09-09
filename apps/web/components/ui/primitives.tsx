"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  ChevronRight,
  FileQuestion,
  Loader2,
  type LucideIcon,
} from "lucide-react";

import { STATUS_META, QUEUE_META, SEVERITY_META, cn, formatNumber } from "@/lib/utils";

/* ── Status pills ────────────────────────────────────────────────── */
export function StatusPill({ status, className }: { status: string; className?: string }) {
  const meta = STATUS_META[status] ?? {
    label: status.replace(/_/g, " ").toLowerCase(),
    className: "bg-surface-2 text-muted border border-line",
  };
  return <span className={cn("pill", meta.className, className)}>{meta.label}</span>;
}

export function QueuePill({ type, className }: { type: string; className?: string }) {
  const meta = QUEUE_META[type] ?? {
    label: type,
    className: "bg-surface-2 text-muted",
    hint: "",
  };
  return (
    <span className={cn("pill", meta.className, className)} title={meta.hint}>
      {meta.label}
    </span>
  );
}

export function SeverityPill({ severity, className }: { severity: string; className?: string }) {
  const meta = SEVERITY_META[severity] ?? {
    label: severity,
    className: "bg-surface-2 text-muted",
  };
  return <span className={cn("pill", meta.className, className)}>{meta.label}</span>;
}

/* ── Cards & sections ────────────────────────────────────────────── */
export function Card({
  title,
  subtitle,
  action,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("card", className)}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0">
            {title && <h2 className="truncate text-sm font-semibold text-ink">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </header>
      )}
      <div className={cn("p-4", bodyClassName)}>{children}</div>
    </section>
  );
}

export function KpiCard({
  label,
  value,
  sublabel,
  trend,
  icon: Icon,
  href,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  sublabel?: string;
  trend?: number | null;
  icon?: LucideIcon;
  href?: string;
  tone?: "default" | "success" | "warn" | "danger" | "primary";
}) {
  const toneClass = {
    default: "text-ink",
    success: "text-success",
    warn: "text-warn",
    danger: "text-danger",
    primary: "text-primary",
  }[tone];

  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-2xs font-medium uppercase tracking-wider text-muted">{label}</p>
        {Icon && <Icon size={16} className="shrink-0 text-muted" aria-hidden />}
      </div>
      <p className={cn("mt-2 text-2xl font-bold tabular-nums leading-none", toneClass)}>
        {value}
      </p>
      <div className="mt-1.5 flex items-center gap-2">
        {sublabel && <p className="text-2xs text-muted">{sublabel}</p>}
        {trend !== null && trend !== undefined && (
          <span
            className={cn(
              "text-2xs font-semibold tabular-nums",
              trend >= 0 ? "text-success" : "text-danger",
            )}
          >
            {trend >= 0 ? "▲" : "▼"} {Math.abs(trend).toFixed(1)}%
          </span>
        )}
      </div>
    </>
  );

  if (href) {
    return (
      <Link href={href} className="card card-hover block p-4 transition-transform hover:-translate-y-px">
        {body}
      </Link>
    );
  }
  return <div className="card p-4">{body}</div>;
}

/* ── Breadcrumbs (GIGW requires them on internal pages) ──────────── */
export function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="no-print">
      <ol className="flex flex-wrap items-center gap-1 text-xs text-muted">
        <li>
          <Link href="/dashboard" className="hover:text-ink hover:underline">
            Home
          </Link>
        </li>
        {items.map((item, index) => (
          <li key={`${item.label}-${index}`} className="flex items-center gap-1">
            <ChevronRight size={12} aria-hidden className="text-muted/60" />
            {item.href && index < items.length - 1 ? (
              <Link href={item.href} className="hover:text-ink hover:underline">
                {item.label}
              </Link>
            ) : (
              <span aria-current="page" className="font-medium text-ink">
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function PageHeader({
  title,
  description,
  breadcrumbs,
  actions,
}: {
  title: string;
  description?: string;
  breadcrumbs?: { label: string; href?: string }[];
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5">
      {breadcrumbs && <Breadcrumbs items={breadcrumbs} />}
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight text-ink">{title}</h1>
          {description && <p className="mt-1 max-w-3xl text-sm text-muted">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}

/* ── States: never show a blank screen ───────────────────────────── */
export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted">
      <Loader2 size={22} className="animate-spin" aria-hidden />
      <p className="text-sm">{label}</p>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  icon: Icon = FileQuestion,
  action,
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <span className="mb-1 flex h-12 w-12 items-center justify-center rounded-full bg-surface-2">
        <Icon size={22} className="text-muted" aria-hidden />
      </span>
      <p className="text-sm font-semibold text-ink">{title}</p>
      {description && <p className="max-w-md text-xs leading-relaxed text-muted">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  message,
  onRetry,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <span className="mb-1 flex h-12 w-12 items-center justify-center rounded-full bg-danger-soft">
        <AlertTriangle size={22} className="text-danger" aria-hidden />
      </span>
      <p className="text-sm font-semibold text-ink">{title}</p>
      {message && <p className="max-w-md text-xs leading-relaxed text-muted">{message}</p>}
      {onRetry && (
        <button type="button" onClick={onRetry} className="btn-secondary btn-sm mt-3">
          Try again
        </button>
      )}
    </div>
  );
}

export function SkeletonRows({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="skeleton h-10 w-full" />
      ))}
    </div>
  );
}

/* ── Progress ────────────────────────────────────────────────────── */
export function ProgressBar({
  value,
  max = 100,
  tone = "primary",
  showValue = false,
  className,
}: {
  value: number;
  max?: number;
  tone?: "primary" | "success" | "warn" | "danger";
  showValue?: boolean;
  className?: string;
}) {
  const pct = Math.min(100, Math.max(0, (value / (max || 1)) * 100));
  const toneClass = {
    primary: "bg-primary",
    success: "bg-success",
    warn: "bg-warn",
    danger: "bg-danger",
  }[tone];

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div
        className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2"
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={cn("h-full rounded-full transition-all duration-500", toneClass)}
          style={{ width: `${pct}%` }}
        />
      </div>
      {showValue && (
        <span className="shrink-0 text-2xs font-semibold tabular-nums text-muted">
          {pct.toFixed(0)}%
        </span>
      )}
    </div>
  );
}

export function ProgressRing({
  value,
  size = 40,
  strokeWidth = 4,
  tone = "primary",
}: {
  value: number;
  size?: number;
  strokeWidth?: number;
  tone?: "primary" | "success" | "warn";
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(100, Math.max(0, value)) / 100) * circumference;
  const toneClass = { primary: "stroke-primary", success: "stroke-success", warn: "stroke-warn" }[
    tone
  ];

  return (
    <span className="relative inline-flex" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          className="fill-none stroke-surface-2"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className={cn("fill-none transition-all duration-700", toneClass)}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-2xs font-bold tabular-nums text-ink">
        {Math.round(value)}
      </span>
    </span>
  );
}

/* ── Misc ────────────────────────────────────────────────────────── */
export function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-2xs uppercase tracking-wider text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold tabular-nums text-ink">{value}</dd>
    </div>
  );
}

export function CountBadge({ count }: { count: number }) {
  if (!count) return null;
  return (
    <span className="ml-auto rounded-full bg-primary/12 px-1.5 py-0.5 text-2xs font-bold tabular-nums text-primary">
      {formatNumber(count)}
    </span>
  );
}
