# BHUMI — Bharat's Unified Mapping & Intelligence System

**AI-driven platform for digitizing, validating and managing land records.**

Smart India Hackathon · Problem Statement **26018** — *Intelligent Land Record Digitization and Validation System*

---

## What it does

BHUMI ingests any legacy land document — a scanned register, a faded handwritten Khatauni, a Marathi 7/12 extract, a cadastral map sheet — and returns a **structured, validated, geo-linked, audit-trailed digital record** where every field carries a calibrated confidence score. Fields the AI is unsure about are routed to a human verifier; everything else flows straight through.

```
INTAKE ──▶ VISION ──▶ EXTRACTION ──▶ VALIDATION ──▶ REVIEW ──▶ INTEGRATIONS ──▶ VAULT
 ingest     ocr+cv     nlp fields       rules        human        publish        archive
                                  │
                  INSIGHTS · MAPPING · LEARNING
```

## Modules

| Module | Responsibility |
|--------|----------------|
| **Intake** | Upload, batching, dedup, page split, image cleanup, quality gate |
| **Vision** | Document-type classification, layout & table detection, printed + handwritten OCR |
| **Extraction** | Indic NER, field mapping, transliteration, unit/date/numeral normalization |
| **Validation** | Rule engine, master-data cross-checks, duplicate detection, geometry reconciliation |
| **Review** | Human verification console, queues, locks, SLA, maker–checker |
| **Mapping** | Cadastral parcels, georeferencing, parcel↔record linking, topology checks |
| **Insights** | Dashboards, progress tracking, accuracy analytics, exports |
| **Integrations** | DILRMP / state LRMS / DigiLocker connectors, webhooks, public API |
| **Vault** | Secure document repository, metadata, hash-chained audit trail |
| **Learning** | Correction capture, dataset build, retraining, model registry |

## Quick start

```bash
cp .env.example .env
make up          # start postgres+postgis, redis, minio, api, worker, web
make seed        # jurisdiction master + demo users + sample documents
make demo        # run the full pipeline over the sample batch
```

| Service | URL |
|---------|-----|
| Web app | http://localhost:3000 |
| API docs (Swagger) | http://localhost:8000/api/docs |
| GraphQL playground | http://localhost:8000/api/graphql |
| MinIO console | http://localhost:9001 |
| Mock DILRMP | http://localhost:8010/docs |

### Demo accounts (created by `make seed`)

| Role | Username | Password |
|------|----------|----------|
| System Admin | `admin` | `Bhumi@2026` |
| District Officer | `collector.nashik` | `Bhumi@2026` |
| Supervisor (Tehsildar) | `tehsildar.rahata` | `Bhumi@2026` |
| Verifier (Talathi) | `talathi.shirdi` | `Bhumi@2026` |
| Operator | `operator1` | `Bhumi@2026` |
| GIS Officer | `gis.nashik` | `Bhumi@2026` |
| Auditor | `auditor1` | `Bhumi@2026` |

## Layout

```
apps/web            Next.js 15 frontend
apps/mock-dilrmp    Mock government integration target
services/api        FastAPI backend (module-boundaried monolith)
services/worker     Celery pipeline workers
ml/                 Vision / Extraction / Learning model code
tools/synthgen      Synthetic land-record generator
tools/seed          Jurisdiction + demo data seeding
infra/              Docker, K8s, GeoServer, Grafana
data/               Sample documents, golden eval set, LGD master, GIS
docs/               Architecture, API, data model, design system
```

## Docs

- [Implementation Plan](IMPLEMENTATION_PLAN.md) — the full 27-section plan
- [docs/architecture.md](docs/architecture.md)
- [docs/data-model.md](docs/data-model.md)
- [docs/design-system.md](docs/design-system.md)
- [docs/demo-script.md](docs/demo-script.md)

## Tech

Next.js 15 · React 19 · TypeScript · Tailwind · MapLibre/OpenLayers · FastAPI · Python 3.12 · Celery · PostgreSQL 16 + PostGIS · Redis · MinIO · OpenCV · YOLOv8 · Detectron2 · PaddleOCR · Tesseract · TrOCR · spaCy · HuggingFace Transformers · Indic NLP Library · MuRIL · GeoServer · QGIS · Apache Superset · Grafana · Docker · Kubernetes · NIC MeghRaj
