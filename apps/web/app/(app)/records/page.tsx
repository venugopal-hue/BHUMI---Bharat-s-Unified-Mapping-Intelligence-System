"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Download, Search, SlidersHorizontal, X } from "lucide-react";

import { ConfidenceBadge } from "@/components/ui/Confidence";
import { Card, EmptyState, PageHeader, SkeletonRows, StatusPill } from "@/components/ui/primitives";
import { recordsApi } from "@/lib/api";
import { useTranslate } from "@/lib/preferences";
import { debounce, documentTypeLabel, formatArea, formatDate } from "@/lib/utils";
import type { RecordSummary } from "@/lib/types";

function exportCsv(records: RecordSummary[]) {
  const header = ["ID", "Survey No", "Khasra No", "Khata No", "Mutation No", "Registration No", "Owner", "Village", "District", "Area (sqm)", "Type", "Year", "Language", "Confidence", "Status"];
  const rows = records.map((r) => [
    r.id, r.survey_number ?? "", r.khasra_number ?? "", r.khata_number ?? "", r.mutation_number ?? "", r.registration_number ?? "",
    r.owner_name ?? "", r.village_id ?? "", r.district_id ?? "",
    r.plot_area_sqm ?? "", r.document_type ?? "", r.record_year ?? "", r.source_language ?? "",
    r.confidence_overall, r.verification_status,
  ]);
  const csv = [header, ...rows].map((r) => r.map(String).map((v) => `"${v.replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "bhumi_records.csv"; a.click();
  URL.revokeObjectURL(url);
}

export default function RecordsPage() {
  const t = useTranslate();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [docType, setDocType] = useState("");
  const [status, setStatus] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const DOC_TYPES = [
    ["", t("allTypes")],
    ["PATTA",            "Patta"],
    ["SEVEN_TWELVE",     "7/12 Extract"],
    ["KHATAUNI",         "Khatauni"],
    ["JAMABANDI",        "Jamabandi"],
    ["PAHANI",           "Pahani"],
    ["ROR",              "Record of Rights"],
    ["RTC",              "RTC (Karnataka)"],
    ["MUTATION_REGISTER","Mutation Register"],
    ["CADASTRAL_MAP",    "Cadastral Map"],
  ];

  const STATUSES = [
    ["", t("allStatuses")],
    ["AUTO_APPROVED", t("autoApproved")],
    ["VERIFIED", t("verified")],
    ["PENDING_REVIEW", t("awaitingReview")],
    ["IN_REVIEW", t("inReview")],
    ["REJECTED", t("rejected")],
  ];

  const debouncedSetQ = debounce((value: string) => setDebouncedQ(value), 350);

  const { data: records, isLoading } = useQuery({
    queryKey: ["records", "search", debouncedQ, docType, status],
    queryFn: () =>
      recordsApi.search({
        q: debouncedQ || undefined,
        document_type: docType || undefined,
        verification_status: status || undefined,
        page_size: 50,
      }),
    staleTime: 15_000,
  });

  const hasFilters = !!docType || !!status;

  return (
    <>
      <PageHeader
        title={t("recordsTitle")}
        description={t("recordsDesc")}
        breadcrumbs={[{ label: t("records") }]}
        actions={
          <button
            type="button"
            className="btn-secondary"
            onClick={() => exportCsv(records ?? [])}
            disabled={!records?.length}
          >
            <Download size={14} aria-hidden /> {t("export")}
          </button>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative flex-1" style={{ minWidth: 240 }}>
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
          <input
            className="input pl-9"
            placeholder={t("recordSearchPlaceholder")}
            value={q}
            onChange={(e) => { setQ(e.target.value); debouncedSetQ(e.target.value); }}
            aria-label={t("search")}
          />
          {q && (
            <button
              type="button"
              onClick={() => { setQ(""); setDebouncedQ(""); }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted hover:text-ink"
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => setFiltersOpen((o) => !o)}
          className={`btn-secondary flex items-center gap-2 ${filtersOpen || hasFilters ? "border-primary text-primary" : ""}`}
        >
          <SlidersHorizontal size={14} aria-hidden /> {t("filters")}
          {hasFilters && (
            <span className="rounded-full bg-primary px-1.5 text-2xs font-bold text-primary-fg">
              {[docType, status].filter(Boolean).length}
            </span>
          )}
        </button>
      </div>

      {filtersOpen && (
        <div className="mb-4 flex flex-wrap gap-3 rounded-card border border-line bg-surface p-3">
          <div>
            <label className="label" htmlFor="filter-type">{t("documentType")}</label>
            <select id="filter-type" className="input" value={docType} onChange={(e) => setDocType(e.target.value)}>
              {DOC_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="filter-status">{t("colStatus")}</label>
            <select id="filter-status" className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
          {hasFilters && (
            <div className="flex items-end">
              <button type="button" className="btn-ghost btn-sm" onClick={() => { setDocType(""); setStatus(""); }}>
                {t("clearFilters")}
              </button>
            </div>
          )}
        </div>
      )}

      <Card bodyClassName="p-0">
        {isLoading ? (
          <div className="p-4"><SkeletonRows rows={10} /></div>
        ) : !records?.length ? (
          <EmptyState
            title={t("noRecordsFound")}
            description={debouncedQ || hasFilters ? t("tryDifferentSearch") : t("recordsAfterBatch")}
            icon={Search}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-head">{t("colSurveyNo")}</th>
                  <th className="table-head">{t("colOwner")}</th>
                  <th className="table-head">{t("colVillage")}</th>
                  <th className="table-head">{t("colType")}</th>
                  <th className="table-head">{t("colYear")}</th>
                  <th className="table-head text-right">{t("colArea")}</th>
                  <th className="table-head text-right">{t("colConfidence")}</th>
                  <th className="table-head">{t("colStatus")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {records.map((record) => (
                  <tr
                    key={record.id}
                    className="group hover:bg-surface-2 cursor-pointer"
                    onClick={() => router.push(`/records/${record.id}`)}
                  >
                    <td className="table-cell">
                      <Link
                        href={`/records/${record.id}`}
                        className="id-text font-semibold text-primary hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {record.survey_number ?? record.khasra_number ?? "—"}
                      </Link>
                    </td>
                    <td className="table-cell">
                      <span className="block max-w-[180px] truncate text-sm text-ink">{record.owner_name ?? "—"}</span>
                      {record.owner_name_roman && record.owner_name_roman !== record.owner_name && (
                        <span className="block max-w-[180px] truncate text-2xs text-muted">{record.owner_name_roman}</span>
                      )}
                    </td>
                    <td className="table-cell text-sm text-muted">
                      {record.village_id ?? "—"}
                    </td>
                    <td className="table-cell text-xs text-muted">{documentTypeLabel(record.document_type)}</td>
                    <td className="table-cell text-xs tabular-nums text-muted">{record.record_year ?? "—"}</td>
                    <td className="table-cell text-right text-sm tabular-nums text-muted">{formatArea(record.plot_area_sqm)}</td>
                    <td className="table-cell text-right"><ConfidenceBadge value={record.confidence_overall} size="sm" /></td>
                    <td className="table-cell"><StatusPill status={record.verification_status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
