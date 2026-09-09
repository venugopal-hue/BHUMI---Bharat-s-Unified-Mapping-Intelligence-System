"use client";

import Link from "next/link";
import { ShieldOff } from "lucide-react";
import { useAuth } from "@/lib/auth";

export default function UnauthorizedPage() {
  const { user } = useAuth();

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-danger/10 text-danger">
        <ShieldOff size={28} />
      </div>
      <h1 className="mt-5 text-2xl font-bold text-ink">Access denied</h1>
      <p className="mt-2 max-w-sm text-sm text-muted">
        Your role <strong>{user?.roles[0] ?? "unknown"}</strong> does not have permission to view this page.
        Contact your administrator if you believe this is a mistake.
      </p>
      <Link href="/dashboard" className="mt-6 btn-primary px-5 py-2.5 text-sm">
        Back to dashboard
      </Link>
    </div>
  );
}
