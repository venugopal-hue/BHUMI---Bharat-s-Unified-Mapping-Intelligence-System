"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  Boxes,
  ChevronLeft,
  ClipboardCheck,
  Cpu,
  FileSearch,
  FileStack,
  Gauge,
  Layers,
  Map as MapIcon,
  Plug,
  ScrollText,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Upload,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react";

import { Perm, useAuth } from "@/lib/auth";
import { usePreferences, useTranslate } from "@/lib/preferences";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  labelKey: string;
  icon: LucideIcon;
  permission?: string;
  badgeKey?: "review";
}

interface NavGroup {
  labelKey: string;
  items: NavItem[];
}

const NAV: NavGroup[] = [
  {
    labelKey: "work",
    items: [
      { href: "/dashboard",  labelKey: "dashboard",  icon: Gauge },
      { href: "/upload",     labelKey: "upload",     icon: Upload,        permission: Perm.DOCUMENT_UPLOAD },
      { href: "/batches",    labelKey: "batches",    icon: Boxes,         permission: Perm.DOCUMENT_READ },
      { href: "/documents",  labelKey: "documents",  icon: FileStack,     permission: Perm.DOCUMENT_READ },
      { href: "/review",     labelKey: "review",     icon: ClipboardCheck, permission: Perm.REVIEW_CLAIM, badgeKey: "review" },
    ],
  },
  {
    labelKey: "data",
    items: [
      { href: "/records",    labelKey: "records",    icon: Search,         permission: Perm.RECORD_READ },
      { href: "/map",        labelKey: "map",        icon: MapIcon,        permission: Perm.GIS_READ },
      { href: "/duplicates", labelKey: "duplicates", icon: Layers,         permission: Perm.REVIEW_APPROVE },
    ],
  },
  {
    labelKey: "analytics",
    items: [
      { href: "/analytics/progress",      labelKey: "progress",      icon: Gauge,            permission: Perm.INSIGHTS_READ },
      { href: "/analytics/accuracy",      labelKey: "accuracy",      icon: FileSearch,        permission: Perm.INSIGHTS_READ },
      { href: "/analytics/operations",    labelKey: "operations",    icon: SlidersHorizontal, permission: Perm.INSIGHTS_OPERATIONS },
      { href: "/analytics/verification",  labelKey: "verification",  icon: ClipboardCheck,    permission: Perm.INSIGHTS_READ },
    ],
  },
  {
    labelKey: "admin",
    items: [
      { href: "/admin/users",        labelKey: "userManagement",   icon: Users,      permission: Perm.USER_MANAGE },
      { href: "/admin/roles",        labelKey: "rolesPermissions", icon: UserCog,    permission: Perm.USER_MANAGE },
      { href: "/admin/rules",        labelKey: "rules",            icon: ScrollText, permission: Perm.RULES_READ },
      { href: "/admin/integrations", labelKey: "integrations",     icon: Plug,       permission: Perm.INTEGRATION_READ },
      { href: "/admin/models",       labelKey: "models",           icon: Cpu,        permission: Perm.MODEL_READ },
      { href: "/admin/audit",        labelKey: "audit",            icon: ShieldCheck,permission: Perm.AUDIT_READ },
    ],
  },
  {
    labelKey: "account",
    items: [
      { href: "/notifications", labelKey: "notifications", icon: Bell },
      { href: "/settings",      labelKey: "settings",      icon: Settings },
    ],
  },
];

// Group labels that don't have entries in STRINGS get a static fallback
const GROUP_FALLBACK: Record<string, string> = {
  work:      "Work",
  data:      "Data",
  analytics: "Analytics",
  admin:     "Admin",
  account:   "Account",
};

export function Sidebar({ reviewCount = 0 }: { reviewCount?: number }) {
  const pathname = usePathname();
  const { can } = useAuth();
  const { sidebarCollapsed, toggleSidebar } = usePreferences();
  const t = useTranslate();

  const groups = NAV.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.permission || can(item.permission)),
  })).filter((group) => group.items.length > 0);

  return (
    <aside
      className={cn(
        "no-print sticky top-[5.5rem] hidden h-[calc(100vh-5.5rem)] shrink-0 border-r",
        "border-line bg-surface transition-[width] duration-200 lg:flex lg:flex-col",
        sidebarCollapsed ? "w-16" : "w-60",
      )}
      aria-label="Main navigation"
    >
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {groups.map((group) => {
          const groupLabel = t(group.labelKey) !== group.labelKey
            ? t(group.labelKey)
            : GROUP_FALLBACK[group.labelKey] ?? group.labelKey;
          return (
            <div key={group.labelKey} className="mb-4">
              {!sidebarCollapsed && (
                <p className="px-3 pb-1.5 text-2xs font-semibold uppercase tracking-wider text-muted">
                  {groupLabel}
                </p>
              )}
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  const Icon = item.icon;
                  const badge = item.badgeKey === "review" ? reviewCount : 0;
                  const label = t(item.labelKey);

                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        title={sidebarCollapsed ? label : undefined}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                          sidebarCollapsed && "justify-center px-0",
                          active
                            ? "bg-primary-soft font-semibold text-primary"
                            : "text-muted hover:bg-surface-2 hover:text-ink",
                        )}
                      >
                        <Icon size={17} className="shrink-0" aria-hidden />
                        {!sidebarCollapsed && (
                          <>
                            <span className="truncate">{label}</span>
                            {badge > 0 && (
                              <span className="ml-auto rounded-full bg-accent px-1.5 py-0.5 text-2xs font-bold tabular-nums text-white">
                                {badge > 999 ? "999+" : badge}
                              </span>
                            )}
                          </>
                        )}
                        {sidebarCollapsed && badge > 0 && (
                          <span className="absolute ml-6 -mt-4 h-2 w-2 rounded-full bg-accent" />
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      <button
        type="button"
        onClick={toggleSidebar}
        className="flex items-center gap-2 border-t border-line px-4 py-2.5 text-xs text-muted hover:text-ink"
        aria-label={sidebarCollapsed ? "Expand navigation" : "Collapse navigation"}
      >
        <ChevronLeft size={15} className={cn("transition-transform", sidebarCollapsed && "rotate-180")} aria-hidden />
        {!sidebarCollapsed && <span>Collapse</span>}
      </button>
    </aside>
  );
}
