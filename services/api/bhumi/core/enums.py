"""Shared enumerations. Kept in one place so the frontend can be code-generated from them."""

from __future__ import annotations

from enum import StrEnum


# ── Access control ──────────────────────────────────────────────────
class RoleKey(StrEnum):
    PUBLIC = "PUBLIC"
    OPERATOR = "OPERATOR"                    # Data entry operator
    VERIFIER = "VERIFIER"                    # Patwari / Lekhpal / Talathi / VAO
    SUPERVISOR = "SUPERVISOR"                # Tehsildar
    GIS_OFFICER = "GIS_OFFICER"
    DISTRICT_OFFICER = "DISTRICT_OFFICER"    # Collector
    STATE_ADMIN = "STATE_ADMIN"
    SYSTEM_ADMIN = "SYSTEM_ADMIN"
    AUDITOR = "AUDITOR"
    API_CLIENT = "API_CLIENT"


class JurisdictionLevel(StrEnum):
    NATIONAL = "NATIONAL"
    STATE = "STATE"
    DISTRICT = "DISTRICT"
    TEHSIL = "TEHSIL"
    VILLAGE = "VILLAGE"


# ── Documents ───────────────────────────────────────────────────────
class DocumentStatus(StrEnum):
    UPLOADED = "UPLOADED"
    QUEUED = "QUEUED"
    PREPROCESSING = "PREPROCESSING"
    EXTRACTING = "EXTRACTING"
    VALIDATING = "VALIDATING"
    PENDING_REVIEW = "PENDING_REVIEW"
    VERIFIED = "VERIFIED"
    PUBLISHED = "PUBLISHED"
    FAILED = "FAILED"
    REJECTED = "REJECTED"
    RESCAN_NEEDED = "RESCAN_NEEDED"


class DocumentType(StrEnum):
    """Land record document types encountered across Indian states."""

    SEVEN_TWELVE = "SEVEN_TWELVE"        # 7/12 Satbara extract — Maharashtra
    KHATAUNI = "KHATAUNI"                # UP / MP
    JAMABANDI = "JAMABANDI"              # Punjab / Haryana / Rajasthan
    PAHANI = "PAHANI"                    # Telangana / Andhra Pradesh
    ADANGAL = "ADANGAL"                  # Andhra Pradesh
    CHITTA = "CHITTA"                    # Tamil Nadu
    PATTA = "PATTA"                      # Tamil Nadu and others
    ROR = "ROR"                          # Generic Record of Rights
    MUTATION_REGISTER = "MUTATION_REGISTER"   # Intkal
    SALE_DEED = "SALE_DEED"
    CADASTRAL_MAP = "CADASTRAL_MAP"      # Shajra / Tippan / FMB
    VILLAGE_MAP = "VILLAGE_MAP"
    INDEX_II = "INDEX_II"
    ENCUMBRANCE_CERTIFICATE = "ENCUMBRANCE_CERTIFICATE"
    UNKNOWN = "UNKNOWN"


class PipelineStage(StrEnum):
    INTAKE = "INTAKE"
    VISION = "VISION"
    EXTRACTION = "EXTRACTION"
    VALIDATION = "VALIDATION"
    REVIEW = "REVIEW"
    INTEGRATIONS = "INTEGRATIONS"
    VAULT = "VAULT"


# ── Records ─────────────────────────────────────────────────────────
class VerificationStatus(StrEnum):
    AUTO_APPROVED = "AUTO_APPROVED"
    PENDING_REVIEW = "PENDING_REVIEW"
    IN_REVIEW = "IN_REVIEW"
    VERIFIED = "VERIFIED"
    REJECTED = "REJECTED"
    DUPLICATE = "DUPLICATE"
    ON_HOLD = "ON_HOLD"


class FieldSource(StrEnum):
    OCR = "ocr"
    NER = "ner"
    RULE = "rule"
    LAYOUT = "layout"
    CROSSREF = "crossref"
    LLM = "llm"
    HUMAN = "human"


class LandClassification(StrEnum):
    IRRIGATED = "IRRIGATED"
    UNIRRIGATED = "UNIRRIGATED"
    BARREN = "BARREN"
    FOREST = "FOREST"
    ABADI = "ABADI"                      # inhabited / residential
    GOVERNMENT = "GOVERNMENT"
    WATER_BODY = "WATER_BODY"
    PASTURE = "PASTURE"
    ORCHARD = "ORCHARD"
    COMMERCIAL = "COMMERCIAL"
    UNKNOWN = "UNKNOWN"


class OwnerCategory(StrEnum):
    INDIVIDUAL = "INDIVIDUAL"
    JOINT = "JOINT"
    GOVERNMENT = "GOVERNMENT"
    INSTITUTION = "INSTITUTION"
    COMPANY = "COMPANY"
    TRUST = "TRUST"
    UNKNOWN = "UNKNOWN"


class AreaUnit(StrEnum):
    SQ_METRE = "SQ_METRE"
    HECTARE = "HECTARE"
    ACRE = "ACRE"
    BIGHA = "BIGHA"
    BISWA = "BISWA"
    GUNTHA = "GUNTHA"
    KANAL = "KANAL"
    MARLA = "MARLA"
    CENT = "CENT"
    GROUND = "GROUND"
    KATHA = "KATHA"
    ARE = "ARE"


# ── Validation ──────────────────────────────────────────────────────
class Severity(StrEnum):
    BLOCKING = "BLOCKING"
    ERROR = "ERROR"
    WARNING = "WARNING"
    REVIEW = "REVIEW"
    INFO = "INFO"


class RuleStatus(StrEnum):
    PASS = "PASS"
    FAIL = "FAIL"
    WARN = "WARN"
    SKIPPED = "SKIPPED"
    ERROR = "ERROR"


# ── Review ──────────────────────────────────────────────────────────
class QueueType(StrEnum):
    STANDARD = "STANDARD"
    PRIORITY = "PRIORITY"
    EXCEPTION = "EXCEPTION"
    DUPLICATE = "DUPLICATE"
    QA_SAMPLE = "QA_SAMPLE"
    MAKER_CHECKER = "MAKER_CHECKER"


class QueueStatus(StrEnum):
    OPEN = "OPEN"
    CLAIMED = "CLAIMED"
    COMPLETED = "COMPLETED"
    ESCALATED = "ESCALATED"
    CANCELLED = "CANCELLED"


class ReviewAction(StrEnum):
    CLAIM = "CLAIM"
    RELEASE = "RELEASE"
    FIELD_EDIT = "FIELD_EDIT"
    APPROVE = "APPROVE"
    REJECT = "REJECT"
    ESCALATE = "ESCALATE"
    MARK_DUPLICATE = "MARK_DUPLICATE"
    COMMENT = "COMMENT"
    FLAG_ILLEGIBLE = "FLAG_ILLEGIBLE"


# ── Vision ──────────────────────────────────────────────────────────
class RegionType(StrEnum):
    TABLE = "TABLE"
    TABLE_CELL = "TABLE_CELL"
    HEADER = "HEADER"
    FOOTER = "FOOTER"
    OWNER_BLOCK = "OWNER_BLOCK"
    TEXT_BLOCK = "TEXT_BLOCK"
    STAMP = "STAMP"
    SIGNATURE = "SIGNATURE"
    SEAL = "SEAL"
    HANDWRITTEN_NOTE = "HANDWRITTEN_NOTE"
    MAP_REGION = "MAP_REGION"
    MARGINALIA = "MARGINALIA"
    DAMAGED = "DAMAGED"


class Script(StrEnum):
    LATIN = "latin"
    DEVANAGARI = "devanagari"
    BENGALI = "bengali"
    TAMIL = "tamil"
    TELUGU = "telugu"
    KANNADA = "kannada"
    MALAYALAM = "malayalam"
    GUJARATI = "gujarati"
    GURMUKHI = "gurmukhi"
    ODIA = "odia"
    ARABIC = "arabic"
    UNKNOWN = "unknown"


class LanguageCode(StrEnum):
    ENGLISH = "eng"
    HINDI = "hin"
    MARATHI = "mar"
    BENGALI = "ben"
    TAMIL = "tam"
    TELUGU = "tel"
    KANNADA = "kan"
    MALAYALAM = "mal"
    GUJARATI = "guj"
    PUNJABI = "pan"
    ODIA = "ori"
    URDU = "urd"


# ── Integrations ────────────────────────────────────────────────────
class SyncDirection(StrEnum):
    PUSH = "PUSH"
    PULL = "PULL"
    VERIFY = "VERIFY"


class SyncStatus(StrEnum):
    PENDING = "PENDING"
    IN_PROGRESS = "IN_PROGRESS"
    SUCCESS = "SUCCESS"
    FAILED = "FAILED"
    DEAD_LETTER = "DEAD_LETTER"


class WebhookEvent(StrEnum):
    DOCUMENT_PROCESSED = "document.processed"
    RECORD_EXTRACTED = "record.extracted"
    RECORD_VERIFIED = "record.verified"
    RECORD_REJECTED = "record.rejected"
    DUPLICATE_DETECTED = "duplicate.detected"
    BATCH_COMPLETED = "batch.completed"
    VALIDATION_FAILED = "validation.failed"
    MODEL_PROMOTED = "model.promoted"


# ── Audit ───────────────────────────────────────────────────────────
class AuditAction(StrEnum):
    CREATE = "CREATE"
    READ = "READ"
    UPDATE = "UPDATE"
    DELETE = "DELETE"
    LOGIN = "LOGIN"
    LOGIN_FAILED = "LOGIN_FAILED"
    LOGOUT = "LOGOUT"
    APPROVE = "APPROVE"
    REJECT = "REJECT"
    EXPORT = "EXPORT"
    PUBLISH = "PUBLISH"
    CONFIG_CHANGE = "CONFIG_CHANGE"
    PERMISSION_CHANGE = "PERMISSION_CHANGE"
