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
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User as FirebaseUser,
} from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";

import { auth, db } from "./firebase";
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

const GOVT_READ_PERMS = [
  Perm.DOCUMENT_READ, Perm.RECORD_READ, Perm.RECORD_EXPORT,
  Perm.GIS_READ, Perm.INSIGHTS_READ, Perm.INSIGHTS_OPERATIONS,
  Perm.RULES_READ, Perm.INTEGRATION_READ, Perm.USER_READ,
  Perm.AUDIT_READ, Perm.AUDIT_FULL, Perm.MODEL_READ,
];

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
   Firestore profile
───────────────────────────────────────────────────────── */
export interface BhumiProfile {
  uid: string;
  email: string;
  fullName: string;
  employeeCode: string;
  designation: string;
  domain: RoleDomain;
  department: string;
  state: string;
  district: string;
  mobile: string;
  status: "pending" | "active" | "suspended" | "rejected";
  permissions: string[];
  createdAt: unknown;
  approvedAt?: unknown;
  approvedBy?: string;
}

async function fetchProfile(uid: string): Promise<BhumiProfile | null> {
  try {
    const snap = await getDoc(doc(db, "bhumi_users", uid));
    return snap.exists() ? (snap.data() as BhumiProfile) : null;
  } catch {
    return null;
  }
}

/* ─────────────────────────────────────────────────────────
   Context
───────────────────────────────────────────────────────── */
interface AuthState {
  user: User | null;
  profile: BhumiProfile | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<boolean>;
  register: (data: RegisterData) => Promise<boolean>;
  logout: () => Promise<void>;
  can: (...permissions: string[]) => boolean;
  hasRole: (...roles: string[]) => boolean;
  refresh: () => Promise<void>;
}

export interface RegisterData {
  fullName: string;
  employeeCode: string;
  email: string;
  mobile: string;
  designation: string;
  domain: RoleDomain;
  department: string;
  state: string;
  district: string;
  password: string;
}

const AuthContext = createContext<AuthState | null>(null);

function firebaseUserToUser(fb: FirebaseUser, profile: BhumiProfile): User {
  const roleDef = ROLE_MAP[profile.designation];
  const perms = profile.permissions?.length
    ? profile.permissions
    : roleDef?.permissions ?? [];
  return {
    id: fb.uid,
    username: profile.employeeCode,
    full_name: profile.fullName,
    email: profile.email,
    preferred_locale: "en",
    roles: [profile.designation],
    permissions: perms,
    mfa_enabled: false,
    jurisdictions: profile.district
      ? [{ level: "DISTRICT" as const, ref_id: null, label: profile.district }]
      : [],
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [fbUser, setFbUser]   = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<BhumiProfile | null>(null);
  const [user, setUser]       = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const loadProfile = useCallback(async (fb: FirebaseUser) => {
    const p = await fetchProfile(fb.uid);
    if (p && p.status === "active") {
      setProfile(p);
      setUser(firebaseUserToUser(fb, p));
    } else {
      setProfile(p);
      setUser(null);
    }
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fb) => {
      setFbUser(fb);
      if (fb) {
        await loadProfile(fb);
      } else {
        setProfile(null);
        setUser(null);
      }
      setLoading(false);
    });
    return unsub;
  }, [loadProfile]);

  const login = useCallback(async (email: string, password: string): Promise<boolean> => {
    setError(null);
    setLoading(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      const p = await fetchProfile(cred.user.uid);
      if (!p) {
        await signOut(auth);
        setError("Account not found. Please register first.");
        setLoading(false);
        return false;
      }
      if (p.status === "pending") {
        await signOut(auth);
        setError("Your account is pending admin approval. You will be notified by email once activated.");
        setLoading(false);
        return false;
      }
      if (p.status === "rejected") {
        await signOut(auth);
        setError("Your registration was not approved. Contact your administrator.");
        setLoading(false);
        return false;
      }
      if (p.status === "suspended") {
        await signOut(auth);
        setError("This account has been suspended. Contact your administrator.");
        setLoading(false);
        return false;
      }
      setProfile(p);
      setUser(firebaseUserToUser(cred.user, p));
      setLoading(false);
      return true;
    } catch (err: unknown) {
      const code = (err as { code?: string }).code ?? "";
      if (code === "auth/user-not-found" || code === "auth/wrong-password" || code === "auth/invalid-credential") {
        setError("Invalid email or password.");
      } else if (code === "auth/too-many-requests") {
        setError("Too many failed attempts. Try again later.");
      } else if (code === "auth/user-disabled") {
        setError("This account has been disabled.");
      } else {
        setError("Sign in failed. Check your connection and try again.");
      }
      setLoading(false);
      return false;
    }
  }, []);

  const register = useCallback(async (data: RegisterData): Promise<boolean> => {
    setError(null);
    try {
      const roleDef = ROLE_MAP[data.designation];
      const cred = await createUserWithEmailAndPassword(auth, data.email, data.password);
      const profileData: BhumiProfile = {
        uid:         cred.user.uid,
        email:       data.email,
        fullName:    data.fullName,
        employeeCode: data.employeeCode,
        designation: data.designation,
        domain:      data.domain,
        department:  data.department,
        state:       data.state,
        district:    data.district,
        mobile:      data.mobile,
        status:      "pending",
        permissions: roleDef?.permissions ?? [],
        createdAt:   serverTimestamp(),
      };
      await setDoc(doc(db, "bhumi_users", cred.user.uid), profileData);
      await setDoc(doc(db, "pending_registrations", cred.user.uid), {
        ...profileData,
        submittedAt: serverTimestamp(),
      });
      await signOut(auth);
      return true;
    } catch (err: unknown) {
      const code = (err as { code?: string }).code ?? "";
      if (code === "auth/email-already-in-use") {
        setError("An account with this email already exists.");
      } else if (code === "auth/weak-password") {
        setError("Password must be at least 6 characters.");
      } else {
        setError("Registration failed. Check your connection and try again.");
      }
      return false;
    }
  }, []);

  const logout = useCallback(async () => {
    await signOut(auth);
    setUser(null);
    setProfile(null);
    setFbUser(null);
    router.push("/login");
  }, [router]);

  const refresh = useCallback(async () => {
    if (fbUser) await loadProfile(fbUser);
  }, [fbUser, loadProfile]);

  const can = useCallback(
    (...permissions: string[]) => !!user && permissions.every((p) => user.permissions.includes(p)),
    [user],
  );

  const hasRole = useCallback(
    (...roles: string[]) => !!user && roles.some((r) => user.roles.includes(r)),
    [user],
  );

  const value = useMemo<AuthState>(
    () => ({ user, profile, loading, error, login, register, logout, can, hasRole, refresh }),
    [user, profile, loading, error, login, register, logout, can, hasRole, refresh],
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
