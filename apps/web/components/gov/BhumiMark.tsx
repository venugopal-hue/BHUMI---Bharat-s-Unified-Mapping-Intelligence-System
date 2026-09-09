"use client";

import { cn } from "@/lib/utils";

export function BhumiMark({
  size = 28,
  animated = false,
  className,
}: {
  size?: number;
  animated?: boolean;
  className?: string;
}) {
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src="/emblem-of-india.svg"
      alt="Emblem of India"
      width={size}
      height={Math.round(size * 1.6)}
      className={cn("shrink-0 object-contain", className)}
      style={{ maxHeight: 44 }}
    />
  );
}

export function BhumiLogo({
  compact = false,
  animated = false,
  className,
}: {
  compact?: boolean;
  animated?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <BhumiMark size={compact ? 22 : 28} />
      {!compact && (
        <span className="flex flex-col leading-none">
          <span className="text-[1.1rem] font-bold tracking-tight text-ink">BHUMI</span>
          <span className="mt-0.5 text-[0.6rem] font-medium tracking-[0.02em] text-muted">
            Bharat's Unified Mapping &amp; Intelligence System
          </span>
        </span>
      )}
    </span>
  );
}
