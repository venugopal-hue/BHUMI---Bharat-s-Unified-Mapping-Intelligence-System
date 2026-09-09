"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronRight, FileText, Loader2, Upload, X } from "lucide-react";

import { Card, PageHeader, ProgressBar } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { intakeApi, isDemoMode } from "@/lib/api";
import { useTranslate } from "@/lib/preferences";
import { formatBytes, sha256 } from "@/lib/utils";

interface FileEntry {
  id: string;
  file: File;
  sha: string | null;
  stage: "hashing" | "presigned" | "uploading" | "registering" | "done" | "error";
  progress: number;
  error: string | null;
  documentId: string | null;
  storageKey: string | null;
}

export default function UploadPage() {
  const t = useTranslate();
  const toast = useToast();
  const dropRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [files, setFiles] = useState<FileEntry[]>([]);
  const filesRef = useRef<FileEntry[]>([]);
  useEffect(() => { filesRef.current = files; }, [files]);
  const [isDragging, setIsDragging] = useState(false);
  const [batchName, setBatchName] = useState("");
  const [recordYear, setRecordYear] = useState(new Date().getFullYear().toString());
  const [districtId, setDistrictId] = useState("");
  const [villageId, setVillageId] = useState("");
  const [documentType, setDocumentType] = useState("");
  const [batchId, setBatchId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const addFiles = useCallback((incoming: File[]) => {
    const valid = incoming.filter(
      (f) => (f.type === "application/pdf" || f.type.startsWith("image/")) && f.size < 100 * 1024 * 1024,
    );
    if (valid.length < incoming.length) {
      toast.warning("Some files skipped", "Only PDF or image files under 100 MB are accepted.");
    }
    setFiles((prev) => [
      ...prev,
      ...valid.map((f) => ({
        id: `${f.name}-${f.size}-${f.lastModified}`,
        file: f,
        sha: null,
        stage: "hashing" as const,
        progress: 0,
        error: null,
        documentId: null,
        storageKey: null,
      })),
    ]);
  }, [toast]);

  const onDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(false);
    addFiles(Array.from(event.dataTransfer.files));
  }, [addFiles]);

  const removeFile = (id: string) => setFiles((prev) => prev.filter((f) => f.id !== id));
  const updateFile = (id: string, patch: Partial<FileEntry>) =>
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));

  const startUpload = async () => {
    if (files.length === 0) return;
    setRunning(true);
    let bid = batchId;
    if (!bid) {
      try {
        const batch = await intakeApi.createBatch({
          name: batchName || `Upload ${new Date().toLocaleString("en-IN")}`,
          record_year: recordYear ? Number(recordYear) : null,
          district_id: districtId || null,
          village_id: villageId || null,
          document_type: documentType || null,
        });
        bid = batch.id;
        setBatchId(bid);
      } catch (err) {
        toast.error("Could not create batch", (err as Error).message);
        setRunning(false);
        return;
      }
    }

    const pending = files.filter((f) => f.stage !== "done" && f.stage !== "error");
    await Promise.all(pending.map(async (entry) => {
      updateFile(entry.id, { stage: "hashing" });
      try {
        const hash = await sha256(entry.file);
        updateFile(entry.id, { sha: hash, stage: "presigned" });
      } catch {
        updateFile(entry.id, { stage: "error", error: "Could not hash file." });
      }
    }));

    const hashed = filesRef.current.filter((f) => f.sha && f.stage === "presigned");
    if (!hashed.length) { setRunning(false); return; }

    let uploads: { url: string; key: string; filename: string }[] = [];
    try {
      const result = await intakeApi.presign(
        hashed.map((f) => ({ filename: f.file.name, mime_type: f.file.type || "application/octet-stream", size_bytes: f.file.size })),
        bid,
      );
      uploads = result.uploads;
    } catch (err) {
      toast.error("Could not get upload URL", (err as Error).message);
      setRunning(false);
      return;
    }

    await Promise.all(hashed.map(async (entry, index) => {
      const up = uploads[index];
      if (!up) return;
      updateFile(entry.id, { stage: "uploading", storageKey: up.key });
      try {
        if (isDemoMode() || up.url === "#demo") {
          // Simulate upload progress in demo mode
          for (let p = 10; p <= 100; p += 10) {
            await new Promise((r) => setTimeout(r, 50));
            updateFile(entry.id, { progress: p });
          }
        } else {
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("PUT", up.url);
          xhr.setRequestHeader("Content-Type", entry.file.type || "application/octet-stream");
          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable)
              updateFile(entry.id, { progress: Math.round((event.loaded / event.total) * 100) });
          };
          xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error(`HTTP ${xhr.status}`)));
          xhr.onerror = () => reject(new Error("Network error"));
          xhr.send(entry.file);
        });
        }
        updateFile(entry.id, { stage: "registering", progress: 100 });
      } catch (err) {
        updateFile(entry.id, { stage: "error", error: `Upload failed: ${(err as Error).message}` });
      }
    }));

    const uploaded = filesRef.current.filter((f) => f.stage === "registering" && f.sha && f.storageKey);
    if (uploaded.length) {
      try {
        await intakeApi.register(
          uploaded.map((f) => ({ filename: f.file.name, storage_key: f.storageKey!, content_sha256: f.sha!, mime_type: f.file.type || "application/octet-stream", size_bytes: f.file.size })),
          bid,
        );
        uploaded.forEach((f) => updateFile(f.id, { stage: "done" }));
        toast.success(`${uploaded.length} file${uploaded.length > 1 ? "s" : ""} queued`, "The pipeline is now processing them.");
      } catch (err) {
        uploaded.forEach((f) => updateFile(f.id, { stage: "error", error: (err as Error).message }));
        toast.error("Registration failed", (err as Error).message);
      }
    }
    setRunning(false);
  };

  const done = files.filter((f) => f.stage === "done").length;
  const errors = files.filter((f) => f.stage === "error").length;

  return (
    <>
      <PageHeader
        title={t("uploadTitle")}
        description={t("uploadDesc")}
        breadcrumbs={[{ label: t("upload") }]}
        actions={batchId && (
          <Link href={`/batches/${batchId}`} className="btn-secondary">
            View batch <ChevronRight size={14} />
          </Link>
        )}
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <div
            ref={dropRef}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            className={`flex min-h-[200px] cursor-pointer flex-col items-center justify-center gap-3
                        rounded-card border-2 border-dashed p-8 text-center transition-colors
                        ${isDragging ? "border-primary bg-primary-soft" : "border-line bg-surface hover:border-primary/50"}`}
          >
            <Upload size={28} className={isDragging ? "text-primary" : "text-muted"} aria-hidden />
            <div>
              <p className="text-sm font-semibold text-ink">
                {isDragging ? "Drop to add" : t("dropZone")}
              </p>
              <p className="mt-1 text-xs text-muted">{t("supportedFormats")}</p>
            </div>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept="application/pdf,image/*"
              className="sr-only"
              onChange={(e) => addFiles(Array.from(e.target.files ?? []))}
              aria-label={t("uploadTitle")}
            />
          </div>

          {files.length > 0 && (
            <div className="card divide-y divide-line overflow-hidden">
              {files.map((entry) => <FileRow key={entry.id} entry={entry} onRemove={removeFile} />)}
            </div>
          )}

          {files.length > 0 && (
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-muted">
                {files.length} file{files.length > 1 ? "s" : ""}
                {done > 0 && ` · ${done} queued`}
                {errors > 0 && ` · ${errors} ${t("failed")}`}
              </p>
              <div className="flex gap-2">
                <button type="button" className="btn-secondary btn-sm" onClick={() => { setFiles([]); setBatchId(null); }} disabled={running}>
                  {t("cancel")}
                </button>
                <button type="button" className="btn-primary" onClick={startUpload} disabled={running || files.every((f) => f.stage === "done")}>
                  {running ? (
                    <><Loader2 size={15} className="animate-spin" /> Uploading…</>
                  ) : (
                    <><Upload size={15} /> {t("upload")} {files.filter((f) => f.stage !== "done").length} file{files.filter((f) => f.stage !== "done").length > 1 ? "s" : ""}</>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        <Card title="Batch details" subtitle="Helps scope the records to the right jurisdiction">
          <div className="space-y-4">
            <div>
              <label className="label" htmlFor="batch-name">{t("batchesTitle")}</label>
              <input id="batch-name" className="input" value={batchName} onChange={(e) => setBatchName(e.target.value)} placeholder="e.g. Shirdi Village — Khatauni 2024" disabled={!!batchId} />
            </div>
            <div>
              <label className="label" htmlFor="record-year">{t("colYear")}</label>
              <input id="record-year" type="number" className="input" value={recordYear} onChange={(e) => setRecordYear(e.target.value)} min={1900} max={new Date().getFullYear()} disabled={!!batchId} />
            </div>
            <div>
              <label className="label" htmlFor="doc-type">{t("documentType")}</label>
              <select id="doc-type" className="input" value={documentType} onChange={(e) => setDocumentType(e.target.value)} disabled={!!batchId}>
                <option value="">Auto-detect</option>
                {[["SEVEN_TWELVE","7/12 Extract (Satbara)"],["KHATAUNI","Khatauni"],["JAMABANDI","Jamabandi"],["PAHANI","Pahani"],["ADANGAL","Adangal"],["CHITTA","Chitta"],["PATTA","Patta"],["ROR","Record of Rights"],["MUTATION_REGISTER","Mutation Register"],["SALE_DEED","Sale Deed"],["CADASTRAL_MAP","Cadastral Map"]].map(([value,label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <p className="text-2xs leading-relaxed text-muted">
              District and village can be left blank — the pipeline reads them from the text.
            </p>
            {batchId && (
              <div className="rounded-card border border-success/30 bg-success-soft p-3 text-xs text-success">
                <CheckCircle2 size={14} className="mb-1" aria-hidden />
                <p className="font-semibold">Batch created</p>
                <p className="mt-0.5 font-mono text-2xs">{batchId}</p>
                <Link href={`/batches/${batchId}`} className="mt-2 inline-block font-medium underline">Watch pipeline progress →</Link>
              </div>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}

function FileRow({ entry, onRemove }: { entry: FileEntry; onRemove: (id: string) => void }) {
  const stageLabel: Record<FileEntry["stage"], string> = {
    hashing: "Preparing…", presigned: "Ready", uploading: `Uploading ${entry.progress}%`,
    registering: "Queuing…", done: "Queued", error: "Failed",
  };
  return (
    <div className="flex items-start gap-3 px-3 py-2.5">
      <FileText size={16} className={entry.stage === "error" ? "mt-0.5 shrink-0 text-danger" : entry.stage === "done" ? "mt-0.5 shrink-0 text-success" : "mt-0.5 shrink-0 text-muted"} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-ink">{entry.file.name}</p>
        <div className="mt-0.5 flex items-center gap-2">
          <span className="text-2xs text-muted">{formatBytes(entry.file.size)}</span>
          <span className={`text-2xs font-medium ${entry.stage === "error" ? "text-danger" : entry.stage === "done" ? "text-success" : "text-muted"}`}>{stageLabel[entry.stage]}</span>
        </div>
        {entry.stage === "uploading" && <ProgressBar value={entry.progress} className="mt-1.5" />}
        {entry.error && <p className="mt-1 flex items-center gap-1 text-2xs text-danger"><AlertTriangle size={11} aria-hidden /> {entry.error}</p>}
      </div>
      {entry.stage !== "uploading" && entry.stage !== "registering" && (
        <button type="button" onClick={() => onRemove(entry.id)} className="shrink-0 rounded p-0.5 text-muted hover:text-danger" aria-label={`Remove ${entry.file.name}`}>
          <X size={14} />
        </button>
      )}
    </div>
  );
}
