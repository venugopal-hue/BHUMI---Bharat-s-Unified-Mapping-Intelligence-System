# BHUMI — Bharat's Unified Mapping & Intelligence System
### Implementation Plan · Smart India Hackathon · Problem Statement **26018**
**Title:** Intelligent Land Record Digitization and Validation System
**Tagline:** *AI-driven platform for digitizing, validating and managing land records.*
**Document version:** 1.0 · **Date:** 2026-09-06

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Brand Identity & Naming System](#2-brand-identity--naming-system)
3. [Problem Decomposition & Requirement Traceability](#3-problem-decomposition--requirement-traceability)
4. [Solution Overview — The BHUMI Pipeline](#4-solution-overview--the-bhumi-pipeline)
5. [System Architecture](#5-system-architecture)
6. [Module Catalogue](#6-module-catalogue)
7. [Technology Stack](#7-technology-stack)
8. [AI/ML Engine — Detailed Design](#8-aiml-engine--detailed-design)
9. [Validation & Rules Engine](#9-validation--rules-engine)
10. [GIS & Cadastral Subsystem](#10-gis--cadastral-subsystem)
11. [Data Model & Database Design](#11-data-model--database-design)
12. [API Specification](#12-api-specification)
13. [Integration Layer (DILRMP / LRMS / DigiLocker)](#13-integration-layer)
14. [Security, RBAC, Audit & Compliance](#14-security-rbac-audit--compliance)
15. [UI/UX Design System — Gov-Grade](#15-uiux-design-system--gov-grade)
16. [Screen-by-Screen Specification](#16-screen-by-screen-specification)
17. [Repository Structure](#17-repository-structure)
18. [DevOps, Infrastructure & Deployment](#18-devops-infrastructure--deployment)
19. [Phase-Wise Execution Roadmap](#19-phase-wise-execution-roadmap)
20. [Team Allocation Matrix](#20-team-allocation-matrix)
21. [Testing & Quality Strategy](#21-testing--quality-strategy)
22. [Demo Script & Judge Pitch](#22-demo-script--judge-pitch)
23. [Risk Register & Mitigations](#23-risk-register--mitigations)
24. [Success Metrics / KPIs](#24-success-metrics--kpis)
25. [Cost & Scale Model](#25-cost--scale-model)
26. [Future Scope](#26-future-scope)
27. [Appendices](#27-appendices)

---

## 1. Executive Summary

India holds an estimated **hundreds of millions of land record pages** locked in handwritten registers, faded cadastral sheets, scanned PDFs and regional-language ledgers spread across ~7,000 tehsils. Manual digitization under DILRMP is slow, costly and error-prone — a single mis-keyed *khasra* number can cascade into litigation lasting decades. Roughly **two-thirds of civil litigation in India is land-related**.

**BHUMI** is an AI-first, human-in-the-loop platform that ingests any legacy land document — scan, photo, PDF, map sheet — and returns a **structured, validated, geo-linked, audit-trailed digital record**, with every field carrying a confidence score. Anything the AI is unsure about is routed to a trained verifier through a purpose-built dual-pane review console; everything else flows straight through.

### The five pillars

| # | Pillar | What it means |
|---|--------|---------------|
| 1 | **Ingest Anything** | Multi-format (PDF/TIFF/JPG/PNG/map sheets), multi-language (12+ Indic scripts), print + handwriting, damaged/faded/skewed pages. |
| 2 | **Understand Deeply** | Layout-aware document AI: table/region detection → OCR → NER → field classification into a canonical land-record schema. |
| 3 | **Trust but Verify** | Every field gets a 0–1 confidence. Deterministic rules + cross-DB checks + duplicate detection + geometry checks. Low confidence → human queue. |
| 4 | **Learn Continuously** | Every verifier correction becomes a labelled training pair. Scheduled retraining lifts accuracy per district, per script, per document type. |
| 5 | **Govern Openly** | Immutable audit chain, RBAC down to district level, open REST/GraphQL APIs, GIS-linked parcels, real-time dashboards for administrators. |

### Why BHUMI wins

- **Not just OCR** — a full *document-understanding + validation + governance* platform. Judges see an end-to-end workflow, not a demo of Tesseract.
- **Human-in-the-loop is a feature, not a fallback** — the review console is the most polished screen in the product, because that's where real government throughput happens.
- **Geometry-aware** — extracted survey/khasra numbers snap onto cadastral parcels on a live map; area mismatch between text and polygon is auto-flagged. Almost nobody does this.
- **Self-improving** — an active-learning loop with visible before/after accuracy per district.
- **Gov-grade UI** — GIGW 3.0 + WCAG 2.1 AA compliant, bilingual, works on a 4-year-old tehsil office desktop at 1366×768 over a 2 Mbps line.

---

## 2. Brand Identity & Naming System

### 2.1 Name

**BHUMI** — *Bharat's Unified Mapping & Intelligence System*
भूमि (bhūmi) = "land / earth" in Sanskrit. Instantly legible to every Indian stakeholder; the backronym gives it institutional gravity.

### 2.2 Module names (used consistently in UI, docs and code)

Plain-English module names — used identically in the UI, the docs, and the code directory names. No decoder ring required for a judge, a Tehsildar, or a new developer.

| # | Module | Code path | Responsibility |
|---|--------|-----------|----------------|
| 1 | **Intake** | `modules/intake` | Upload, batching, virus scan, dedup, page split, image cleanup, quality gate |
| 2 | **Vision** | `modules/vision` | Document-type classification, layout & table detection, printed + handwritten OCR, confidence calibration |
| 3 | **Extraction** | `modules/extraction` | Indic NER, field mapping, transliteration, unit/date/numeral normalization |
| 4 | **Validation** | `modules/validation` | Rule engine, master-data cross-checks, duplicate detection, geometry reconciliation |
| 5 | **Review** | `modules/review` | Human verification console, queues, locks, SLA, maker–checker |
| 6 | **Mapping** | `modules/mapping` | Cadastral parcels, georeferencing, parcel↔record linking, topology checks |
| 7 | **Insights** | `modules/insights` | Dashboards, progress tracking, accuracy analytics, exports |
| 8 | **Integrations** | `modules/integrations` | DILRMP / state LRMS / DigiLocker connectors, field mapping, webhooks, public API |
| 9 | **Vault** | `modules/vault` | Secure document repository, metadata, hash-chained audit trail, retention |
| 10 | **Learning** | `modules/learning` | Correction capture, dataset build, retraining, model registry, promotion |

> One name, everywhere: the sidebar says **Review**, the folder is `modules/review`, the API is `/api/v1/review`, the Grafana dashboard is "Review Throughput". Nothing to translate.

### 2.3 Visual identity

**Logotype:** `BHUMI` in Inter/Noto Sans Display SemiBold, with a mark: a simplified **cadastral parcel grid** where one polygon is highlighted and a subtle scan-line sweeps across it (animated in the web header, static in print).

**Colour palette** — anchored on Indian government convention (Ashoka blue / saffron accents) but modernized for screen legibility:

| Token | Light | Dark | Use |
|-------|-------|------|-----|
| `--bhumi-primary` | `#0B4F8F` | `#4D9FE8` | Ashoka-derived deep blue — primary actions, headers |
| `--bhumi-primary-fg` | `#FFFFFF` | `#06182B` | Text on primary |
| `--bhumi-accent` | `#C2410C` | `#FB923C` | Saffron-derived — alerts, pending badges |
| `--bhumi-success` | `#15803D` | `#4ADE80` | Verified / high confidence |
| `--bhumi-warn` | `#B45309` | `#FBBF24` | Medium confidence / needs review |
| `--bhumi-danger` | `#B91C1C` | `#F87171` | Rejected / conflict / duplicate |
| `--bhumi-surface` | `#FFFFFF` | `#0F172A` | Cards |
| `--bhumi-bg` | `#F6F8FB` | `#020617` | App ground |
| `--bhumi-border` | `#DCE3ED` | `#1E293B` | Dividers |
| `--bhumi-text` | `#0F172A` | `#E2E8F0` | Body |
| `--bhumi-muted` | `#5A6B82` | `#94A3B8` | Secondary text |

**Confidence colour ramp** (used on every extracted field — this is BHUMI's signature visual):
`≥0.95` green · `0.85–0.95` teal · `0.70–0.85` amber · `<0.70` red. Always paired with a numeric % and an icon, never colour alone (accessibility).

**Typography:** `Inter` for Latin, `Noto Sans Devanagari` / `Noto Sans Tamil` / `Noto Sans Bengali` etc. loaded per-locale. Monospace `JetBrains Mono` for survey numbers and IDs (prevents 0/O, 1/l confusion — critical for land records).

**Iconography:** Lucide, 1.5px stroke, 20px grid.

**Motion:** ≤200ms, ease-out. Scan-line animation on processing cards. Prefers-reduced-motion respected everywhere.

---

## 3. Problem Decomposition & Requirement Traceability

Every line of the problem statement is mapped to a deliverable. **Print this table — it is your defence in the judging round.**

| # | PS Requirement | BHUMI Module | Deliverable | Demo Proof |
|---|----------------|--------------|-------------|------------|
| R1 | Multilingual document recognition (major Indian languages) | Vision + Extraction | 12-language OCR pipeline (Hindi, Marathi, Bengali, Tamil, Telugu, Kannada, Malayalam, Gujarati, Punjabi, Odia, Urdu, English) | Upload a Marathi 7/12 extract + a Tamil chitta, both parse |
| R2 | Auto-extract structured info from scanned PDFs, images, historical docs | Intake + Vision | Multi-format ingestion, 300 DPI normalization, deskew/denoise/binarize | Drop a 40-page scanned PDF register → 40 records |
| R3 | Intelligent classification into predefined land-record fields | Extraction | 24-field canonical schema + NER + doc-type classifier | Field panel populates with labels & confidence |
| R4 | Automated validation: business rules, cross-DB verification, duplicate detection | Validation | 60+ rule library, fuzzy duplicate detection, master-data cross-check | Show a deliberately duplicated khasra get flagged |
| R5 | Confidence scoring + auto-identification of uncertain fields | Vision + Extraction | Per-field calibrated confidence, page-level & record-level rollup | Colour ramp on every field; sort queue by confidence |
| R6 | Human-assisted verification workflow for low-confidence records | Review | Dual-pane verifier console, keyboard-first, SLA queue, maker–checker | Live correction of a red field → record turns green |
| R7 | AI-driven learning that improves accuracy over time | Learning | Correction capture → dataset → scheduled fine-tune → A/B eval | Accuracy chart rising across 3 model versions |
| R8 | Integration with LRMS, DILRMP, GIS, cadastral maps | Integrations + Mapping | Adapter framework, mock DILRMP service, WMS/WFS cadastral layers | Push a verified record to mock LRMS, get ack ID |
| R9 | Secure repository with metadata management & audit trails | Vault | S3/MinIO object store, SHA-256 content hash, append-only audit chain | Open a record's timeline: every touch, who, when, what changed |
| R10 | Interactive dashboards (volume, accuracy, status, pending, errors, state/district progress) | Insights | 6 dashboards + India choropleth drilldown | State map → district → tehsil → village drilldown |
| R11 | APIs for government application integration | Integrations | REST (OpenAPI 3.1) + GraphQL, API keys, rate limits, sandbox | Open Swagger UI, execute a live call |
| R12 | Role-based access control | Core | 8 roles × jurisdiction-scoped ABAC, ABAC on district/tehsil | Log in as District Officer — sees only own district |

### 3.1 The 24-field canonical land record schema

| Group | Fields |
|-------|--------|
| **Identity** | `survey_number`, `khasra_number`, `khata_number`, `plot_number`, `sub_division` |
| **Owner** | `owner_name`, `father_or_husband_name`, `owner_share`, `co_owners[]`, `owner_category` (individual/joint/govt/institution) |
| **Location** | `village`, `patwari_halka`, `tehsil`, `sub_district`, `district`, `state`, `pin_code` |
| **Land** | `plot_area`, `area_unit` (hectare/acre/bigha/guntha/kanal/marla/cent), `land_classification` (irrigated/unirrigated/barren/forest/abadi), `soil_type`, `irrigation_source` |
| **Legal** | `mutation_number`, `mutation_date`, `registration_number`, `registration_date`, `encumbrance`, `tenancy_rights`, `revenue_assessment` |
| **Geo** | `parcel_geometry` (PostGIS), `centroid`, `bounding_box`, `map_sheet_ref` |
| **Meta** | `document_type`, `record_year`, `source_language`, `confidence_overall`, `verification_status` |

**Document types supported:** 7/12 Extract (Maharashtra), Record of Rights (RoR / Khatauni / Jamabandi / Pahani / Adangal / Chitta / Patta), Mutation Register (Intkal), Sale Deed, Cadastral Map (Shajra / Tippan / FMB), Village Map, Index-II, Encumbrance Certificate.

### 3.2 Existing System Study *(PS scope row: "Existing System")*

How manual digitization works today, and exactly where BHUMI intervenes.

| Step in current process | Who does it | Time | Failure mode | BHUMI intervention |
|---|---|---|---|---|
| Physical register retrieved from record room | Record keeper | 10–30 min | Misfiled, damaged, missing volumes | Unchanged (physical), but **one-time** — digitized forever after |
| Pages scanned on a flatbed / camera | Scanning vendor | 1–2 min/pg | Skew, low DPI, shadows, cropped edges | **Intake** quality gate scores each page and names the defect, so rescans happen immediately instead of after data entry |
| Operator reads the scan and types into a form | Data-entry operator | 8–12 min/record | Misread handwriting, wrong survey number, transposed digits, wrong village spelling | **Vision + Extraction** pre-fill every field; operator becomes a verifier, not a typist |
| Second operator re-types for double-key verification | Second operator | +8 min/record | Doubles cost; still misses systematic errors | Replaced by **confidence routing** — only the genuinely uncertain 20–40% reaches a human at all |
| Supervisor spot-checks a sample | Tehsildar | — | Sampling misses errors; no traceability of what was checked | **Review** logs every field touched; **Insights** shows real accuracy, not a sample estimate |
| Data pushed into state LRMS manually | Operator | 2–5 min/record | Copy-paste errors, partial pushes, no retry | **Integrations** pushes automatically with idempotency keys, retries, and a sync log |
| Errors discovered later by citizens | Citizen + court | months–years | Litigation | **Validation** catches format, arithmetic, referential and geometry errors before publication |
| Cadastral maps digitized separately (if at all) | Survey dept | weeks | Text records and maps never reconciled | **Mapping** georeferences the map, extracts parcels, and reconciles area against the text record |

**Scalability gap being closed:** a manual cell processes ~50 records/operator/day. BHUMI targets 400–600 verified records/operator/day — an order of magnitude, achieved by moving the human from *entry* to *exception handling*.

### 3.3 Stakeholder Matrix *(PS scope row: "Stakeholders")*

| Stakeholder | What they need | BHUMI surface | Role in system |
|---|---|---|---|
| **Revenue Department** | Accurate, complete, current records | Insights dashboards, Vault exports | State Admin |
| **Land Record Offices** | Fast throughput, low rework | Intake, Review queue | Operator, Verifier |
| **Survey / Settlement Departments** | Map–record consistency, parcel geometry | Mapping, georeferencing tool | GIS Officer |
| **District Administration (Collector)** | Progress against targets, exception visibility | Insights → district drilldown, SLA breach list | District Officer |
| **State Governments** | DILRMP milestone reporting, multi-district rollout | Insights state view, Integrations sync log | State Admin |
| **Central Ministries (DoLR / MoRD)** | National digitization posture, comparability | National overview dashboard, open APIs | Viewer / API client |
| **Patwari / Lekhpal / Talathi / VAO** | A tool that is faster than typing, in their language | Review console, keyboard-first, bilingual | Verifier |
| **Citizens / Landowners** | Find my record, trust it, get a certified copy | Public portal, QR-verifiable certificate, "report an error" | Public |
| **Courts & Legal** | Provenance — was this record altered? | Vault audit chain + chain-verify endpoint | Auditor |
| **Banks / Financial institutions** | Verified ownership + encumbrance for lending | Integrations API (scoped, consent-based) | API client |
| **Research Institutions** | Aggregated, anonymized land statistics | Open Data export | Public |
| **Registration Department (IGR)** | Cross-check against sale deeds | Integrations verify connector | System |

### 3.4 Problem → Mitigation Map *(PS "Problems" paragraph, line by line)*

| Problem stated in the PS | Where it bites | BHUMI mitigation | Module |
|---|---|---|---|
| **Poor image quality** | OCR garbage-in | Quality score 0–100 per page; CLAHE contrast, denoise, adaptive binarization; rescan recommendation with the specific defect named | Intake |
| **Inconsistent formats** | Fixed-template parsers break | Document-type classifier + layout detection + table-structure recognition — BHUMI learns the layout instead of assuming it | Vision |
| **Faded text** | Characters unreadable | Real-ESRGAN super-resolution + Sauvola local thresholding tuned for low-contrast ink; low-confidence spans routed to a human rather than guessed | Intake + Vision |
| **Damaged pages** | Torn/stained/folded regions | Region-level (not page-level) confidence — an intact half-page still yields verified fields; damaged regions flagged `illegible` with a bbox | Vision + Review |
| **Multiple regional languages** | Single-language OCR fails | Per-region script detection routing to 12 language-specific OCR heads; MuRIL/IndicBERT NER; names stored in native script **and** roman for cross-script search | Vision + Extraction |
| **Handwritten annotations** | Marginalia missed or corrupt output | Handwriting detected as its own region type and sent to TrOCR; annotations preserved as attached notes rather than merged into fields | Vision |
| **Time-consuming manual digitization** | Cost, backlog | Straight-through processing for ≥60% of records; human time spent only on flagged fields | Validation + Review |
| **Error-prone manual entry** | Bad data enters the system of record | 60+ validation rules + duplicate detection + geometry reconciliation run **before** anything is published | Validation |
| **Lack of standardization** | Records not comparable across states | Single 24-field canonical schema; per-state mapping files translate on the way out, not on the way in | Extraction + Integrations |
| **Difficulty verifying ownership** | Disputes | Chain-of-title continuity rule + cross-database verification + tamper-evident audit trail | Validation + Vault |
| **Poor integration with modern systems** | Islands of data | Connector framework, REST + GraphQL, webhooks, OGC-standard GIS services | Integrations + Mapping |
| **Weak citizen-centric service delivery** | Low trust | Public search, masked record view, QR-verifiable certified extract, error-reporting loop | Public portal |
| **High operational cost** | Budget | ~₹2–4/record vs ₹12–20 manual; 95% of pages never touch a GPU | Platform |
| **Inconsistency affecting decision-making** | Bad governance data | Insights reports *measured* accuracy from a frozen golden set — not a self-reported estimate | Insights + Learning |

---

## 4. Solution Overview — The BHUMI Pipeline

```
┌──────────┐  ┌──────────┐  ┌────────────┐  ┌────────────┐  ┌──────────┐  ┌──────────────┐  ┌────────┐
│  INTAKE  │─▶│  VISION  │─▶│ EXTRACTION │─▶│ VALIDATION │─▶│  REVIEW  │─▶│ INTEGRATIONS │─▶│ VAULT  │
│  ingest  │  │ ocr + cv │  │ nlp fields │  │   rules    │  │  human   │  │   publish    │  │ archive│
└──────────┘  └──────────┘  └────────────┘  └────────────┘  └──────────┘  └──────────────┘  └────────┘
      │             │             │               │               │               │              │
      └─────────────┴─────────────┴───────────────┴───────────────┴───────────────┴──────────────┘
                                         │  events
                    ┌────────────────────┼────────────────────┐
                    ▼                    ▼                    ▼
            ┌───────────────┐   ┌────────────────┐   ┌────────────────┐
            │   INSIGHTS    │   │    MAPPING     │   │    LEARNING    │
            │  dashboards   │   │   gis/parcels  │   │   retraining   │
            └───────────────┘   └────────────────┘   └────────────────┘
                                                              │
                    corrections from REVIEW ───────────────────┘
```

### Stage-by-stage

| Stage | Input | Processing | Output | Target latency |
|-------|-------|-----------|--------|----------------|
| **1. Intake — Ingest** | PDF/TIFF/JPG/PNG/ZIP, single or bulk | Virus scan, dedup by SHA-256, page split, 300 DPI upscale, EXIF strip, thumbnail | Normalized page images + `document` row | <2s/page |
| **2. Intake — Enhance** | Raw page | Deskew (Hough), denoise (NLM/DnCNN), binarize (Sauvola adaptive), border removal, contrast CLAHE, super-resolution for faded text (Real-ESRGAN) | Cleaned page + quality score | ~1s/page |
| **3. Vision — Layout** | Cleaned page | Doc-type classifier → region detection (tables, headers, stamps, signatures, seals, marginalia, map area) via LayoutLMv3 / YOLOv8 / Detectron2 | Region polygons + labels | ~0.8s/page |
| **4. Vision — OCR** | Regions | Script detection → route: printed→PaddleOCR/Tesseract-Indic; handwritten→TrOCR-Indic fine-tune; tables→table-structure recognition (PubTables/Unitable) | Text spans + per-char confidence + bbox | ~2s/page |
| **5. Extraction — Extract** | Text spans + layout | Indic NER (IndicBERT/MuRIL fine-tune) + rule/regex hybrid + LLM fallback for messy cases → field mapping | 24-field record + per-field confidence | ~1s/page |
| **6. Extraction — Normalize** | Raw field values | Transliteration, name canonicalization, unit conversion (bigha→ha per state), date normalization (Vikram Samvat/Fasli→Gregorian), number parsing (Devanagari numerals) | Normalized record | <200ms |
| **7. Validation — Validate** | Normalized record | 60+ rules, master-data lookup, duplicate detection, geometry cross-check, referential integrity | Validation report + status | <300ms |
| **8. Routing** | Validated record | If `min_field_confidence ≥ θ` and zero blocking errors → auto-approve; else → Review queue with priority | Queue assignment | instant |
| **9. Review — Verify** | Queued record | Human verifier: side-by-side image ↔ fields, click-to-highlight, keyboard nav, correct & approve; maker–checker for high-value | Verified record + correction deltas | ~45s/record (target) |
| **10. Integrations — Publish** | Verified record | Push to LRMS/DILRMP adapters, emit webhook, index in search, write to GIS | Ack + external ID | <1s |
| **11. Vault — Archive** | Everything | Immutable audit entry (hash-chained), document versioning, retention policy | Audit trail | async |
| **12. Learning — Learn** | Correction deltas | Nightly dataset build → weekly LoRA fine-tune → A/B eval on golden set → promote if better | New model version | scheduled |

---

## 5. System Architecture

### 5.1 Logical layers

```
╔═══════════════════════════════════════════════════════════════════════════╗
║  PRESENTATION                                                             ║
║  Next.js 15 (App Router) · React 19 · TS · Tailwind · shadcn/ui           ║
║  ├ Public Portal (citizen search, RTI-style record view)                  ║
║  ├ Operator Console (upload, batches, queue)                              ║
║  ├ Review Verifier Workbench                                             ║
║  ├ Insights Admin Dashboards                                                ║
║  └ Mapping GIS Viewer (MapLibre/OpenLayers + Leaflet fallback)            ║
╠═══════════════════════════════════════════════════════════════════════════╣
║  EDGE / GATEWAY                                                           ║
║  NGINX / Kong · TLS 1.3 · WAF · Rate limit · JWT verify · Req-ID inject    ║
╠═══════════════════════════════════════════════════════════════════════════╣
║  APPLICATION SERVICES  (FastAPI, Python 3.12 · async)                     ║
║  auth-svc │ document-svc │ extraction-orchestrator │ validation-svc       ║
║  review-svc │ gis-svc │ analytics-svc │ integration-svc │ notify-svc      ║
╠═══════════════════════════════════════════════════════════════════════════╣
║  AI/ML SERVING                                                            ║
║  Celery/Ray workers · Triton Inference Server / TorchServe · GPU pool     ║
║  vision-layout │ vision-ocr │ extraction-ner │ validation-rules │ learning-trainer      ║
╠═══════════════════════════════════════════════════════════════════════════╣
║  DATA                                                                     ║
║  PostgreSQL 16 + PostGIS 3.4 (OLTP + geometry)                            ║
║  Redis 7 (cache, queue broker, locks, rate limits)                        ║
║  MinIO / S3 (documents, thumbnails, model artifacts)                      ║
║  OpenSearch (full-text + fuzzy name search across scripts)                ║
║  TimescaleDB ext (metrics time-series)                                    ║
║  MLflow (experiment + model registry)                                     ║
╠═══════════════════════════════════════════════════════════════════════════╣
║  INTEGRATION (Integrations)                                                       ║
║  DILRMP adapter │ State LRMS adapters │ DigiLocker │ Bhu-Naksha WMS       ║
║  e-Sign / e-Stamp │ SMS (MSDG) │ Email │ Webhooks                         ║
╠═══════════════════════════════════════════════════════════════════════════╣
║  PLATFORM                                                                 ║
║  Docker · Kubernetes · Helm · Prometheus · Grafana · Loki · OpenTelemetry  ║
║  Target: NIC MeghRaj Cloud (fallback: AWS/Azure Gov)                       ║
╚═══════════════════════════════════════════════════════════════════════════╝
```

### 5.2 Runtime request flows

**A. Bulk upload flow (async)**
```
Browser ──presigned PUT──▶ MinIO
   │
   └─ POST /documents/register {keys[]} ──▶ document-svc
                                              │ creates document rows (status=QUEUED)
                                              └─ enqueue → Redis Stream "ingest"
                                                             │
   Intake worker ──▶ Vision worker ──▶ Extraction worker ──▶ Validation worker
        │              │                │               │
        └──────── progress events ──────┴───────────────┘
                        │
                   Redis Pub/Sub ──▶ WebSocket/SSE ──▶ live progress UI
```

**B. Verification flow (sync)**
```
Verifier opens /review/{id}
  → review-svc acquires advisory lock (Redis, 15-min TTL, heartbeat)
  → returns record + page images (signed URLs) + field bboxes + validation report
  → verifier edits → PATCH /review/{id}/fields (optimistic, debounced autosave)
  → POST /review/{id}/approve
       → writes verified record
       → writes correction deltas to learning_corrections
       → appends audit entry (hash-chained)
       → triggers Integrations publish
       → releases lock
```

### 5.3 Deployment topology (hackathon vs production)

| Concern | Hackathon (demo) | Production |
|---------|------------------|------------|
| Compute | 1 laptop + 1 GPU box (or Colab/RunPod), docker-compose | K8s cluster on MeghRaj, 3 master + N workers, GPU node pool |
| DB | Single Postgres+PostGIS container | Patroni HA cluster, streaming replica, PITR via pgBackRest |
| Object store | MinIO container | NIC object storage / S3 with versioning + object lock |
| Queue | Redis container | Redis Sentinel / Kafka for high volume |
| Models | Quantized ONNX on CPU + one GPU for TrOCR | Triton on GPU pool with dynamic batching |
| Scale target | 500 pages | 10M+ pages/year/state |

---

## 6. Module Catalogue

### 6.1 Intake — Ingestion & Pre-processing

| Feature | Detail |
|---------|--------|
| Upload modes | Single file, multi-file, folder, ZIP bundle, drag-drop, scanner (TWAIN via bridge), mobile camera capture, SFTP watch-folder for bulk district dumps |
| Formats | PDF (native + scanned), TIFF (multi-page), JPG, PNG, BMP, WEBP, DjVu (converted) |
| Size limits | 100 MB/file, 2 GB/batch, chunked resumable upload (tus protocol) |
| Dedup | SHA-256 content hash — instant "already digitized" detection |
| Pre-processing | Deskew · Rotate (0/90/180/270 auto) · Denoise · Binarize (Sauvola) · CLAHE contrast · Border/staple removal · Bleed-through removal · Super-resolution for faded text · Page-quality score (0–100) |
| Quality gate | Score <35 → "Rescan recommended" with specific reason (too dark / too skewed / too low DPI / heavy noise) |
| Batch metadata | District, tehsil, village, record year, doc type, source office, operator — applied to whole batch, overridable per doc |
| Progress | Real-time per-page status via SSE; resumable if browser closes |

### 6.2 Vision — Computer Vision & OCR Engine

| Sub-component | Approach |
|---------------|----------|
| Document type classifier | Fine-tuned `DiT`/`LayoutLMv3` on doc-type labels; falls back to keyword heuristics |
| Layout / region detection | YOLOv8-seg or Detectron2 (Mask R-CNN) trained on land-record layouts: `table`, `header`, `owner_block`, `stamp`, `signature`, `seal`, `handwritten_note`, `map_region`, `marginalia` |
| Table structure recognition | Table Transformer (`microsoft/table-transformer-structure-recognition`) → row/col/cell grid; crucial because Khatauni/Jamabandi are tabular |
| Script/language detection | Per-region CNN classifier over 12 scripts; routes to correct OCR head |
| Printed OCR | PaddleOCR (Devanagari/Tamil/Telugu/Bengali models) + Tesseract 5 with Indic tessdata as ensemble; agreement boosts confidence |
| Handwritten OCR | TrOCR (`microsoft/trocr-large-handwritten`) fine-tuned on IIIT-HW-Dev / IAM-style Indic handwriting; plus a CRNN+CTC baseline for speed |
| Numeric fields | Dedicated digit recognizer (survey numbers, areas, dates) — much higher accuracy than general OCR on the fields that matter most |
| Seal/stamp/signature | Detection only (presence + bbox) — recorded as metadata, never OCR'd |
| Confidence | Per-character logits → per-token → per-field aggregation; **calibrated** with temperature scaling on a held-out set so 0.9 actually means 90% |
| Output | `PageResult { regions[], spans[{text, bbox, conf, script, source_engine}] }` |

### 6.3 Extraction — NLP & Field Extraction

| Sub-component | Approach |
|---------------|----------|
| NER model | `MuRIL` / `IndicBERT v2` token-classification fine-tuned for entities: PERSON, RELATION, VILLAGE, TEHSIL, DISTRICT, SURVEY_NO, KHASRA_NO, KHATA_NO, AREA, UNIT, LAND_CLASS, DATE, MUTATION_NO, REG_NO |
| Rule/regex layer | State-specific patterns (e.g. Maharashtra 7/12 has a fixed skeleton) — high precision, runs first, NER fills gaps |
| Layout-aware mapping | Field ↔ cell mapping using table structure: "column 3 of the owner table = share" |
| LLM fallback | For low-confidence/unstructured pages, a constrained-decoding LLM call (self-hosted Llama-3.1-8B-Indic or Gemma) emits strict JSON against the schema. Used sparingly, always flagged as `source=llm`, always sent to human review |
| Transliteration | `indic-transliteration` / AI4Bharat IndicXlit → every name stored in **both** native script and roman, so search works either way |
| Name canonicalization | Honorific stripping (श्री/Shri/Smt), spelling variants, s/o–w/o parsing, joint-owner splitting |
| Unit normalization | State-aware: 1 bigha varies 1,600–27,000 sq ft by region → lookup table keyed on district. Store canonical `area_sqm` + original text |
| Date normalization | Gregorian, Vikram Samvat, Fasli, Saka; Devanagari/Tamil numerals; partial dates |
| Numeral conversion | ०१२३४५६७८९, ௦௧௨௩, etc. → ASCII |
| Output | `LandRecord` object, 24 fields, each `{value, raw_text, confidence, bbox, page, source}` |

### 6.4 Validation — Rules & Cross-Check Engine

See [§9](#9-validation--rules-engine) for the full rule library.

### 6.5 Review — Human Verification Console

**The hero screen.** Design goals: a verifier should clear a record in under a minute without touching the mouse.

| Feature | Detail |
|---------|--------|
| Layout | Left 55%: document viewer (zoom/pan/rotate, page thumbnails). Right 45%: field form grouped by section. Resizable splitter, remembered per user |
| Click-to-locate | Click a field → viewer pans+zooms to its bbox and pulses the highlight. Click a region on the image → focuses the matching field. **Bidirectional linking** |
| Confidence surfacing | Each field: coloured left rail + % badge. Toggle "show only low-confidence" to work the risky fields first |
| Keyboard-first | `Tab`/`Shift+Tab` fields · `Enter` accept · `Ctrl+Enter` approve record · `Ctrl+R` reject · `Ctrl+D` mark duplicate · `Alt+↑/↓` page · `Ctrl+Z` undo · `?` shortcut cheatsheet |
| Smart suggestions | Village/tehsil autocompletes from LGD master; owner-name suggests from prior records in same village |
| Diff view | "AI said X, you wrote Y" preview before approval — this is what feeds Learning |
| Side-by-side compare | Open the previous year's record for the same khasra to check continuity |
| Comments & flags | Per-field note, "illegible", "damaged", "needs field survey", "suspected fraud" |
| Maker–checker | Records above a configurable value/area threshold require a second approver |
| Lock & SLA | Record locked while open (15-min TTL, heartbeat); SLA timer visible; auto-release on idle |
| Bulk actions | Approve all high-confidence in a batch; bulk reject with reason |
| Accessibility | Full screen-reader labels, focus rings, no colour-only signalling, 200% zoom safe |

### 6.6 Mapping — GIS Subsystem

See [§10](#10-gis--cadastral-subsystem).

### 6.7 Insights — Analytics & Dashboards

| Dashboard | Audience | Key visuals |
|-----------|----------|-------------|
| **National Overview** | Ministry | India choropleth (state-wise % digitized), total pages, records verified, avg accuracy, throughput sparkline |
| **State / District Progress** | State Sec, Collector | Drilldown map → district → tehsil → village; stacked progress bars; ranking table; target vs actual |
| **Processing Operations** | Operations lead | Queue depth, worker utilization, pages/hour, stage-wise latency, failure reasons treemap |
| **Accuracy & Quality** | Data quality lead | Field-level accuracy heatmap (field × language), confidence histogram, correction rate trend, model-version comparison |
| **Verification Workload** | Tehsildar / supervisor | Pending by priority & age, verifier leaderboard, avg handling time, SLA breach list |
| **Error & Exception** | All | Top validation failures, duplicate clusters, geometry mismatches, rescan-needed list |
| **Model Performance (Learning)** | Tech team | Accuracy per model version, training run history, golden-set eval, drift alerts |

Every dashboard: date-range picker, jurisdiction filter (auto-scoped by role), CSV/XLSX/PDF export, scheduled email digest.

### 6.8 Integrations — Connectors & API Gateway

See [§13](#13-integration-layer).

### 6.9 Vault — Secure Repository & Audit

| Feature | Detail |
|---------|--------|
| Storage | Object store, server-side encrypted (AES-256), versioned, WORM/object-lock for verified records |
| Metadata | Full Dublin-Core-style + land-specific metadata; searchable |
| Content addressing | SHA-256; identical scans deduplicate automatically |
| Audit chain | Append-only `audit_log`; each entry stores `prev_hash`, `payload_hash` → tamper-evident chain. Optional anchor of daily Merkle root |
| Retention | Configurable per doc type; legal hold flag blocks deletion |
| Access log | Every document view/download logged with user, IP, purpose |
| Export | Certified PDF/A export bundle with QR verification code |

### 6.10 Learning — Continuous Learning Loop

```
Review corrections ──▶ learning_corrections table
                              │ nightly ETL
                              ▼
                    Labelled dataset (image crop + gold text + field label)
                              │ weekly
                              ▼
                 LoRA / adapter fine-tune (TrOCR head, NER head)
                              │
                              ▼
                 Eval on frozen golden set (500 hand-labelled records)
                              │
                    ┌─────────┴──────────┐
              better?                  worse?
                    │                     │
             promote to canary       discard, alert
             (10% traffic) ─▶ full rollout
```

- **Active learning:** prioritize for human review the records where the model is *most uncertain* AND *most impactful* (large area / disputed / high-value) — maximizes learning per verifier-minute.
- **Per-district adapters:** handwriting and format vary by region; ship small LoRA adapters keyed on district for a big accuracy jump at low cost.
- **Drift detection:** confidence distribution shift or correction-rate spike → alert.

---

## 7. Technology Stack

> The PS "suggested technology" column is honoured exactly; where we deviate we note why.

### 7.1 Full stack table

| Layer | Choice | Version | Why |
|-------|--------|---------|-----|
| **Frontend framework** | Next.js (App Router) | 15 | SSR for public pages, RSC, file-based routing, great DX |
| UI library | React | 19 | — |
| Language | TypeScript | 5.6 | Type-safe field schema shared with backend via generated types |
| Styling | Tailwind CSS | 4 | Token-driven, fast, easy dark mode |
| Components | shadcn/ui + Radix | latest | Accessible primitives — mandatory for GIGW/WCAG |
| State | TanStack Query + Zustand | — | Server cache + light client state |
| Forms | React Hook Form + Zod | — | Zod schema mirrors backend Pydantic |
| Charts | Recharts + ECharts (for maps/large data) | — | PS lists Plotly/Superset — we embed Superset for BI, custom charts in-app |
| Maps | MapLibre GL JS + OpenLayers; Leaflet fallback | — | **PS lists OpenLayers/Leaflet ✓** |
| Document viewer | PDF.js + OpenSeadragon (deep zoom tiles) | — | Smooth zoom on 300 DPI scans |
| i18n | next-intl | — | Bilingual EN/HI minimum, 12-language ready |
| **API framework** | FastAPI | 0.115 | Async, auto OpenAPI, Pydantic v2 |
| Language | Python | 3.12 | Same language as ML — no serialization boundary |
| GraphQL | Strawberry | — | **PS lists GraphQL ✓** — for flexible gov consumer queries |
| Task queue | Celery + Redis (or Ray for GPU fanout) | — | Mature, observable |
| Realtime | SSE + WebSocket (FastAPI) | — | Live pipeline progress |
| **Database** | PostgreSQL + **PostGIS** | 16 / 3.4 | **PS lists PostgreSQL+PostGIS ✓** |
| Search | OpenSearch | 2.x | Multi-script fuzzy name search, ICU analyzers |
| Cache/broker | Redis | 7 | Cache, locks, queues, rate limits |
| Object store | MinIO (dev) / S3-compatible (prod) | — | Documents & model artifacts |
| Time-series | TimescaleDB extension | — | Metrics without a second DB |
| Migrations | Alembic | — | — |
| **Computer Vision** | OpenCV, Detectron2, YOLOv8 | — | **PS lists OpenCV, Detectron2, YOLO ✓** |
| OCR (printed) | PaddleOCR, Tesseract 5 + Indic tessdata | — | Ensemble for confidence |
| OCR (handwritten) | TrOCR (fine-tuned), CRNN+CTC | — | SOTA handwriting |
| Layout | LayoutLMv3, DiT, Table Transformer | — | Document understanding |
| Image enhancement | Real-ESRGAN, DnCNN, Sauvola | — | Faded/damaged pages |
| **NLP** | spaCy, Hugging Face Transformers, **Indic NLP Library** | — | **PS lists all three ✓** |
| Indic models | MuRIL, IndicBERT v2, IndicXlit, IndicTrans2 | AI4Bharat | Best-in-class for Indian languages |
| LLM fallback | Llama-3.1-8B-Instruct (self-hosted, vLLM) or Gemma-2 | — | Air-gap friendly; no data leaves gov cloud |
| Model serving | Triton Inference Server / TorchServe / ONNX Runtime | — | Batching, GPU sharing |
| Experiment tracking | MLflow | — | Model registry + versioning |
| **GIS server** | **GeoServer** | 2.25 | **PS lists GeoServer ✓** — WMS/WFS/WMTS |
| Desktop GIS | **QGIS** (for ops team, shapefile prep) | — | **PS lists QGIS ✓** |
| Geo processing | GDAL/OGR, Shapely, GeoPandas, Rasterio | — | Georeferencing, topology |
| Tiles | pg_tileserv / Martin (MVT) | — | Fast vector tiles from PostGIS |
| **BI / Visualization** | **Apache Superset**, **Grafana**, Plotly | — | **PS lists Superset, Grafana, Plotly, Power BI ✓** (Superset chosen over Power BI: open-source, self-hostable in gov cloud) |
| **Notifications** | SMS gateway (MSDG/Textlocal), SMTP/SES, Web Push (FCM) | — | **PS lists SMS, Email, Push ✓** |
| **Auth** | Keycloak (OIDC) or self-rolled JWT + refresh | — | SSO with NIC AD; MFA (TOTP), optional Aadhaar-based e-KYC for citizens |
| **Cloud** | **NIC MeghRaj** primary; AWS/Azure Gov fallback | — | **PS lists MeghRaj/AWS/Azure Gov ✓** |
| Containers | Docker + Kubernetes + Helm | — | — |
| CI/CD | GitHub Actions → GHCR → ArgoCD | — | — |
| Observability | Prometheus, Grafana, Loki, Tempo, OpenTelemetry | — | Traces across pipeline stages |
| Errors | Sentry (self-hosted GlitchTip in gov cloud) | — | — |
| Secrets | HashiCorp Vault / K8s sealed-secrets | — | — |

### 7.2 Hackathon-lean substitution list

For a 36-hour build, swap heavy components without losing the story:

| Full stack | Hackathon swap | Note |
|-----------|----------------|------|
| Kubernetes | `docker-compose` | One command bring-up |
| Triton | FastAPI + in-process models (ONNX quantized) | Fewer moving parts |
| Detectron2 | YOLOv8-seg (ultralytics) | Trains in minutes, installs clean on Windows |
| Keycloak | FastAPI JWT + bcrypt | Roles seeded in DB |
| OpenSearch | Postgres `pg_trgm` + `unaccent` | Good enough fuzzy search |
| GeoServer | pg_tileserv + MapLibre | Lighter, still real GIS |
| Superset | Recharts/ECharts in-app + one embedded Grafana | Faster to style |
| Real DILRMP | **Mock DILRMP service** (own container, OpenAPI-documented) | Judges accept mocks if the adapter is real |

---

## 8. AI/ML Engine — Detailed Design

### 8.1 Model inventory

| ID | Model | Task | Base | Training data | Target metric |
|----|-------|------|------|---------------|---------------|
| M1 | `bhumi-doctype` | Document type classification | DiT-base | 2k labelled pages, 10 classes | ≥95% acc |
| M2 | `bhumi-layout` | Region segmentation | YOLOv8m-seg | 1.5k annotated pages | mAP50 ≥0.85 |
| M3 | `bhumi-table` | Table structure | Table Transformer | 800 tables | TEDS ≥0.80 |
| M4 | `bhumi-script` | Script identification | Small CNN | Synthetic + real crops, 12 scripts | ≥98% acc |
| M5 | `bhumi-ocr-print` | Printed OCR | PaddleOCR Indic + Tesseract ensemble | Fine-tune on 20k line crops | CER ≤3% |
| M6 | `bhumi-ocr-hw` | Handwritten OCR | TrOCR-large + LoRA | IIIT-HW-Dev + 5k in-domain crops | CER ≤12% |
| M7 | `bhumi-digits` | Numeric field OCR | CRNN specialized | 30k digit crops (incl. Devanagari numerals) | CER ≤1.5% |
| M8 | `bhumi-ner` | Field entity extraction | MuRIL-base + token head | 5k annotated records | F1 ≥0.90 |
| M9 | `bhumi-conf` | Confidence calibration | Isotonic/temperature scaling | Held-out 1k | ECE ≤0.05 |
| M10 | `bhumi-dupe` | Duplicate/near-dupe detection | Sentence-BERT (multilingual) + Levenshtein + phonetic | — | P ≥0.95 @ R 0.85 |
| M11 | `bhumi-llm-fallback` | Unstructured → JSON | Llama-3.1-8B-Instruct (vLLM, JSON-constrained) | Few-shot prompts | — |

### 8.2 Data strategy (critical — start this on Day 0)

| Source | Use |
|--------|-----|
| **Bhulekh / Bhu-Naksha public portals** (UP, MP, MH, RJ, KA, TN) | Real RoR PDFs & cadastral maps — scrape a few hundred legally-public records |
| **IIIT-HW-Dev, IIIT-HW-Telugu, IAM** | Handwriting pretraining |
| **Synthetic generation (biggest lever)** | Render 50k+ synthetic land records: real field values from LGD + Faker-Indic → Devanagari/Tamil/etc. fonts → apply degradation pipeline (paper texture, ink bleed, blur, fold lines, coffee stains, JPEG artifacts, skew, faded ink, show-through). This alone gets you a working model without any real labelled data. |
| **LGD (Local Government Directory)** | Authoritative state/district/tehsil/village master with codes — use for validation AND for synthetic realism |
| **Manual annotation** | 300–500 pages via Label Studio / CVAT for the golden eval set. Non-negotiable — you need a trustworthy metric |

> **Synthetic data generator is a deliverable in itself.** Build `tools/synthgen/` early; it de-risks the whole ML track and is a strong talking point ("we generated 50,000 realistic degraded Marathi 7/12 extracts").

### 8.3 Confidence scoring formula

```
field_confidence = w1·ocr_conf          # mean char logit over the span, calibrated
                 + w2·ner_conf          # softmax margin of the entity label
                 + w3·rule_conf         # 1.0 if regex/format matches, else 0.3
                 + w4·crossref_conf     # 1.0 if found in master DB (village/tehsil), else 0.5
                 + w5·layout_conf       # confidence of the region it came from
                 - penalty(ambiguity)   # multiple candidates, engine disagreement

record_confidence = min(field_confidence) over MANDATORY fields
                    · 0.7  +  mean(all fields) · 0.3
```
Weights learned by logistic regression against verifier ground truth. **Calibrated**, so the routing threshold θ (default 0.92) is meaningful and tunable per district.

### 8.4 Routing policy

| Record confidence | Blocking rule failures | Action |
|-------------------|------------------------|--------|
| ≥ 0.92 | 0 | **Auto-approve**, sample 5% into QA queue |
| 0.75 – 0.92 | 0 | **Standard review queue** |
| < 0.75 | any | **Priority review queue** |
| any | ≥1 blocking | **Exception queue** (validation-first UI) |
| any | duplicate detected | **Duplicate resolution queue** (merge/keep/reject UI) |

---

## 9. Validation & Rules Engine

The Validation module runs a declarative rule set (YAML/JSON, editable by admins in the UI — *no redeploy to change a rule*).

### 9.1 Rule categories

| Category | Examples | Severity |
|----------|----------|----------|
| **Format** | Survey number matches state pattern; khasra numeric or numeric/numeric; PIN = 6 digits; dates parseable and ≤ today | ERROR |
| **Mandatory** | `survey_number`, `owner_name`, `village`, `district`, `plot_area` present | BLOCKING |
| **Range / sanity** | 0 < area ≤ 10,000 ha; record_year ∈ [1850, current]; owner share ∈ (0,1] | ERROR |
| **Referential (master data)** | Village exists in LGD under that tehsil; tehsil under that district; district under that state; land classification in controlled vocabulary | ERROR |
| **Arithmetic** | Σ co-owner shares = 1.0 (±0.001); Σ sub-plot areas = parent plot area; area text ≈ area from polygon (±5%) | ERROR |
| **Consistency** | Mutation date ≥ registration date; current owner ≠ previous owner unless inheritance; language of names consistent with state | WARNING |
| **Duplicate** | Same (state, district, tehsil, village, survey_no) already exists → exact dupe; fuzzy owner-name + same parcel → near dupe | BLOCKING |
| **Geometry** | Parcel polygon is valid (ST_IsValid); no overlap >1% with a neighbouring parcel; parcel inside village boundary; centroid within district | ERROR |
| **Cross-database** | Record exists in state LRMS with matching owner; encumbrance status matches CERSAI/registry | WARNING |
| **Chain of title** | Mutation chain is continuous — no orphan mutation without a prior owner record | WARNING |
| **Anomaly / fraud signals** | Same owner name across implausibly many parcels; area changed >20% between consecutive years; ownership changed 3+ times in 12 months; benami-pattern flags | REVIEW |

**Target: 60+ rules.** Each rule has `id`, `name`, `description_en`, `description_hi`, `severity`, `applies_to` (doc types/states), `expression`, `fix_hint`, `enabled`.

### 9.2 Rule DSL example

```yaml
- id: AREA_GEOM_MATCH
  name: Text area matches parcel geometry
  severity: ERROR
  applies_to: [ROR, SEVEN_TWELVE]
  requires: [plot_area_sqm, parcel_geometry]
  expression: "abs(plot_area_sqm - ST_Area(parcel_geometry::geography)) / plot_area_sqm <= 0.05"
  message_en: "Recorded area ({plot_area_sqm} m²) differs from mapped parcel area ({geom_area} m²) by {pct}%."
  message_hi: "अभिलेखित क्षेत्रफल मानचित्र के क्षेत्रफल से {pct}% भिन्न है।"
  fix_hint: "Verify area from the document, or request re-survey of the parcel boundary."
```

### 9.3 Duplicate detection

Three-tier:
1. **Exact key** — `(state, district, tehsil, village, survey_number, record_year)` unique index.
2. **Content hash** — identical scanned page already ingested.
3. **Fuzzy** — blocked on village, then compare: owner name (phonetic — Indic Soundex/Metaphone adaptation + Levenshtein), father's name, area (±2%), khasra. Score >0.85 → duplicate cluster surfaced in a merge UI showing both records side-by-side.

---

## 10. GIS & Cadastral Subsystem

| Capability | Implementation |
|-----------|----------------|
| **Cadastral layer** | Village-level parcel polygons in PostGIS (`SRID 4326` storage, `7755`/UTM for area math). Import from shapefile/GeoJSON/KML or Bhu-Naksha WFS |
| **Map georeferencing** | Scanned cadastral map (Shajra/FMB) → GCP-based georeferencing via GDAL warp; assisted UI where the operator clicks 4+ control points on the scan and on the basemap |
| **Parcel vectorization** | CV pipeline on the map scan: line detection (Hough/LSD) → polygon closure → topology cleanup → candidate parcels; operator confirms. Labels (survey numbers written inside parcels) OCR'd and attached |
| **Record ↔ parcel linking** | Match extracted `survey_number` to parcel attribute; unmatched → "orphan record" / "orphan parcel" lists |
| **Geometry validation** | `ST_IsValid`, self-intersection, sliver detection, gap detection, overlap between neighbours, containment in village boundary |
| **Area reconciliation** | Compare document area vs `ST_Area(geography)`; flag >5% |
| **Map viewer** | MapLibre GL: basemap (OSM/Bhuvan/ISRO), cadastral parcel layer (MVT from pg_tileserv), village/tehsil/district boundaries, satellite toggle, measure tool, parcel search by survey number, click → record card |
| **Thematic layers** | Digitization status choropleth, land classification, disputed parcels, pending verification |
| **Standards** | OGC WMS 1.3.0 / WFS 2.0 / WMTS via GeoServer; GeoJSON + MVT for the app |
| **Export** | Shapefile, GeoJSON, KML, GeoPackage; PDF map sheet with scale bar, north arrow, legend, gov header |
| **Bhuvan/ISRO** | Optional imagery basemap for boundary sanity-check |

**Killer demo moment:** upload a cadastral map scan → BHUMI georeferences it, extracts parcel polygons, OCRs the survey numbers inside them, links each to the RoR record extracted from the register, and shows a map where clicking a parcel opens the digitized record with the source scan. *That's the screenshot that wins.*

---

## 11. Data Model & Database Design

### 11.1 Core tables

```sql
-- ============ JURISDICTION MASTER (from LGD) ============
states(id, lgd_code, name_en, name_local, geom geometry(MultiPolygon,4326))
districts(id, state_id, lgd_code, name_en, name_local, geom)
tehsils(id, district_id, lgd_code, name_en, name_local, geom)
villages(id, tehsil_id, lgd_code, name_en, name_local, geom, hadbast_no)

-- ============ IDENTITY & ACCESS ============
users(id, employee_code, name, email, phone, password_hash, status,
      mfa_secret, last_login_at, created_at)
roles(id, key, name, description)            -- 8 roles, see §14
permissions(id, key, description)            -- fine-grained
role_permissions(role_id, permission_id)
user_roles(user_id, role_id)
user_jurisdictions(user_id, level, ref_id)   -- ABAC scope: state/district/tehsil/village

-- ============ INGESTION ============
batches(id, name, district_id, tehsil_id, village_id, record_year, doc_type,
        source_office, uploaded_by, total_docs, processed_docs, status, created_at)
documents(id, batch_id, original_filename, content_sha256, mime_type, size_bytes,
          storage_key, page_count, doc_type, language_hint, quality_score,
          status, error_code, uploaded_by, created_at, updated_at)
document_pages(id, document_id, page_no, storage_key_raw, storage_key_clean,
               storage_key_thumb, width, height, dpi, skew_angle, quality_score)

-- ============ EXTRACTION ============
page_regions(id, page_id, region_type, bbox jsonb, polygon geometry, confidence, model_version)
ocr_spans(id, page_id, region_id, text, script, bbox jsonb, confidence,
          engine, is_handwritten)
land_records(id, document_id, page_id, village_id, tehsil_id, district_id, state_id,
             survey_number, khasra_number, khata_number, plot_number, sub_division,
             owner_name, owner_name_roman, father_or_husband_name, owner_category,
             plot_area_original numeric, area_unit_original text, plot_area_sqm numeric,
             land_classification, soil_type, irrigation_source,
             mutation_number, mutation_date, registration_number, registration_date,
             encumbrance, tenancy_rights, revenue_assessment,
             record_year, source_language, document_type,
             confidence_overall numeric, verification_status,
             parcel_id, extracted_at, verified_at, verified_by,
             model_version, created_at, updated_at)
record_fields(id, record_id, field_name, value_text, value_normalized,
              confidence numeric, bbox jsonb, page_no, source,      -- ocr|ner|rule|llm|human
              is_corrected boolean, original_value text)
co_owners(id, record_id, name, name_roman, relation, share numeric, confidence)

-- ============ VALIDATION ============
validation_rules(id, rule_key, name, description_en, description_hi, severity,
                 applies_to jsonb, expression text, fix_hint, enabled, version)
validation_results(id, record_id, rule_id, status, severity, message,
                   observed jsonb, created_at)
duplicate_clusters(id, cluster_key, score, status, resolved_by, resolved_at)
duplicate_members(cluster_id, record_id, is_primary)

-- ============ HUMAN REVIEW ============
review_queue(id, record_id, queue_type, priority, assigned_to, locked_by, locked_until,
             sla_due_at, status, created_at)
review_actions(id, record_id, user_id, action, field_name,
               old_value, new_value, comment, duration_ms, created_at)

-- ============ GIS ============
parcels(id, village_id, survey_number, khasra_number, geom geometry(MultiPolygon,4326),
        area_sqm numeric, source, map_sheet_ref, is_validated, created_at)
map_sheets(id, village_id, storage_key, georef_transform jsonb, srid, bounds geometry)
parcel_record_links(parcel_id, record_id, match_type, confidence)

-- ============ INTEGRATION ============
integrations(id, key, name, type, base_url, auth_config jsonb, enabled)
sync_jobs(id, integration_id, record_id, direction, status, external_id,
          request jsonb, response jsonb, attempts, error, created_at)
api_clients(id, name, org, api_key_hash, scopes jsonb, rate_limit, enabled)
webhooks(id, client_id, url, events jsonb, secret, enabled)

-- ============ AUDIT & LEARNING ============
audit_log(id BIGSERIAL, actor_id, actor_ip, entity_type, entity_id, action,
          payload jsonb, payload_hash, prev_hash, created_at)   -- hash-chained
document_access_log(id, document_id, user_id, ip, action, purpose, created_at)
learning_corrections(id, record_id, field_name, page_id, bbox jsonb,
                    ai_value, human_value, script, doc_type, district_id,
                    model_version, created_at, used_in_training_run)
model_versions(id, model_key, version, artifact_uri, metrics jsonb,
               trained_at, promoted_at, status)

-- ============ NOTIFICATIONS ============
notifications(id, user_id, type, title, body, link, read_at, created_at)
notification_prefs(user_id, channel, event_type, enabled)
```

### 11.2 Key indexes

```sql
CREATE UNIQUE INDEX ux_record_key ON land_records
  (state_id, district_id, tehsil_id, village_id, survey_number, record_year)
  WHERE verification_status = 'VERIFIED';

CREATE INDEX ix_records_status_conf ON land_records (verification_status, confidence_overall);
CREATE INDEX ix_records_owner_trgm  ON land_records USING gin (owner_name gin_trgm_ops);
CREATE INDEX ix_records_owner_rom   ON land_records USING gin (owner_name_roman gin_trgm_ops);
CREATE INDEX ix_parcels_geom        ON parcels USING gist (geom);
CREATE INDEX ix_villages_geom       ON villages USING gist (geom);
CREATE INDEX ix_queue_priority      ON review_queue (status, priority DESC, created_at);
CREATE INDEX ix_audit_entity        ON audit_log (entity_type, entity_id, created_at DESC);
-- Partition land_records by state_id (LIST) for national scale
```

### 11.3 Status enums

```
document.status      : UPLOADED → QUEUED → PREPROCESSING → EXTRACTING → VALIDATING
                       → PENDING_REVIEW → VERIFIED → PUBLISHED | FAILED | REJECTED | RESCAN_NEEDED
record.verification  : AUTO_APPROVED | PENDING_REVIEW | IN_REVIEW | VERIFIED
                       | REJECTED | DUPLICATE | ON_HOLD
queue_type           : STANDARD | PRIORITY | EXCEPTION | DUPLICATE | QA_SAMPLE | MAKER_CHECKER
```

---

## 12. API Specification

Base: `/api/v1` · OpenAPI 3.1 at `/api/docs` · GraphQL at `/api/graphql`

### 12.1 REST endpoints

| Method | Path | Purpose | Roles |
|--------|------|---------|-------|
| `POST` | `/auth/login` | Login → access+refresh JWT | public |
| `POST` | `/auth/refresh` · `/auth/logout` · `/auth/mfa/verify` | Session mgmt | auth |
| `GET` | `/auth/me` | Profile + roles + jurisdictions | auth |
| `POST` | `/batches` | Create batch with metadata | operator+ |
| `GET` | `/batches` · `/batches/{id}` | List/detail with progress | operator+ |
| `POST` | `/documents/presign` | Presigned upload URLs | operator+ |
| `POST` | `/documents/register` | Register uploaded objects, enqueue | operator+ |
| `GET` | `/documents` | Filter: status, batch, district, date, confidence | operator+ |
| `GET` | `/documents/{id}` | Detail + pages + regions | operator+ |
| `GET` | `/documents/{id}/pages/{n}/image` | Signed image URL (raw/clean/thumb) | operator+ |
| `POST` | `/documents/{id}/reprocess` | Re-run pipeline (optionally from stage) | supervisor+ |
| `DELETE` | `/documents/{id}` | Soft-delete (audit-logged) | admin |
| `GET` | `/records` | Search: survey no, owner (fuzzy, any script), village, status, confidence range | operator+ |
| `GET` | `/records/{id}` | Full record + fields + confidence + validation | operator+ |
| `PATCH` | `/records/{id}` | Update fields (creates correction deltas) | verifier+ |
| `GET` | `/records/{id}/history` | Version + audit timeline | operator+ |
| `GET` | `/records/{id}/validation` | Rule results | operator+ |
| `POST` | `/records/{id}/revalidate` | Re-run Validation | supervisor+ |
| `GET` | `/review/queue` | Paged queue, filters, sort by priority/confidence/SLA | verifier+ |
| `POST` | `/review/{id}/claim` | Lock record | verifier+ |
| `POST` | `/review/{id}/heartbeat` | Extend lock | verifier+ |
| `POST` | `/review/{id}/approve` | Approve (with corrections) | verifier+ |
| `POST` | `/review/{id}/reject` | Reject with reason | verifier+ |
| `POST` | `/review/{id}/escalate` | Send to supervisor | verifier+ |
| `POST` | `/review/bulk-approve` | Approve all high-confidence in batch | supervisor+ |
| `GET` | `/duplicates` · `POST /duplicates/{id}/resolve` | Duplicate clusters + merge | supervisor+ |
| `GET` | `/gis/parcels` | BBox/village query → GeoJSON | operator+ |
| `GET` | `/gis/tiles/{z}/{x}/{y}.mvt` | Vector tiles | operator+ |
| `POST` | `/gis/mapsheets/{id}/georeference` | Submit GCPs | gis_officer+ |
| `POST` | `/gis/mapsheets/{id}/vectorize` | Auto-extract parcels | gis_officer+ |
| `POST` | `/gis/parcels/{id}/link` | Link parcel ↔ record | gis_officer+ |
| `GET` | `/gis/validate/{village_id}` | Topology report | gis_officer+ |
| `GET` | `/analytics/overview` | KPI cards | viewer+ |
| `GET` | `/analytics/progress` | State/district/tehsil progress | viewer+ |
| `GET` | `/analytics/accuracy` | Field × language accuracy matrix | viewer+ |
| `GET` | `/analytics/operations` | Throughput, latency, queue depth | supervisor+ |
| `GET` | `/analytics/errors` | Top failures, treemap | supervisor+ |
| `POST` | `/analytics/export` | CSV/XLSX/PDF export job | viewer+ |
| `GET` | `/rules` · `POST` · `PATCH` · `POST /rules/{id}/test` | Rule CRUD + dry-run | admin |
| `GET` | `/integrations` · `POST /integrations/{key}/sync` | Integrations connectors | admin |
| `GET` | `/integrations/sync-jobs` | Sync history | admin |
| `POST` | `/webhooks` · `GET` · `DELETE` | Webhook mgmt | api_client |
| `GET` | `/audit` | Filterable audit trail | auditor+ |
| `GET` | `/audit/verify-chain` | Verify hash chain integrity | auditor+ |
| `GET` | `/models` · `POST /models/{id}/promote` | Model registry | ml_admin |
| `GET` | `/public/records/search` | Citizen search (masked PII, rate-limited) | public |
| `GET` | `/public/records/{id}/certificate` | QR-verifiable PDF extract | public |
| `GET` | `/health` · `/ready` · `/metrics` | Ops | internal |

### 12.2 Sample response — record detail

```json
{
  "id": "rec_01J8XQ2",
  "document_id": "doc_01J8XPZ",
  "verification_status": "PENDING_REVIEW",
  "confidence_overall": 0.81,
  "document_type": "SEVEN_TWELVE",
  "source_language": "mar",
  "fields": {
    "survey_number":   { "value": "142/2A", "confidence": 0.97, "source": "ocr",  "bbox": [412,220,540,252], "page": 1 },
    "owner_name":      { "value": "रामचंद्र गोविंद पाटील", "value_roman": "Ramchandra Govind Patil",
                         "confidence": 0.68, "source": "ner", "bbox": [180,300,720,340], "page": 1,
                         "alternatives": ["रामचंद्र गोविंद पटील"] },
    "plot_area":       { "value": "1.42", "unit": "hectare", "value_sqm": 14200,
                         "confidence": 0.93, "source": "rule", "bbox": [760,300,880,332], "page": 1 },
    "village":         { "value": "Shirdi", "lgd_code": "556123", "confidence": 0.99, "source": "crossref" }
  },
  "validation": {
    "status": "WARNING",
    "results": [
      { "rule": "AREA_GEOM_MATCH", "status": "PASS" },
      { "rule": "OWNER_NAME_CONF", "status": "WARN", "severity": "WARNING",
        "message": "Owner name confidence 0.68 is below threshold 0.85.",
        "fix_hint": "Compare with the highlighted region on page 1." }
    ]
  },
  "parcel": { "id": "par_9931", "area_sqm": 14355, "delta_pct": 1.09, "geometry_ref": "/api/v1/gis/parcels/par_9931" },
  "audit": { "extracted_at": "2026-09-06T09:12:44Z", "model_version": "vision-1.3.0+extraction-1.1.2" }
}
```

### 12.3 GraphQL (for integrators)

```graphql
query VillageDigitization($villageCode: String!) {
  village(lgdCode: $villageCode) {
    nameEn nameLocal
    stats { totalRecords verified pending avgConfidence }
    records(status: VERIFIED, first: 50) {
      surveyNumber ownerName plotAreaSqm landClassification
      parcel { areaSqm geometry }
      validation { status }
    }
  }
}
```

### 12.4 Webhook events

`document.processed` · `record.extracted` · `record.verified` · `record.rejected` · `duplicate.detected` · `batch.completed` · `validation.failed` · `model.promoted`
HMAC-SHA256 signed (`X-BHUMI-Signature`), retried with exponential backoff (5 attempts).

---

## 13. Integration Layer

### 13.1 Adapter framework

Every external system implements a common `Connector` interface — so adding a new state LRMS is a config + mapping file, not a code rewrite.

```python
class Connector(Protocol):
    key: str
    def health(self) -> HealthStatus: ...
    def push_record(self, record: LandRecord) -> PushResult: ...     # returns external_id
    def fetch_record(self, query: RecordQuery) -> LandRecord | None: ...
    def verify(self, record: LandRecord) -> VerificationResult: ...  # cross-DB check
    def map_fields(self, record) -> dict: ...                        # schema translation
```

### 13.2 Connector catalogue

| Connector | Direction | Purpose | Hackathon status |
|-----------|-----------|---------|------------------|
| **DILRMP** | push + verify | National land-records modernization DB | **Mock service** (own container, realistic OpenAPI + latency + occasional 409s) |
| **State LRMS** (Bhulekh UP, MahaBhulekh, Bhoomi KA, e-Dhara GJ) | push + fetch | State record systems | 2 mock adapters + field-mapping YAML per state |
| **Bhu-Naksha / cadastral WMS** | fetch | Parcel geometry | Real WMS where publicly available, else local shapefiles |
| **LGD (Local Govt Directory)** | fetch | Authoritative jurisdiction master | **Real** — bulk import CSV |
| **DigiLocker** | push | Issue verified record to citizen's locker | Mock issuer API |
| **Registration Dept (SARATHI/IGR)** | verify | Sale-deed / registration cross-check | Mock |
| **CERSAI** | verify | Encumbrance check | Mock |
| **e-Sign / e-Stamp** | action | Digitally sign verified extracts | Mock (with real PDF signature via pyHanko on a self-signed cert) |
| **Aadhaar e-KYC** | verify | Owner identity (consent-based, never stores Aadhaar number — stores only a token) | Mock, clearly labelled |
| **SMS (MSDG/Textlocal)** | notify | Verification alerts to citizens | Real (free tier) or console-logged |
| **Email (SMTP/SES)** | notify | Digests, exports | Real |
| **FCM Web Push** | notify | In-browser alerts | Real |
| **Bhuvan / ISRO** | fetch | Satellite basemap | Real (public tiles) |

### 13.3 Field mapping (state schema translation)

```yaml
# integrations/mappings/maharashtra_lrms.yaml
target: MahaBhulekh
version: "2.1"
fields:
  survey_number:     { path: "gatNumber",        transform: "strip_spaces" }
  khata_number:      { path: "khataNo" }
  owner_name:        { path: "owner.nameMarathi" }
  owner_name_roman:  { path: "owner.nameEnglish", transform: "transliterate:mar->en" }
  plot_area_sqm:     { path: "areaHectare",      transform: "sqm_to_hectare" }
  village_code:      { path: "villageLGDCode" }
  land_classification: { path: "landType", lookup: "maharashtra_landtype_map" }
required: [survey_number, owner_name, village_code, plot_area_sqm]
```

### 13.4 Reliability

- Outbox pattern: writes to `sync_jobs` in the same transaction as the record; a dispatcher drains it.
- Idempotency keys on every push.
- Circuit breaker per connector; degraded connectors surface on the ops dashboard.
- Retries: 5 attempts, exponential backoff + jitter, then dead-letter queue with an admin retry button.

---

## 14. Security, RBAC, Audit & Compliance

### 14.1 Role matrix

| Role | Scope | Upload | View records | Edit/verify | Approve | GIS edit | Admin | Audit |
|------|-------|:------:|:------------:|:-----------:|:-------:|:--------:|:-----:|:-----:|
| **Citizen / Public** | own/public | — | masked, own only | — | — | — | — | — |
| **Data Entry Operator** | village/tehsil | ✓ | own batch | — | — | — | — | — |
| **Verifier (Patwari/Lekhpal)** | village | ✓ | jurisdiction | ✓ | — | — | — | — |
| **Supervisor (Tehsildar)** | tehsil | ✓ | jurisdiction | ✓ | ✓ | — | — | own tehsil |
| **GIS Officer** | district | — | jurisdiction | geometry only | — | ✓ | — | — |
| **District Officer (Collector)** | district | ✓ | jurisdiction | ✓ | ✓ | ✓ | partial | ✓ |
| **State Admin** | state | ✓ | state | ✓ | ✓ | ✓ | ✓ | ✓ |
| **System Admin** | global | ✓ | global | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Auditor** | assigned | — | read-only | — | — | — | — | ✓ full |
| **API Client** | scoped | via API | scoped | — | — | — | — | — |

**ABAC on top of RBAC:** every query is automatically filtered by `user_jurisdictions`. A Tehsildar in Rahata literally cannot construct a request that returns Nashik data — enforced in a DB-level row policy plus a service-layer guard, not just in the UI.

### 14.2 Security controls

| Control | Implementation |
|---------|----------------|
| Transport | TLS 1.3 only, HSTS, secure cookies (`SameSite=Strict`, `HttpOnly`) |
| AuthN | JWT access (15 min) + rotating refresh (7 d, reuse-detection), Argon2id password hashing, TOTP MFA mandatory for Supervisor+ |
| AuthZ | RBAC + ABAC + Postgres RLS |
| Data at rest | AES-256 (DB TDE / disk), object-store SSE, column-level encryption for PII (owner phone, Aadhaar token) |
| PII handling | Aadhaar number **never stored** — only a hashed reference token; masked display (`XXXX-XXXX-1234`); DPDP Act 2023 aligned consent capture |
| Input safety | Pydantic validation, parameterized queries, file magic-byte check, ClamAV scan on upload, image bomb limits, PDF JS stripping |
| Rate limiting | Per-IP + per-user + per-API-key sliding window in Redis |
| Headers | CSP, X-Frame-Options DENY, X-Content-Type-Options, Referrer-Policy |
| Secrets | Vault / sealed-secrets; nothing in env files in prod |
| Audit | Hash-chained append-only log; every read of a document is logged (who, when, why) |
| Session | Idle timeout 20 min, absolute 8 h, concurrent-session limit, device list |
| Backup | Daily full + WAL streaming; quarterly restore drill; object-store versioning |
| Compliance targets | GIGW 3.0, WCAG 2.1 AA, IT Act 2000 §43A, DPDP Act 2023, ISO 27001 controls, NIC security guidelines, CERT-In logging (180-day retention, NTP-synced) |
| Pen-test readiness | OWASP Top 10 checklist documented; dependency scanning (Trivy/Snyk) in CI |

### 14.3 Audit chain

```
entry_n.payload_hash = SHA256(canonical_json(payload))
entry_n.prev_hash    = entry_{n-1}.chain_hash
entry_n.chain_hash   = SHA256(prev_hash || payload_hash || timestamp)
```
`GET /audit/verify-chain` walks the chain and reports any break. Daily Merkle root optionally published (or anchored) so tampering is provable. **This is the "trust" story government reviewers care about most.**

---

## 15. UI/UX Design System — Gov-Grade

> Governmental ≠ ugly. BHUMI should look like what a modern Indian digital-public-infrastructure product *should* look like — clean, dense where it needs to be, calm, unmistakably official.

### 15.1 Design principles

1. **Clarity over cleverness.** A Patwari with 20 minutes of training must succeed on day one.
2. **Density with air.** Land records are data-heavy. Use a tight 4px grid, but generous section spacing. Never a wall of grey.
3. **Confidence is the visual language.** The colour ramp is the product's identity — you should recognize a BHUMI screenshot instantly.
4. **Official but modern.** Ashoka blue, Devanagari-first typography, the national emblem placement conventions — with 2026 interaction quality.
5. **Bilingual by default.** Every label ships EN + HI (and the state language). Language switcher in the header, persisted.
6. **Works on the real hardware.** 1366×768, Chrome on Windows 10, 2 Mbps. Test at that size.
7. **Accessible, provably.** WCAG 2.1 AA — 4.5:1 text contrast, full keyboard operability, visible focus, screen-reader landmarks, no colour-only meaning, 200% zoom without horizontal scroll.

### 15.2 GIGW 3.0 compliance checklist

| Requirement | How BHUMI satisfies it |
|-------------|------------------------|
| National emblem + "Government of India" masthead | Standard gov header bar with emblem, ministry name, and a right-aligned utility strip (skip-link, A- A A+, contrast toggle, language, screen reader access) |
| Standard footer | Website policies, Terms, Copyright, Help, Contact, Last-updated timestamp, "Content owned by…" |
| Accessibility statement page | Provided, with declared conformance level |
| Text-size controls | A- / A / A+ adjust root font-size, persisted |
| High-contrast mode | A dedicated high-contrast theme beyond dark mode |
| Skip to main content | First focusable element |
| Breadcrumbs | On every internal page |
| Sitemap | Generated |
| Language | EN + HI minimum, `lang` attribute set correctly per block |
| Print stylesheet | Records and reports print cleanly on A4 with gov header |
| No auto-playing media, no colour-only info, no keyboard traps | Enforced by lint + manual audit |

### 15.3 Component inventory (build these once)

| Component | Notes |
|-----------|-------|
| `GovHeader` | Emblem, title, utility strip, main nav, user menu, notification bell |
| `GovFooter` | Policy links, last-updated, owner attribution |
| `ConfidenceBadge` | %, colour, icon, tooltip explaining the score's basis |
| `ConfidenceField` | Label + value + badge + "locate on document" button + alternatives dropdown |
| `DocumentViewer` | OpenSeadragon deep zoom, rotate, fit, page rail, bbox overlay layer, magnifier loupe |
| `FieldFormPanel` | Sectioned, collapsible, keyboard nav, dirty-state indicator, autosave chip |
| `StatusPill` | 10 statuses, consistent colour + icon |
| `ProgressRing` / `ProgressBar` | Batch and pipeline progress |
| `PipelineStepper` | 7 stages with live state, error branch |
| `DataTable` | Server-side sort/filter/paginate, column chooser, sticky header, row density toggle, CSV export, saved views |
| `JurisdictionPicker` | Cascading state → district → tehsil → village, LGD-backed, typeahead in both scripts |
| `MapPanel` | MapLibre, layer switcher, parcel search, measure, legend, fullscreen |
| `ValidationList` | Grouped by severity, with fix hints and jump-to-field |
| `DuplicateCompare` | Two-column diff of two records + both source images |
| `AuditTimeline` | Vertical timeline, actor avatars, expandable payload diff |
| `KpiCard` | Value, delta, sparkline, drilldown link |
| `ChartFrame` | Consistent title/legend/export/no-data/loading states |
| `EmptyState` / `ErrorState` / `SkeletonLoader` | Never a blank screen |
| `LanguageSwitcher` · `FontSizeControls` · `ContrastToggle` | GIGW utilities |
| `CommandPalette` | `Ctrl+K` — jump to record, batch, village, screen. Power-user delight |
| `ShortcutCheatsheet` | `?` overlay |
| `Toast` / `ConfirmDialog` | Destructive actions require typed confirmation |

### 15.4 Layout system

- **Shell:** fixed gov header (64px) + collapsible left sidebar (240px / 64px icon rail) + content area with breadcrumb bar.
- **Grid:** 12-col, 24px gutter desktop; stacks at <1024px. Verifier console is desktop-only (with an explicit "please use a desktop" notice on mobile — honest, not broken).
- **Public portal:** fully responsive, mobile-first, since citizens use phones.
- **Density modes:** Comfortable / Compact toggle on tables — Tehsil offices with 10-year-old monitors want compact.

### 15.5 Micro-interaction details that sell the demo

- Processing card shows a **scan-line sweeping across a document thumbnail** while OCR runs.
- Field values **type in progressively** as extraction completes (SSE-driven), so the user watches data appear.
- Clicking a field makes the document viewer **smoothly pan and zoom** with a pulsing highlight ring.
- Confidence badges **animate from grey to their colour** as the score arrives.
- Map parcels **fill in one by one** when a village finishes digitizing.
- The dashboard's India map has a **hover tooltip with a mini progress bar** per state.
- Approving a record plays a **subtle 120ms success stamp animation** — the record card gets a green "VERIFIED" stamp overlay, like a real government seal.

> That last one is small, memorable, and takes 20 minutes to build. Do it.

---

## 16. Screen-by-Screen Specification

| # | Screen | Route | Purpose | Key elements | Priority |
|---|--------|-------|---------|--------------|----------|
| 1 | **Landing / Public Portal** | `/` | Public face, project story | Hero with animated cadastral mark, live national counters, "Search your record", "How it works" 4-step, partner logos, accessibility bar | P1 |
| 2 | **Login** | `/login` | Auth | Emblem, employee code / email, password, MFA step, language switcher, "Citizen login" tab | P0 |
| 3 | **Dashboard (role-aware home)** | `/dashboard` | At-a-glance | 6 KPI cards, India/state choropleth, recent batches, pending-review CTA, throughput chart, alerts feed | P0 |
| 4 | **Upload / New Batch** | `/upload` | Ingest | Metadata form (jurisdiction, year, doc type), dropzone with folder support, per-file rows with thumbnail + quality score + status, "Start processing" | P0 |
| 5 | **Batches** | `/batches` | Batch mgmt | Table: name, jurisdiction, docs, progress ring, status, created; row → detail | P1 |
| 6 | **Batch Detail** | `/batches/{id}` | Monitor | Pipeline stepper aggregate, per-doc grid with live SSE status, error list, retry-failed, export manifest | P1 |
| 7 | **Documents** | `/documents` | Browse | Filterable table + gallery toggle, thumbnails, confidence chip, status pill, bulk actions | P1 |
| 8 | **Document Detail** | `/documents/{id}` | Inspect | Viewer + page rail + detected regions overlay + extracted records list + processing log + reprocess | P1 |
| 9 | **⭐ Verification Console (Review)** | `/review/{id}` | **The hero screen** | Split: deep-zoom viewer w/ bbox overlays ⟷ sectioned field panel with confidence rails; validation drawer; keyboard bar; Approve / Reject / Escalate / Duplicate; next-in-queue auto-advance | **P0** |
| 10 | **Review Queue** | `/review` | Work list | Tabs: Priority / Standard / Exception / Duplicates / QA; sort by confidence/SLA/age; assigned-to-me filter; "Start reviewing" big button | P0 |
| 11 | **Duplicate Resolution** | `/duplicates/{id}` | Merge | Side-by-side record diff + both source scans + merge/keep/reject actions with reason | P2 |
| 12 | **Records Search** | `/records` | Find | Multi-script fuzzy search bar, advanced filters, results table, saved searches, export | P1 |
| 13 | **Record Detail** | `/records/{id}` | Canonical view | Field grid with confidence, source image thumbnails, parcel mini-map, validation results, audit timeline, publish status, certified PDF export | P1 |
| 14 | **⭐ GIS Map Viewer (Mapping)** | `/map` | Spatial | Fullscreen MapLibre, layer panel, parcel search, click-parcel → record card, thematic layers, measure, export, georeference tool entry | **P1** |
| 15 | **Map Georeferencing** | `/map/georeference/{sheetId}` | Align scans | Dual-pane GCP picker (scan ⟷ basemap), residual error readout, warp preview, save | P3 |
| 16 | **Analytics — Progress** | `/analytics/progress` | Monitoring | Choropleth drilldown, ranking table, target-vs-actual, time-range | P1 |
| 17 | **Analytics — Accuracy** | `/analytics/accuracy` | Quality | Field × language heatmap, confidence histogram, correction-rate trend, model-version compare | P2 |
| 18 | **Analytics — Operations** | `/analytics/operations` | Throughput | Queue depth, stage latency, worker utilization, failure treemap | P2 |
| 19 | **Rules Manager** | `/admin/rules` | Config | Rule table, editor with expression validator, dry-run against sample records, enable/disable, version history | P2 |
| 20 | **Integrations (Integrations)** | `/admin/integrations` | Connectors | Connector cards with health, sync-job history, field-mapping editor, manual sync trigger, dead-letter retry | P2 |
| 21 | **API & Developer Portal** | `/developers` | Integration | Swagger UI, GraphQL playground, API key mgmt, webhook config, sample code (cURL/Python/Java) | P2 |
| 22 | **Users & Roles** | `/admin/users` | Access | User table, role assignment, jurisdiction scoping, MFA reset, activity, deactivate | P1 |
| 23 | **Audit Log** | `/admin/audit` | Trust | Filterable timeline, payload diffs, chain-verify button with green "chain intact" result | P1 |
| 24 | **Model Registry (Learning)** | `/admin/models` | ML ops | Model versions, metrics, training runs, golden-set eval, promote/rollback, correction-volume chart | P2 |
| 25 | **Citizen Record View** | `/public/records/{id}` | Transparency | Masked record, QR-verifiable certificate download, "report an error" form | P2 |
| 26 | **Notifications** | `/notifications` | Alerts | Grouped feed, preferences | P3 |
| 27 | **Settings / Profile** | `/settings` | User prefs | Language, density, theme, shortcuts, notification prefs | P3 |
| 28 | **Accessibility Statement / Policies** | `/accessibility`, `/policies` | GIGW | Required gov pages | P2 |
| 29 | **Help & Training** | `/help` | Adoption | Video walkthroughs, FAQ, keyboard reference, downloadable SOP PDF (EN/HI) | P3 |

**P0 = must exist for the demo. P1 = strongly expected. P2 = differentiator. P3 = nice-to-have.**

---

## 17. Repository Structure

```
bhumi/
├── README.md
├── IMPLEMENTATION_PLAN.md
├── docker-compose.yml                 # one-command demo bring-up
├── docker-compose.gpu.yml
├── Makefile                           # make dev / seed / test / demo
├── .github/workflows/                 # ci.yml, security.yml, deploy.yml
│
├── apps/
│   ├── web/                           # Next.js 15
│   │   ├── app/
│   │   │   ├── (public)/              # landing, citizen search, policies
│   │   │   ├── (auth)/login
│   │   │   ├── (app)/dashboard
│   │   │   ├── (app)/upload
│   │   │   ├── (app)/batches/[id]
│   │   │   ├── (app)/documents/[id]
│   │   │   ├── (app)/review/[id]      # ⭐ Review
│   │   │   ├── (app)/records/[id]
│   │   │   ├── (app)/map              # ⭐ Mapping
│   │   │   ├── (app)/analytics/*      # Insights
│   │   │   └── (admin)/*
│   │   ├── components/
│   │   │   ├── gov/                   # GovHeader, GovFooter, a11y controls
│   │   │   ├── confidence/            # ConfidenceBadge, ConfidenceField
│   │   │   ├── viewer/                # DocumentViewer, BboxOverlay
│   │   │   ├── map/                   # MapPanel, LayerSwitcher
│   │   │   ├── charts/                # ChartFrame + chart set
│   │   │   └── ui/                    # shadcn primitives
│   │   ├── lib/                       # api client (generated), hooks, i18n
│   │   ├── messages/                  # en.json, hi.json, mr.json, ta.json…
│   │   └── styles/tokens.css          # the palette from §2.3
│   │
│   └── mock-dilrmp/                   # standalone mock gov service (FastAPI)
│
├── services/
│   ├── api/                           # FastAPI monolith-first, module-boundaried
│   │   ├── bhumi/
│   │   │   ├── main.py
│   │   │   ├── core/                  # config, security, deps, audit, rbac
│   │   │   ├── db/                    # models, session, migrations(alembic)
│   │   │   ├── modules/
│   │   │   │   ├── auth/              # login, RBAC, jurisdiction scoping
│   │   │   │   ├── intake/            # upload, batches, preprocessing
│   │   │   │   ├── vision/            # layout + OCR orchestration
│   │   │   │   ├── extraction/        # NER, normalization, records
│   │   │   │   ├── validation/        # rules, duplicates, cross-checks
│   │   │   │   ├── review/            # queues, locks, approvals
│   │   │   │   ├── mapping/           # parcels, georeferencing, tiles
│   │   │   │   ├── insights/          # dashboards, exports
│   │   │   │   ├── integrations/      # connectors, webhooks, public API
│   │   │   │   ├── vault/             # documents, audit chain, retention
│   │   │   │   ├── learning/          # corrections, model registry
│   │   │   │   └── notifications/
│   │   │   └── graphql/
│   │   └── tests/
│   │
│   └── worker/                        # Celery workers
│       ├── tasks/preprocess.py        # Intake
│       ├── tasks/layout.py            # Vision
│       ├── tasks/ocr.py               # Vision
│       ├── tasks/extract.py           # Extraction
│       ├── tasks/validate.py          # Validation
│       ├── tasks/publish.py           # Integrations
│       └── tasks/train.py             # Learning
│
├── ml/
│   ├── vision/                        # layout, ocr, doctype
│   │   ├── preprocess/                # deskew, denoise, binarize, superres
│   │   ├── layout/                    # yolo/detectron configs + inference
│   │   ├── ocr/                       # paddle, tesseract, trocr wrappers, ensemble
│   │   └── calibration/
│   ├── extraction/                          # ner, normalization, transliteration
│   │   ├── ner/
│   │   ├── normalize/                 # units, dates, numerals, names
│   │   └── llm_fallback/
│   ├── learning/                       # dataset build, training, eval, registry
│   ├── notebooks/
│   └── models/                        # (gitignored) local artifacts
│
├── tools/
│   ├── synthgen/                      # ⭐ synthetic land-record generator
│   │   ├── templates/                 # 7/12, khatauni, jamabandi, chitta layouts
│   │   ├── fonts/                     # Noto Indic + handwriting fonts
│   │   ├── degrade.py                 # noise, fold, stain, fade, skew, bleed
│   │   └── generate.py
│   ├── seed/                          # LGD import, demo users, sample batch
│   └── benchmark/                     # accuracy + throughput harness
│
├── infra/
│   ├── k8s/                           # manifests + helm chart
│   ├── terraform/
│   ├── geoserver/
│   ├── grafana/dashboards/
│   └── nginx/
│
├── data/
│   ├── samples/                       # demo documents (12 languages)
│   ├── golden/                        # hand-labelled eval set
│   ├── lgd/                           # jurisdiction master CSVs
│   └── gis/                           # sample cadastral shapefiles
│
└── docs/
    ├── architecture.md
    ├── api.md
    ├── data-model.md
    ├── ml-design.md
    ├── security.md
    ├── design-system.md
    ├── deployment.md
    ├── demo-script.md
    └── diagrams/                      # exported SVGs for the PPT
```

---

## 18. DevOps, Infrastructure & Deployment

### 18.1 Local development

```bash
git clone <repo> && cd bhumi
cp .env.example .env
make dev          # docker compose up: postgres+postgis, redis, minio, api, worker, web, geoserver, mock-dilrmp
make seed         # LGD master + demo users + 50 sample documents + sample cadastral village
make demo         # runs the full pipeline on the sample batch so the demo is pre-warmed
```
Everything reachable at `http://localhost:3000`, API docs at `http://localhost:8000/api/docs`.

### 18.2 CI/CD

| Stage | Actions |
|-------|---------|
| Lint | ruff + mypy (Python), eslint + tsc (TS), sqlfluff |
| Test | pytest (unit + integration w/ testcontainers), vitest, Playwright e2e |
| Security | Trivy image scan, pip-audit, npm audit, gitleaks, Bandit |
| Build | Multi-stage Docker, SBOM (syft), push to GHCR |
| Deploy | ArgoCD sync to staging → smoke tests → manual gate → prod |
| ML | DVC-tracked datasets; training runs logged to MLflow; model promotion is a separate approved workflow |

### 18.3 Observability

- **Traces:** OpenTelemetry spans across `upload → preprocess → layout → ocr → ner → validate → publish`, so you can see exactly which stage is slow on which document type.
- **Metrics:** `bhumi_pages_processed_total`, `bhumi_stage_duration_seconds{stage}`, `bhumi_field_confidence_bucket{field}`, `bhumi_review_handling_seconds`, `bhumi_queue_depth{type}`, `bhumi_correction_rate{field,language}`.
- **Logs:** structured JSON, correlation ID propagated from the browser request through every worker.
- **Dashboards:** Grafana — Pipeline Health, Model Quality, Business KPIs.
- **Alerts:** queue depth > 1000, correction rate spike > 20% WoW, connector circuit open, chain-verify failure (page immediately), p95 stage latency breach.

### 18.4 Scaling plan

| Volume | Configuration |
|--------|---------------|
| 1k pages/day (pilot tehsil) | 2 CPU workers, no GPU, single Postgres |
| 100k pages/day (state) | 20 CPU workers + 4 GPU workers (Triton, batch=8), Postgres w/ read replica, Redis Sentinel |
| 1M+ pages/day (national) | K8s HPA on queue depth, GPU node pool w/ MIG partitioning, Postgres partitioned by state + Citus/sharding, Kafka instead of Redis Streams, OpenSearch cluster |

Cost lever: **95% of pages never need the LLM fallback or the GPU handwriting model.** Route cheaply, escalate rarely.

---

## 19. Phase-Wise Execution Roadmap

### 19.1 Pre-hackathon (the part that actually decides the outcome)

| Week | Focus | Deliverable |
|------|-------|-------------|
| **W-4** | Research & data | Collect 200+ real public land records across 6 states; study 7/12, Khatauni, Jamabandi, Chitta formats; write the field schema |
| **W-3** | Synthetic generator + baseline | `tools/synthgen` producing 20k degraded records; baseline PaddleOCR+Tesseract accuracy measured on the golden set |
| **W-2** | Model training | Layout model + NER model trained; TrOCR LoRA on handwriting; confidence calibration; **record the accuracy numbers — you will quote them on stage** |
| **W-1** | Skeleton app | Auth, DB schema, upload → pipeline → record, one working dashboard; design system components built; docker-compose green |
| **W-0** | Polish & rehearse | Verification console perfected, map demo, seed data curated, PPT + video, run the demo 10 times |

### 19.2 Hackathon 36-hour plan

| Hours | Track A: Backend + ML | Track B: Frontend + UX | Track C: GIS + Integration |
|-------|----------------------|------------------------|----------------------------|
| 0–4 | Bring up stack, seed data, verify pipeline end-to-end | Shell, gov header/footer, design tokens, auth screens | PostGIS load of sample village, MapLibre base view |
| 4–10 | Preprocessing + OCR ensemble wired, confidence calibration live | Upload screen + live SSE progress + batch detail | Parcel layer + tiles + parcel search |
| 10–16 | NER extraction → 24-field record; validation rules v1 (30 rules) | **Review verification console** — viewer, bbox linking, field panel | Georeferencing tool; record↔parcel linking |
| 16–22 | Duplicate detection, routing policy, review APIs | Review queue, approve/reject flow, keyboard shortcuts | Mock DILRMP + Integrations push flow + sync history UI |
| 22–28 | Analytics aggregation endpoints, audit chain, Learning correction capture | Insights dashboards, India choropleth, charts | Geometry validation + area reconciliation UI |
| 28–32 | Rules manager API, model registry, public API + Swagger polish | Records search, record detail, audit timeline, admin screens | Map thematic layers, export |
| 32–35 | **Freeze.** Bug bash, seed the perfect demo dataset, performance pass | Accessibility audit, dark mode check, empty/error states, micro-interactions | Demo rehearsal of the map moment |
| 35–36 | Final rehearsal ×3, backup video recorded, PPT locked | | |

**Rule: feature freeze at hour 32.** Every SIH team that codes until hour 36 demos a broken build.

### 19.3 Post-hackathon productization (for the "what next" slide)

| Phase | Duration | Outcome |
|-------|----------|---------|
| Pilot | 3 months | One tehsil, 50k pages, measured accuracy + time saved vs manual |
| District rollout | 6 months | Full district, LRMS integration live, verifier training programme |
| State rollout | 12 months | Multi-district, HA infra on MeghRaj, state LRMS certified integration |
| National | 24 months | DILRMP integration, 12 languages certified, open API ecosystem |

---

## 20. Team Allocation Matrix

*(assumes a 6-member SIH team; merge roles if smaller)*

| Member | Role | Owns | Must deliver |
|--------|------|------|--------------|
| **1** | ML Lead — Vision | Vision: preprocessing, layout, OCR ensemble, handwriting, calibration | Working OCR on 12 languages + accuracy numbers |
| **2** | ML Engineer — NLP | Extraction + Learning: NER, normalization, transliteration, LLM fallback, learning loop | 24-field extraction with confidence |
| **3** | Backend Lead | API, DB, workers, Validation rules, RBAC, audit chain, Integrations | Stable end-to-end pipeline + APIs |
| **4** | Frontend Lead | Design system, Review console, upload flow, shell | The hero screen, pixel-perfect |
| **5** | Frontend + Data Viz | Insights dashboards, records/search, admin, accessibility | Dashboards that look like a real gov product |
| **6** | GIS + DevOps + Presentation | Mapping, georeferencing, docker/infra, PPT, demo script, video | The map moment + a build that never breaks |

**Cross-cutting:** everyone writes tests for their own module; member 6 owns the demo rehearsal schedule; member 3 owns the seed dataset quality.

---

## 21. Testing & Quality Strategy

| Layer | Approach | Target |
|-------|----------|--------|
| Unit | pytest / vitest for rules, normalizers, transforms | ≥80% on `validation/` and `normalize/` — these are pure functions, cheap to cover |
| Integration | testcontainers (Postgres+PostGIS, Redis, MinIO); full pipeline on fixture documents | Every stage transition |
| ML evaluation | Frozen golden set (500 records, hand-labelled); report CER, field-F1, end-to-end record accuracy per language and doc type | Tracked per model version in MLflow |
| Contract | Schemathesis against OpenAPI; connector contract tests against mock services | No breaking API changes |
| E2E | Playwright: upload → process → review → approve → publish; plus map interaction | Green on CI before every demo |
| Accessibility | axe-core in CI + manual NVDA/keyboard pass on P0 screens | Zero critical violations |
| Performance | Locust: 100 concurrent uploads, 50 concurrent verifiers; k6 on read APIs | p95 API <400ms, page <3s on 2 Mbps |
| Security | OWASP ZAP baseline, Trivy, gitleaks, dependency audit | No high/critical |
| Chaos (stretch) | Kill a worker mid-batch; verify no document is lost or double-processed | Idempotency proven |

**Golden-set discipline:** never train on the golden set, never change it mid-project. It is the only number you can honestly quote to judges.

---

## 22. Demo Script & Judge Pitch

### 22.1 The 8-minute demo (rehearse to the second)

| Time | Beat | What you show | What you say |
|------|------|---------------|--------------|
| 0:00–0:45 | **The problem** | One slide: a photo of a real faded handwritten Khatauni page | "Two-thirds of Indian civil litigation is land-related. This page took a data-entry operator 11 minutes to type — and he got the survey number wrong." |
| 0:45–1:30 | **The upload** | Drag a 5-page mixed-language batch (Hindi register + Marathi 7/12 + a cadastral map scan) | "BHUMI takes anything — scans, photos, PDFs, maps, in twelve languages." |
| 1:30–2:45 | **Live processing** | Pipeline stepper animating; scan-line on thumbnails; fields typing in progressively with confidence badges colouring in | "Preprocessing, layout detection, OCR, entity extraction, validation — and every single field carries a calibrated confidence score." |
| 2:45–4:15 | **⭐ The verification console** | Open the amber record. Click owner name → viewer zooms to the exact handwritten line. Fix one character. Field goes green. `Ctrl+Enter`. Green VERIFIED stamp animation. | "This is where government throughput actually happens. Bidirectional linking, keyboard-first — our verifiers clear a record in under 45 seconds instead of 11 minutes." |
| 4:15–5:15 | **⭐ The map moment** | Switch to Mapping. The cadastral scan we uploaded is now georeferenced; parcels are drawn; click parcel 142/2A → the record card opens with the source scan | "We don't just read the register — we read the *map*, extract the parcels, and link text to geometry. Recorded area 1.42 ha, mapped area 1.4355 ha, 1.1% delta — within tolerance, auto-passed." |
| 5:15–6:00 | **Validation & duplicates** | Show a deliberately duplicated record getting caught, and an area-mismatch flagged with a fix hint | "Sixty-plus rules, cross-database checks, fuzzy duplicate detection across scripts." |
| 6:00–6:45 | **Dashboards + audit** | Insights India choropleth → drill to district → tehsil. Then the audit timeline + "verify chain" → green. | "Real-time digitization progress for every level of administration. And every touch is in a tamper-evident hash chain — click, and we prove the record was never altered." |
| 6:45–7:30 | **Integration + learning** | Swagger UI live call; push to mock DILRMP with ack ID; Learning accuracy chart across 3 model versions | "Open APIs, DILRMP-ready connectors, and the model gets better every single time a verifier corrects it — 91.2% to 96.4% over three versions on our held-out set." |
| 7:30–8:00 | **The ask** | Impact slide | "One tehsil pilot, 50,000 pages, and we can show measured time and cost savings in 90 days." |

### 22.2 Anticipated judge questions — prepared answers

| Question | Answer |
|----------|--------|
| "Is this just Tesseract with a UI?" | "Tesseract is one of five engines in one of seven stages. The value is layout understanding, calibrated confidence, a 60-rule validation engine, geometry reconciliation, and a learning loop. OCR alone gets you 60% usable records; BHUMI's pipeline gets 96% with human effort focused only on the 8% that's genuinely uncertain." |
| "What's your actual accuracy?" | Quote real golden-set numbers per language and per field. Never say "very high." Show the table. Admit handwriting in Urdu is your weakest at X%. Honesty about weakness reads as competence. |
| "Handwriting in 12 languages is unsolved." | "Correct — which is exactly why we built for *uncertainty* rather than pretending it's solved. Low-confidence handwriting is routed to a human in 45 seconds, and every correction trains the model. We're not claiming to eliminate humans; we're claiming a 10× multiplier on each one." |
| "How does this integrate with existing state systems?" | Show the connector interface and a field-mapping YAML. "Adding Karnataka's Bhoomi is a mapping file, not a code change." |
| "Data security — these are sensitive records." | Walk the RBAC/ABAC matrix, the hash-chained audit log, DPDP alignment, no-Aadhaar-storage policy, and MeghRaj deployment. |
| "Can it scale nationally?" | Show the scaling table (§18.4) and the partitioning strategy. Mention that 95% of pages never touch a GPU. |
| "What about old records with no map?" | "Orphan records are tracked as a first-class state and surfaced on a worklist for field survey — we don't silently drop them." |
| "Cost?" | §25 table. Per-page marginal cost vs manual data entry. |

### 22.3 Demo safety rules

- **Pre-warm the pipeline** — process the demo batch beforehand; run it live only on 3–5 pages.
- **Record a 3-minute backup video.** Wi-Fi will fail. It always fails.
- **Local-only demo** — no external API dependency during the pitch.
- **Seed a deliberately flawed record** so the validation/duplicate story has something real to catch.
- **Have the golden-set accuracy table printed** and in the appendix slides.

---

## 23. Risk Register & Mitigations

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|:---:|:---:|------------|
| R1 | Handwritten Indic OCR accuracy too low to impress | High | High | Lead with confidence + human loop as *the design*, not a patch. Show the printed-text numbers (strong) separately from handwriting (honest). Fine-tune on synthetic + IIIT-HW early |
| R2 | No real labelled training data | High | High | **Synthetic generator built in W-3.** 50k degraded records; plus 300 hand-labelled golden records |
| R3 | Scope creep — 29 screens is a lot | High | Medium | Strict P0/P1/P2/P3. Ship P0 perfectly before touching P2. Feature freeze at hour 32 |
| R4 | GPU unavailable at venue | Medium | High | Quantized ONNX CPU path for every model; pre-computed results for the seeded demo batch |
| R5 | Real DILRMP/LRMS access unavailable | Certain | Low | Mock services with realistic OpenAPI contracts. Judges accept mocks when the *adapter* is genuinely built |
| R6 | Demo fails live | Medium | Critical | Backup video, pre-warmed data, local-only, 10 rehearsals, a designated "driver" who never improvises |
| R7 | Model inference too slow on stage | Medium | Medium | Batch size 1 tuning, warm model cache, show progressive SSE so latency *feels* like progress |
| R8 | Team member unavailable / blocked | Medium | Medium | Every module has a documented second owner; daily 15-min standup; no single-person secrets |
| R9 | Merge conflicts / broken main near deadline | Medium | High | Trunk-based with short branches, CI gate on main, one integrator (member 6) with merge authority after hour 28 |
| R10 | Accessibility failures noticed by gov judges | Medium | Medium | axe-core in CI from day one, not an afterthought; keyboard-only pass on P0 screens |
| R11 | PostGIS/GDAL install pain on Windows | High | Medium | Everything in Docker from day one. Nobody installs GDAL natively |
| R12 | Overfitting the demo to one document type | Medium | High | Demo batch deliberately mixes 3 languages and 3 document types including one deliberately damaged page |

---

## 24. Success Metrics / KPIs

### 24.1 Technical

| Metric | Target | Stretch |
|--------|:------:|:-------:|
| Printed-text CER (Hindi/Marathi/English) | ≤3% | ≤1.5% |
| Handwritten CER (Devanagari) | ≤12% | ≤8% |
| Field-level F1 (structured fields) | ≥0.90 | ≥0.95 |
| End-to-end record accuracy (all mandatory fields correct) | ≥85% | ≥92% |
| Straight-through processing rate (auto-approved, no human) | ≥60% | ≥75% |
| Confidence calibration error (ECE) | ≤0.05 | ≤0.02 |
| Duplicate detection precision / recall | 0.95 / 0.85 | 0.98 / 0.92 |
| Processing throughput | ≥10 pages/min/worker | ≥25 |
| API p95 latency | <400ms | <200ms |
| Uptime | 99.5% | 99.9% |

### 24.2 Operational / impact

| Metric | Baseline (manual) | BHUMI target |
|--------|:-----------------:|:------------:|
| Time per record | 8–12 min | **<60 s** (auto) / <90 s (reviewed) |
| Cost per record | ₹12–20 | **₹2–4** |
| Data-entry error rate | 4–8% | **<1%** |
| Records digitized per operator-day | 40–60 | **400–600** |
| Time to onboard a new verifier | 2–3 days | **<2 hours** |
| Rework rate (records re-entered) | 10% | **<2%** |

*(Baselines to be validated during the pilot; present them as estimates from published DILRMP studies, not as measured facts.)*

---

## 25. Cost & Scale Model

| Item | Pilot (1 tehsil, 50k pages) | State (10M pages/yr) |
|------|------------------------------|----------------------|
| Compute (CPU workers) | 4 vCPU × 4 nodes | 200 vCPU autoscaled |
| GPU | 1 × T4 (shared) | 4 × A10G with MIG |
| Storage | 500 GB | 60 TB + archive tier |
| Database | 100 GB | 4 TB partitioned + replica |
| Est. infra cost | ~₹35k/month | ~₹9–14 lakh/month |
| Marginal cost/page | ~₹0.70 | ~₹0.15 |
| Human verification cost/page (at 35% review rate) | ~₹2.10 | ~₹1.80 |
| **Total vs manual (₹12–20/record)** | **~₹3/page** | **~₹2/page** |

*Figures are order-of-magnitude estimates for the pitch; label them as such.*

---

## 26. Future Scope

| Idea | Value |
|------|-------|
| **Blockchain-anchored title registry** | Publish daily Merkle roots to a permissioned chain — makes tampering cryptographically provable across departments |
| **Mobile field-survey app** | Offline-first PWA for Patwaris: capture parcel photos, GPS-trace boundaries, sync when online |
| **Voice-assisted verification** | Verifier speaks corrections in Hindi/Marathi — IndicASR → field update. Huge for low-typing-literacy staff |
| **Automatic dispute detection** | Graph analysis over ownership chains to surface conflicting claims, benami patterns, and encroachment on government land |
| **Drone/satellite change detection** | Compare cadastral polygons against current imagery to flag unrecorded construction or boundary changes |
| **Citizen self-service portal** | Apply for mutation, track status, download certified extracts — closing the loop from digitization to service delivery |
| **Multilingual chatbot** | "मेरी ज़मीन का रिकॉर्ड दिखाओ" — natural-language record retrieval over the API |
| **Cross-state deduplication** | Detect the same person holding land across states — relevant to land-ceiling enforcement |
| **Federated learning across states** | Train on all states' corrections without any state's raw records leaving its own cloud |
| **Open Data publication** | Anonymized, aggregated land statistics as public open data for researchers |

---

## 27. Appendices

### A. Glossary

| Term | Meaning |
|------|---------|
| **Khasra / Survey number** | Unique parcel identifier in revenue records |
| **Khata / Khatauni** | Account number grouping all parcels of an owner in a village |
| **Jamabandi** | Record of Rights (North India) |
| **Pahani / Adangal / Chitta** | Record of Rights (South India) |
| **7/12 Extract (Satbara)** | Maharashtra's RoR — Form 7 (ownership) + Form 12 (crop) |
| **Patta** | Title deed (Tamil Nadu, others) |
| **Intkal / Mutation** | Transfer of title in revenue records after sale/inheritance |
| **Shajra / Tippan / FMB** | Cadastral / field measurement map |
| **Patwari / Lekhpal / Talathi / VAO** | Village-level revenue officer |
| **Tehsil / Taluk / Mandal** | Sub-district administrative unit |
| **Hadbast number** | Village survey number |
| **DILRMP** | Digital India Land Records Modernization Programme |
| **LRMS** | Land Records Management System |
| **LGD** | Local Government Directory (authoritative jurisdiction codes) |
| **RoR** | Record of Rights |
| **GIGW** | Guidelines for Indian Government Websites |
| **MeghRaj** | NIC's Government of India cloud |

### B. Area unit conversion reference (partial — verify per district)

| Unit | Region | Approx. m² |
|------|--------|-----------:|
| Hectare | universal | 10,000 |
| Acre | universal | 4,046.86 |
| Bigha (pucca) | UP/Bihar | 2,529 |
| Bigha (kaccha) | UP | 843 |
| Bigha | Rajasthan | 2,529 / 1,618 (varies) |
| Bigha | West Bengal | 1,337.8 |
| Guntha | Maharashtra/Karnataka | 101.17 |
| Kanal | Punjab/Haryana/J&K | 505.86 |
| Marla | Punjab/Haryana | 25.29 |
| Cent | Tamil Nadu/Kerala | 40.47 |
| Ground | Tamil Nadu | 222.97 |
| Katha | Bihar/Assam | 126.44 (varies) |

> **This table is a validation rule input, not a constant.** Store per-district values in `area_units` and always keep the original text alongside the converted value.

### C. Language coverage matrix

| Language | Script | Printed OCR | Handwritten | NER | UI locale |
|----------|--------|:-----------:|:-----------:|:---:|:---------:|
| Hindi | Devanagari | ✓ | ✓ | ✓ | ✓ |
| Marathi | Devanagari | ✓ | ✓ | ✓ | ✓ |
| English | Latin | ✓ | ✓ | ✓ | ✓ |
| Bengali | Bengali | ✓ | ◐ | ✓ | ◐ |
| Tamil | Tamil | ✓ | ◐ | ✓ | ◐ |
| Telugu | Telugu | ✓ | ◐ | ✓ | ◐ |
| Kannada | Kannada | ✓ | ◐ | ✓ | — |
| Malayalam | Malayalam | ✓ | ◐ | ✓ | — |
| Gujarati | Gujarati | ✓ | ◐ | ✓ | — |
| Punjabi | Gurmukhi | ✓ | ◐ | ✓ | — |
| Odia | Odia | ✓ | ◐ | ◐ | — |
| Urdu | Perso-Arabic | ◐ | ◐ | ◐ | — |

✓ = trained & evaluated · ◐ = baseline model, limited fine-tuning · — = not in scope for the hackathon build

### D. Deliverables checklist

- [ ] Running system (docker-compose one-command)
- [ ] Seeded demo dataset (3 languages × 3 doc types + 1 cadastral map)
- [ ] Golden-set accuracy report (per language, per field)
- [ ] Architecture diagram (SVG, in the PPT)
- [ ] Pipeline diagram (SVG)
- [ ] ER diagram
- [ ] OpenAPI spec + live Swagger
- [ ] Postman/Bruno collection
- [ ] 3-minute backup demo video
- [ ] Pitch deck (12 slides max)
- [ ] This implementation plan
- [ ] README with integrationsp in <5 commands
- [ ] Accessibility statement page
- [ ] Security & compliance one-pager

---

*BHUMI — Bharat's Unified Mapping & Intelligence System*
*Prepared for Smart India Hackathon, Problem Statement 26018.*
