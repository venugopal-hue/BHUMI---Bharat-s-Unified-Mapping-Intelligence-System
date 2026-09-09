"""All ORM models. Imported here so Alembic autogenerate sees the full metadata."""

from bhumi.db.base import Base
from bhumi.db.models.documents import (
    Batch,
    Document,
    DocumentPage,
    OcrSpan,
    PageRegion,
)
from bhumi.db.models.governance import (
    AuditLog,
    Correction,
    DocumentAccessLog,
    Integration,
    ModelVersion,
    Notification,
    SyncJob,
    Webhook,
)
from bhumi.db.models.identity import (
    ApiClient,
    RefreshToken,
    Role,
    User,
    UserJurisdiction,
    UserRole,
)
from bhumi.db.models.jurisdiction import (
    AreaUnitConversion,
    District,
    State,
    Tehsil,
    Village,
)
from bhumi.db.models.mapping import MapSheet, Parcel, ParcelRecordLink
from bhumi.db.models.records import CoOwner, LandRecord, RecordField
from bhumi.db.models.review import ReviewAction, ReviewQueueItem
from bhumi.db.models.validation import (
    DuplicateCluster,
    DuplicateMember,
    ValidationResult,
    ValidationRule,
)

__all__ = [
    "Base",
    # jurisdiction
    "State", "District", "Tehsil", "Village", "AreaUnitConversion",
    # identity
    "User", "Role", "UserRole", "UserJurisdiction", "RefreshToken", "ApiClient",
    # intake / vision
    "Batch", "Document", "DocumentPage", "PageRegion", "OcrSpan",
    # extraction
    "LandRecord", "RecordField", "CoOwner",
    # validation
    "ValidationRule", "ValidationResult", "DuplicateCluster", "DuplicateMember",
    # review
    "ReviewQueueItem", "ReviewAction",
    # mapping
    "Parcel", "MapSheet", "ParcelRecordLink",
    # governance
    "AuditLog", "DocumentAccessLog", "Integration", "SyncJob", "Webhook",
    "Correction", "ModelVersion", "Notification",
]
