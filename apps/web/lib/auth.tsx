"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { authApi, tokens, ApiError } from "./api";
import type { User } from "./types";

/* ─────────────────────────────────────────────────────────
   Permissions
───────────────────────────────────────────────────────── */
export const Perm = {
  // Documents
  DOCUMENT_UPLOAD:        "document:upload",
  DOCUMENT_READ:          "document:read",
  DOCUMENT_REPROCESS:     "document:reprocess",
  // Records
  RECORD_READ:            "record:read",
  RECORD_EDIT:            "record:edit",
  RECORD_EXPORT:          "record:export",
  RECORD_DISPUTE:         "record:dispute",
  RECORD_ANNOTATE:        "record:annotate",
  // Reviews
  REVIEW_CLAIM:           "review:claim",
  REVIEW_APPROVE:         "review:approve",
  REVIEW_BULK_APPROVE:    "review:bulk_approve",
  REVIEW_ESCALATE:        "review:escalate",
  // GIS
  GIS_READ:               "gis:read",
  GIS_EDIT:               "gis:edit",
  GIS_GEOREFERENCE:       "gis:georeference",
  // Insights
  INSIGHTS_READ:          "insights:read",
  INSIGHTS_OPERATIONS:    "insights:operations",
  // Rules
  RULES_READ:             "rules:read",
  RULES_EDIT:             "rules:edit",
  // Integrations
  INTEGRATION_READ:       "integration:read",
  INTEGRATION_MANAGE:     "integration:manage",
  // Users
  USER_READ:              "user:read",
  USER_MANAGE:            "user:manage",
  ADMIN_MANAGE:           "admin:manage",
  // Audit
  AUDIT_READ:             "audit:read",
  AUDIT_VERIFY:           "audit:verify",
  AUDIT_FULL:             "audit:full",
  // Models
  MODEL_READ:             "model:read",
  MODEL_PROMOTE:          "model:promote",
  // Platform (internal team)
  PLATFORM_CONFIG:        "platform:config",
  PLATFORM_DEPLOY:        "platform:deploy",
  PLATFORM_LOGS:          "platform:logs",
  PLATFORM_DEBUG:         "platform:debug",
  PLATFORM_API_CONFIG:    "platform:api_config",
  PLATFORM_USERS:         "platform:users",
  PLATFORM_ANALYTICS:     "platform:analytics",
  // System
  SYSTEM_CONFIG:          "system:config",
  // Citizen
  CITIZEN_SELF_VIEW:      "citizen:self_view",
} as const;

const ALL_PERMS = Object.values(Perm);

/* ─────────────────────────────────────────────────────────
   Role definitions — two domains
───────────────────────────────────────────────────────── */
export type RoleDomain = "platform" | "government";

export interface RoleDef {
  value: string;
  label: string;
  domain: RoleDomain;
  description: string;
  permissions: string[];
}

export const ROLES: RoleDef[] = [
  /* ── Platform Team ── */
  {
    value: "owner",
    label: "Owner",
    domain: "platform",
    description: "God mode — full access to everything",
    permissions: ALL_PERMS,
  },
  {
    value: "platform_admin",
    label: "Platform Admin",
    domain: "platform",
    description: "Platform config, deployments, full access except owner controls",
    permissions: ALL_PERMS.filter((p) => p !== Perm.ADMIN_MANAGE),
  },
  {
    value: "developer",
    label: "Developer",
    domain: "platform",
    description: "Logs, debug tools, API config — read-only on all data",
    permissions: [
      Perm.PLATFORM_LOGS, Perm.PLATFORM_DEBUG, Perm.PLATFORM_API_CONFIG,
      Perm.DOCUMENT_READ, Perm.RECORD_READ, Perm.INSIGHTS_READ,
      Perm.AUDIT_READ, Perm.MODEL_READ, Perm.USER_READ,
    ],
  },
  {
    value: "designer",
    label: "Designer",
    domain: "platform",
    description: "UI/UX access — no data access",
    permissions: [Perm.DOCUMENT_READ, Perm.RECORD_READ],
  },
  {
    value: "analyst",
    label: "Analyst",
    domain: "platform",
    description: "Analytics, dashboards, reports — no edits",
    permissions: [
      Perm.PLATFORM_ANALYTICS, Perm.INSIGHTS_READ, Perm.INSIGHTS_OPERATIONS,
      Perm.AUDIT_READ, Perm.AUDIT_FULL, Perm.RECORD_READ, Perm.DOCUMENT_READ,
    ],
  },
  {
    value: "support",
    label: "Support",
    domain: "platform",
    description: "View users and assist officers — no edits",
    permissions: [Perm.USER_READ, Perm.RECORD_READ, Perm.DOCUMENT_READ, Perm.AUDIT_READ],
  },
  /* ── Government Officers ── */
  {
    value: "super_admin",
    label: "Super Admin",
    domain: "government",
    description: "National level — manages state admins",
    permissions: ALL_PERMS,
  },
  {
    value: "admin",
    label: "State Admin",
    domain: "government",
    description: "State level — manages officers within their state",
    permissions: ALL_PERMS.filter((p) => !([Perm.ADMIN_MANAGE, Perm.SYSTEM_CONFIG, Perm.PLATFORM_CONFIG] as readonly string[]).includes(p)),
  },
  {
    value: "district_collector",
    label: "District Collector",
    domain: "government",
    description: "District oversight — all land operations",
    permissions: [
      Perm.DOCUMENT_UPLOAD, Perm.DOCUMENT_READ, Perm.DOCUMENT_REPROCESS,
      Perm.RECORD_READ, Perm.RECORD_EDIT, Perm.RECORD_EXPORT, Perm.RECORD_ANNOTATE,
      Perm.REVIEW_CLAIM, Perm.REVIEW_APPROVE, Perm.REVIEW_BULK_APPROVE, Perm.REVIEW_ESCALATE,
      Perm.GIS_READ, Perm.GIS_EDIT,
      Perm.INSIGHTS_READ, Perm.INSIGHTS_OPERATIONS,
      Perm.RULES_READ, Perm.USER_READ,
      Perm.AUDIT_READ, Perm.AUDIT_VERIFY,
      Perm.MODEL_READ,
    ],
  },
  {
    value: "tehsildar",
    label: "Tehsildar",
    domain: "government",
    description: "Tehsil level — review, approve, manage records",
    permissions: [
      Perm.DOCUMENT_UPLOAD, Perm.DOCUMENT_READ, Perm.DOCUMENT_REPROCESS,
      Perm.RECORD_READ, Perm.RECORD_EDIT, Perm.RECORD_EXPORT, Perm.RECORD_ANNOTATE,
      Perm.REVIEW_CLAIM, Perm.REVIEW_APPROVE, Perm.REVIEW_ESCALATE,
      Perm.GIS_READ, Perm.INSIGHTS_READ,
      Perm.USER_READ, Perm.AUDIT_READ,
    ],
  },
  {
    value: "talathi",
    label: "Talathi / Patwari",
    domain: "government",
    description: "Village level — data entry and record verification",
    permissions: [
      Perm.DOCUMENT_READ, Perm.RECORD_READ,
      Perm.REVIEW_CLAIM, Perm.REVIEW_APPROVE,
      Perm.INSIGHTS_READ,
    ],
  },
  {
    value: "operator",
    label: "Data Entry Operator",
    domain: "government",
    description: "Scans and uploads physical documents",
    permissions: [Perm.DOCUMENT_UPLOAD, Perm.DOCUMENT_READ, Perm.RECORD_READ],
  },
  {
    value: "gis_officer",
    label: "GIS Officer",
    domain: "government",
    description: "GIS mapping, georeferencing, spatial analysis",
    permissions: [
      Perm.GIS_READ, Perm.GIS_EDIT, Perm.GIS_GEOREFERENCE,
      Perm.RECORD_READ, Perm.INSIGHTS_READ,
    ],
  },
  {
    value: "legal_officer",
    label: "Legal Officer",
    domain: "government",
    description: "Dispute resolution and legal annotations",
    permissions: [
      Perm.RECORD_READ, Perm.RECORD_DISPUTE, Perm.RECORD_ANNOTATE,
      Perm.AUDIT_READ, Perm.INSIGHTS_READ,
    ],
  },
  {
    value: "auditor",
    label: "Auditor",
    domain: "government",
    description: "Read-only audit trail access across districts",
    permissions: [
      Perm.AUDIT_READ, Perm.AUDIT_VERIFY, Perm.AUDIT_FULL,
      Perm.RECORD_READ, Perm.DOCUMENT_READ, Perm.INSIGHTS_READ,
    ],
  },
  {
    value: "viewer",
    label: "Viewer (Read-only)",
    domain: "government",
    description: "Internal read-only — other departments",
    permissions: [Perm.RECORD_READ, Perm.INSIGHTS_READ],
  },
  {
    value: "citizen",
    label: "Citizen",
    domain: "government",
    description: "Public — can only view their own records",
    permissions: [Perm.CITIZEN_SELF_VIEW],
  },
];

export const ROLE_MAP = Object.fromEntries(ROLES.map((r) => [r.value, r]));
export const PLATFORM_ROLES = ROLES.filter((r) => r.domain === "platform");
export const GOVT_ROLES     = ROLES.filter((r) => r.domain === "government");

/* ─────────────────────────────────────────────────────────
   Context
───────────────────────────────────────────────────────── */
interface AuthState {
  user: User | null;
  loading: boolean;
  error: string | null;
  mfaRequired: boolean;
  login: (username: string, password: string, mfa_code?: string) => Promise<boolean>;
  logout: () => Promise<void>;
  can: (...permissions: string[]) => boolean;
  hasRole: (...roles: string[]) => boolean;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser]         = useState<User | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [mfaRequired, setMfaRequired] = useState(false);

  // On mount, if we have a stored token, hydrate the user profile.
  useEffect(() => {
    if (!tokens.access()) {
      setLoading(false);
      return;
    }
    authApi.me()
      .then(setUser)
      .catch(() => { tokens.clear(); setUser(null); })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (username: string, password: string, mfa_code?: string): Promise<boolean> => {
    setError(null);
    setMfaRequired(false);
    setLoading(true);
    try {
      const resp = await authApi.login(username, password, mfa_code);
      tokens.set(resp.access_token, resp.refresh_token);
      const me = await authApi.me();
      setUser(me);
      setLoading(false);
      return true;
    } catch (err: unknown) {
      setLoading(false);
      if (err instanceof ApiError) {
        const detail = err.detail as { error?: string; message?: string } | null;
        if (detail?.error === "mfa_required") {
          setMfaRequired(true);
          setError(null);
          return false;
        }
        setError(err.message);
      } else {
        setError("Sign in failed. Check your connection and try again.");
      }
      return false;
    }
  }, []);

  const logout = useCallback(async () => {
    await authApi.logout();
    setUser(null);
    router.push("/login");
  }, [router]);

  const refresh = useCallback(async () => {
    if (!tokens.access()) return;
    try {
      const me = await authApi.me();
      setUser(me);
    } catch {
      /* silently ignore if offline */
    }
  }, []);

  const can = useCallback(
    (...permissions: string[]) => !!user && permissions.every((p) => user.permissions.includes(p)),
    [user],
  );

  const hasRole = useCallback(
    (...roles: string[]) => !!user && roles.some((r) => user.roles.includes(r)),
    [user],
  );

  const value = useMemo<AuthState>(
    () => ({ user, loading, error, mfaRequired, login, logout, can, hasRole, refresh }),
    [user, loading, error, mfaRequired, login, logout, can, hasRole, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>.");
  return ctx;
}

export function useRequireAuth(requiredPermission?: string) {
  const { user, loading } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (loading) return;
    if (!user) { router.replace("/login"); return; }
    if (requiredPermission && !user.permissions.includes(requiredPermission)) {
      router.replace("/unauthorized");
    }
  }, [user, loading, router, requiredPermission]);
  return { user, loading };
}
