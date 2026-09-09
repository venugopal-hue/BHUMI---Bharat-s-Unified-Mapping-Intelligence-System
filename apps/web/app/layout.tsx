import type { Metadata, Viewport } from "next";

import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "BHUMI — Bharat's Unified Mapping & Intelligence System",
    template: "%s · BHUMI",
  },
  description:
    "AI-driven platform for digitizing, validating and managing land records. " +
    "Department of Land Resources, Ministry of Rural Development, Government of India.",
  applicationName: "BHUMI",
  authors: [{ name: "Department of Land Resources, Government of India" }],
  keywords: [
    "land records",
    "digitization",
    "DILRMP",
    "cadastral",
    "revenue records",
    "Government of India",
  ],
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0B4F8F" },
    { media: "(prefers-color-scheme: dark)", color: "#020617" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&family=Noto+Sans+Devanagari:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        {/* Apply saved preferences before first paint so the page does not flash
            the wrong theme or text size at a user who needs the larger one. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                var p = JSON.parse(localStorage.getItem('bhumi.preferences') || '{}');
                var r = document.documentElement;
                r.dataset.theme = p.theme || 'light';
                r.dataset.contrast = p.contrast || 'normal';
                r.dataset.density = p.density || 'comfortable';
                if (p.fontScale) r.style.setProperty('--font-scale', String(p.fontScale));
              } catch (e) {}
            `,
          }}
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
