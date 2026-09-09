"use client";

import React from "react";
import { Shield, Users } from "lucide-react";
import { PageHeader } from "@/components/ui/primitives";
import { Can } from "@/components/rbac/Can";
import { Perm, PLATFORM_ROLES, GOVT_ROLES } from "@/lib/auth";

const PERM_GROUPS = [
  { label: "Documents",    perms: ["document:upload", "document:read", "document:reprocess"] },
  { label: "Records",      perms: ["record:read", "record:edit", "record:export", "record:dispute", "record:annotate"] },
  { label: "Reviews",      perms: ["review:claim", "review:approve", "review:bulk_approve", "review:escalate"] },
  { label: "GIS",          perms: ["gis:read", "gis:edit", "gis:georeference"] },
  { label: "Insights",     perms: ["insights:read", "insights:operations"] },
  { label: "Users",        perms: ["user:read", "user:manage", "admin:manage"] },
  { label: "Audit",        perms: ["audit:read", "audit:verify", "audit:full"] },
  { label: "Models",       perms: ["model:read", "model:promote"] },
  { label: "Platform",     perms: ["platform:config", "platform:deploy", "platform:logs", "platform:debug", "platform:api_config", "platform:analytics"] },
  { label: "System",       perms: ["system:config", "citizen:self_view"] },
];

function RoleMatrix({ roles }: { roles: typeof PLATFORM_ROLES }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-line">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-line bg-surface-2">
            <th className="px-4 py-3 text-left font-semibold text-muted w-40">Permission</th>
            {roles.map((r) => (
              <th key={r.value} className="px-3 py-3 text-center font-semibold text-ink">
                <div>{r.label}</div>
                <div className="text-2xs font-normal text-muted">{r.value}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {PERM_GROUPS.map((group) => (
            <React.Fragment key={group.label}>
              <tr className="bg-surface-2/60">
                <td colSpan={roles.length + 1} className="px-4 py-1.5 text-2xs font-bold uppercase tracking-wider text-muted">
                  {group.label}
                </td>
              </tr>
              {group.perms.map((perm) => (
                <tr key={perm} className="border-t border-line hover:bg-surface-2/40">
                  <td className="px-4 py-2 font-mono text-2xs text-muted">{perm}</td>
                  {roles.map((r) => (
                    <td key={r.value} className="px-3 py-2 text-center">
                      {r.permissions.includes(perm)
                        ? <span className="inline-block h-4 w-4 rounded-full bg-success/20 text-success text-2xs leading-4">✓</span>
                        : <span className="inline-block h-4 w-4 rounded-full bg-surface-2 text-muted text-2xs leading-4">–</span>
                      }
                    </td>
                  ))}
                </tr>
              ))}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function RolesPage() {
  return (
    <Can perm={Perm.USER_MANAGE} fallback={
      <div className="flex min-h-[40vh] items-center justify-center text-muted text-sm">
        You don&apos;t have permission to view this page.
      </div>
    }>
      <PageHeader
        title="Roles & Permissions"
        description="Permission matrix across all BHUMI roles — platform team and government officers."
        breadcrumbs={[{ label: "Admin" }, { label: "Roles & Permissions" }]}
      />

      <div className="space-y-8">
        <section>
          <div className="mb-3 flex items-center gap-2">
            <Shield size={15} className="text-primary" />
            <h2 className="text-sm font-semibold text-ink">Platform Team</h2>
            <span className="pill border border-primary/30 bg-primary/10 text-2xs text-primary">{PLATFORM_ROLES.length} roles</span>
          </div>
          <RoleMatrix roles={PLATFORM_ROLES} />
        </section>

        <section>
          <div className="mb-3 flex items-center gap-2">
            <Users size={15} className="text-primary" />
            <h2 className="text-sm font-semibold text-ink">Government Officers</h2>
            <span className="pill border border-primary/30 bg-primary/10 text-2xs text-primary">{GOVT_ROLES.length} roles</span>
          </div>
          <RoleMatrix roles={GOVT_ROLES} />
        </section>
      </div>
    </Can>
  );
}
