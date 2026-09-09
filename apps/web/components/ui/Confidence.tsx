"use client";

import { CONFIDENCE_META, cn, confidenceBand } from "@/lib/utils";

/**
 * The confidence ramp — BHUMI's signature visual.
 *
 * Every extracted value carries one. Three rules, always:
 *   1. Colour is never the only signal — an icon and a number ride along.
 *   2. The number is shown, not just the band, because 0.71 and 0.84 are both
 *      "medium" but only one of them is worth arguing with.
 *   3. The tooltip explains where the score came from, so a verifier learns
 *      which signals to trust rather than treating it as an oracle.
 */
export function ConfidenceBadge({
  value,
  size = "md",
  showLabel = false,
  breakdown,
  className,
}: {
  value: number;
  size?: "sm" | "md";
  showLabel?: boolean;
  breakdown?: Record<string, number> | null;
  className?: string;
}) {
  const band = confidenceBand(value);
  const meta = CONFIDENCE_META[band];
  const percent = Math.round(value * 100);

  const tooltip = breakdown
    ? `${meta.label} · ${percent}%\n` +
      Object.entries(breakdown)
        .map(([key, score]) => `  ${key}: ${(score * 100).toFixed(0)}%`)
        .join("\n")
    : `${meta.label} · ${percent}%`;

  return (
    <span
      title={tooltip}
      className={cn(
        "pill tabular-nums",
        meta.bg,
        meta.text,
        size === "sm" ? "px-1.5 py-0 text-[0.6rem]" : "",
        className,
      )}
    >
      <span aria-hidden>{meta.icon}</span>
      <span>{percent}%</span>
      {showLabel && <span className="font-normal normal-case">{meta.label}</span>}
      <span className="sr-only">{meta.label}</span>
    </span>
  );
}

/** A slim vertical rail on the left edge of a field row. */
export function ConfidenceRail({ value, className }: { value: number; className?: string }) {
  const meta = CONFIDENCE_META[confidenceBand(value)];
  return (
    <span
      aria-hidden
      className={cn("block w-1 shrink-0 rounded-full", meta.rail, className)}
    />
  );
}

/** Distribution bar used on dashboards to show the shape of a batch's quality. */
export function ConfidenceBar({
  distribution,
  className,
}: {
  distribution: { high: number; good: number; medium: number; low: number };
  className?: string;
}) {
  const total =
    distribution.high + distribution.good + distribution.medium + distribution.low || 1;

  const segments = [
    { key: "high" as const, label: "≥95%" },
    { key: "good" as const, label: "85–95%" },
    { key: "medium" as const, label: "70–85%" },
    { key: "low" as const, label: "<70%" },
  ];

  return (
    <div className={className}>
      <div className="flex h-2 overflow-hidden rounded-full bg-surface-2">
        {segments.map(({ key, label }) => {
          const share = (distribution[key] / total) * 100;
          if (share <= 0) return null;
          return (
            <span
              key={key}
              className={CONFIDENCE_META[key].rail}
              style={{ width: `${share}%` }}
              title={`${label}: ${distribution[key]} (${share.toFixed(1)}%)`}
            />
          );
        })}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
        {segments.map(({ key, label }) => (
          <span key={key} className="flex items-center gap-1 text-2xs text-muted">
            <span className={cn("h-2 w-2 rounded-sm", CONFIDENCE_META[key].rail)} aria-hidden />
            {label}
            <span className="font-semibold text-ink">{distribution[key]}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/** Legend, shown once per screen where the ramp appears. */
export function ConfidenceLegend({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-3 text-2xs text-muted", className)}>
      <span className="font-medium">Confidence:</span>
      {(["high", "good", "medium", "low"] as const).map((band) => (
        <span key={band} className="flex items-center gap-1.5">
          <span className={cn("h-2.5 w-2.5 rounded-sm", CONFIDENCE_META[band].rail)} aria-hidden />
          <span>{CONFIDENCE_META[band].label}</span>
        </span>
      ))}
    </div>
  );
}
