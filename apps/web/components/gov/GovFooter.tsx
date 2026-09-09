import Link from "next/link";

/**
 * The footer GIGW 3.0 requires: policy links, content ownership, and a
 * last-updated stamp. Government sites are audited against this list.
 */
const LINKS = [
  { href: "/policies/terms", label: "Terms of Use" },
  { href: "/policies/privacy", label: "Privacy Policy" },
  { href: "/policies/copyright", label: "Copyright" },
  { href: "/policies/hyperlinking", label: "Hyperlinking Policy" },
  { href: "/accessibility", label: "Accessibility Statement" },
  { href: "/help", label: "Help" },
  { href: "/sitemap", label: "Sitemap" },
  { href: "/developers", label: "Developer API" },
];

export function GovFooter({ compact = false }: { compact?: boolean }) {
  const updated = new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date());

  if (compact) {
    return (
      <footer className="no-print border-t border-line bg-surface-2 px-4 py-2.5">
        <div className="mx-auto flex max-w-[1800px] flex-wrap items-center justify-between gap-2 text-2xs text-muted">
          <span>
            © {new Date().getFullYear()} Government of India · BHUMI v1.0
          </span>
          <span className="flex flex-wrap gap-3">
            {LINKS.slice(0, 4).map((link) => (
              <Link key={link.href} href={link.href} className="hover:text-ink hover:underline">
                {link.label}
              </Link>
            ))}
            <span>Last updated: {updated}</span>
          </span>
        </div>
      </footer>
    );
  }

  return (
    <footer className="no-print border-t border-line bg-surface-2">
      <div className="mx-auto max-w-[1800px] px-4 py-8">
        <div className="grid gap-8 md:grid-cols-4">
          <div>
            <h2 className="text-sm font-bold text-ink">BHUMI</h2>
            <p className="mt-1 text-xs text-muted">
              Bharat&apos;s Unified Mapping &amp; Intelligence System
            </p>
            <p className="mt-3 text-2xs leading-relaxed text-muted">
              AI-driven digitization and validation of land records, built for the
              Digital India Land Records Modernization Programme.
            </p>
          </div>

          <div>
            <h3 className="text-2xs font-semibold uppercase tracking-wider text-muted">
              Policies
            </h3>
            <ul className="mt-2 space-y-1.5">
              {LINKS.slice(0, 4).map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-xs text-ink hover:underline">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-2xs font-semibold uppercase tracking-wider text-muted">
              Support
            </h3>
            <ul className="mt-2 space-y-1.5">
              {LINKS.slice(4).map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-xs text-ink hover:underline">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-2xs font-semibold uppercase tracking-wider text-muted">
              Content owned by
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-ink">
              Department of Land Resources
              <br />
              Ministry of Rural Development
              <br />
              Government of India
            </p>
            <p className="mt-3 text-2xs text-muted">
              <span className="font-semibold text-ink">Impact Makers</span>
              <br />
              Independent development team
            </p>
            <p className="mt-3 text-2xs text-muted">
              Hosted on NIC MeghRaj Cloud
            </p>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4 text-2xs text-muted">
          <span>
            © {new Date().getFullYear()} Government of India. All rights reserved.
          </span>
          <span>Last updated: {updated} · Version 1.0.0</span>
        </div>
      </div>
    </footer>
  );
}
