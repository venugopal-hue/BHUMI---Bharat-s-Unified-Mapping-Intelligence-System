"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { GovHeader } from "@/components/gov/GovHeader";
import { Sidebar } from "@/components/gov/Sidebar";
import { CommandPalette } from "@/components/ui/CommandPalette";
import { LoadingState } from "@/components/ui/primitives";
import { reviewApi } from "@/lib/api";
import { Perm, useAuth, useRequireAuth } from "@/lib/auth";
import { useTranslate } from "@/lib/preferences";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { loading, user } = useRequireAuth();
  const { can } = useAuth();
  const t = useTranslate();
  const [commandOpen, setCommandOpen] = useState(false);

  // Ctrl+K from anywhere in the app shell.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Queue depth on the sidebar badge — a verifier should see work arriving
  // without navigating to look for it.
  const { data: queueStats } = useQuery({
    queryKey: ["review", "stats"],
    queryFn: () => reviewApi.stats(),
    enabled: !!user && can(Perm.REVIEW_CLAIM),
    refetchInterval: 30_000,
  });

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingState label="Signing you in…" />
      </div>
    );
  }
  if (!user) return null;

  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main-content" className="skip-link">
        {t("skipToContent")}
      </a>

      <GovHeader onOpenCommand={() => setCommandOpen(true)} />


<div className="flex w-full flex-1">
        <Sidebar reviewCount={queueStats?.total_open ?? 0} />
        <div className="flex min-w-0 flex-1 flex-col">
          <main id="main-content" className="min-w-0 flex-1 px-5 py-5" tabIndex={-1}>
            {children}
          </main>
        </div>
      </div>

      <CommandPalette open={commandOpen} onClose={() => setCommandOpen(false)} />
    </div>
  );
}
