"use client";

import { useAuth } from "@/lib/auth";
import type { ReactNode } from "react";

interface CanProps {
  perm?: string | string[];   // require ALL listed permissions
  role?: string | string[];   // require ANY listed role
  fallback?: ReactNode;
  children: ReactNode;
}

export function Can({ perm, role, fallback = null, children }: CanProps) {
  const { can, hasRole } = useAuth();

  if (perm) {
    const perms = Array.isArray(perm) ? perm : [perm];
    if (!can(...perms)) return <>{fallback}</>;
  }

  if (role) {
    const roles = Array.isArray(role) ? role : [role];
    if (!hasRole(...roles)) return <>{fallback}</>;
  }

  return <>{children}</>;
}
