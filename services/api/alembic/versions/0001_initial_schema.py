"""Initial schema — all tables, indexes and PostGIS extensions.

Revision ID: 0001
Revises:
Create Date: 2026-09-06 00:00:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Extensions are created in env.py before every migration run.
# This migration creates all tables in FK-dependency order.


def upgrade() -> None:
    # ------------------------------------------------------------------ #
    # Jurisdiction hierarchy                                               #
    # ------------------------------------------------------------------ #
    op.create_table(
        "states",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("lgd_code", sa.String(16), nullable=False, unique=True),
        sa.Column("name_en", sa.String(128), nullable=False),
        sa.Column("name_local", sa.String(128)),
        sa.Column("iso_code", sa.String(8)),
        sa.Column("default_language", sa.String(8)),
        sa.Column("geom", sa.Text()),  # geometry stored as WKT via geoalchemy2
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_states_lgd_code", "states", ["lgd_code"])
    op.create_index("ix_states_name_en", "states", ["name_en"])
    op.create_index("ix_states_created_at", "states", ["created_at"])

    op.create_table(
        "districts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("state_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("states.id", ondelete="CASCADE"), nullable=False),
        sa.Column("lgd_code", sa.String(16), nullable=False),
        sa.Column("name_en", sa.String(128), nullable=False),
        sa.Column("name_local", sa.String(128)),
        sa.Column("geom", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("state_id", "lgd_code", name="uq_district_state_lgd"),
    )
    op.create_index("ix_districts_state_id", "districts", ["state_id"])
    op.create_index("ix_districts_lgd_code", "districts", ["lgd_code"])
    op.create_index("ix_districts_name", "districts", ["name_en"])
    op.create_index("ix_districts_created_at", "districts", ["created_at"])

    op.create_table(
        "tehsils",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("district_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("districts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("lgd_code", sa.String(16), nullable=False),
        sa.Column("name_en", sa.String(128), nullable=False),
        sa.Column("name_local", sa.String(128)),
        sa.Column("geom", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("district_id", "lgd_code", name="uq_tehsil_district_lgd"),
    )
    op.create_index("ix_tehsils_district_id", "tehsils", ["district_id"])
    op.create_index("ix_tehsils_lgd_code", "tehsils", ["lgd_code"])
    op.create_index("ix_tehsils_name", "tehsils", ["name_en"])
    op.create_index("ix_tehsils_created_at", "tehsils", ["created_at"])

    op.create_table(
        "villages",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tehsil_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tehsils.id", ondelete="CASCADE"), nullable=False),
        sa.Column("lgd_code", sa.String(16), nullable=False),
        sa.Column("name_en", sa.String(128), nullable=False),
        sa.Column("name_local", sa.String(128)),
        sa.Column("hadbast_no", sa.String(32)),
        sa.Column("patwari_halka", sa.String(64)),
        sa.Column("pin_code", sa.String(8)),
        sa.Column("total_parcels_estimate", sa.Integer()),
        sa.Column("geom", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("tehsil_id", "lgd_code", name="uq_village_tehsil_lgd"),
    )
    op.create_index("ix_villages_tehsil_id", "villages", ["tehsil_id"])
    op.create_index("ix_villages_lgd_code", "villages", ["lgd_code"])
    op.create_index("ix_villages_name", "villages", ["name_en"])
    op.create_index("ix_villages_created_at", "villages", ["created_at"])
    op.execute("CREATE INDEX IF NOT EXISTS ix_villages_name_trgm ON villages USING gin (name_en gin_trgm_ops)")

    op.create_table(
        "area_unit_conversions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("unit", sa.String(32), nullable=False),
        sa.Column("state_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("states.id", ondelete="CASCADE")),
        sa.Column("district_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("districts.id", ondelete="CASCADE")),
        sa.Column("sq_metres", sa.Float(), nullable=False),
        sa.Column("note", sa.String(256)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("unit", "state_id", "district_id", name="uq_area_unit_scope"),
    )
    op.create_index("ix_area_unit_conversions_unit", "area_unit_conversions", ["unit"])
    op.create_index("ix_area_unit_conversions_created_at", "area_unit_conversions", ["created_at"])

    # ------------------------------------------------------------------ #
    # Identity                                                             #
    # ------------------------------------------------------------------ #
    op.create_table(
        "roles",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("key", sa.String(48), nullable=False, unique=True),
        sa.Column("name_en", sa.String(128), nullable=False),
        sa.Column("name_hi", sa.String(128)),
        sa.Column("description", sa.Text()),
        sa.Column("permissions", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("is_system", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_roles_key", "roles", ["key"])
    op.create_index("ix_roles_created_at", "roles", ["created_at"])

    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("username", sa.String(64), nullable=False, unique=True),
        sa.Column("employee_code", sa.String(48)),
        sa.Column("full_name", sa.String(160), nullable=False),
        sa.Column("full_name_local", sa.String(160)),
        sa.Column("designation", sa.String(128)),
        sa.Column("email", sa.String(160)),
        sa.Column("phone", sa.String(24)),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("must_change_password", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("failed_login_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("locked_until", sa.DateTime(timezone=True)),
        sa.Column("last_login_at", sa.DateTime(timezone=True)),
        sa.Column("last_login_ip", sa.String(64)),
        sa.Column("mfa_enabled", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("mfa_secret", sa.String(64)),
        sa.Column("preferred_locale", sa.String(8), nullable=False, server_default="'en'"),
        sa.Column("ui_preferences", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_users_username", "users", ["username"])
    op.create_index("ix_users_employee_code", "users", ["employee_code"])
    op.create_index("ix_users_email", "users", ["email"])
    op.create_index("ix_users_created_at", "users", ["created_at"])

    op.create_table(
        "user_roles",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("role_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("granted_by", postgresql.UUID(as_uuid=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_user_roles_created_at", "user_roles", ["created_at"])

    op.create_table(
        "user_jurisdictions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("level", sa.String(16), nullable=False),
        sa.Column("ref_id", postgresql.UUID(as_uuid=True)),
        sa.Column("label", sa.String(160)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("user_id", "level", "ref_id", name="uq_user_jurisdiction"),
    )
    op.create_index("ix_user_jurisdictions_user_id", "user_jurisdictions", ["user_id"])
    op.create_index("ix_user_jurisdictions_created_at", "user_jurisdictions", ["created_at"])

    op.create_table(
        "refresh_tokens",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("jti", sa.String(64), nullable=False, unique=True),
        sa.Column("family_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True)),
        sa.Column("user_agent", sa.String(255)),
        sa.Column("ip_address", sa.String(64)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_refresh_tokens_user_id", "refresh_tokens", ["user_id"])
    op.create_index("ix_refresh_tokens_jti", "refresh_tokens", ["jti"])
    op.create_index("ix_refresh_tokens_family_id", "refresh_tokens", ["family_id"])
    op.create_index("ix_refresh_tokens_created_at", "refresh_tokens", ["created_at"])

    op.create_table(
        "api_clients",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(160), nullable=False),
        sa.Column("organisation", sa.String(160)),
        sa.Column("contact_email", sa.String(160)),
        sa.Column("api_key_hash", sa.String(255), nullable=False),
        sa.Column("key_prefix", sa.String(16), nullable=False),
        sa.Column("scopes", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("rate_limit_per_minute", sa.Integer(), nullable=False, server_default="60"),
        sa.Column("allowed_ips", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("is_enabled", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("last_used_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_api_clients_key_prefix", "api_clients", ["key_prefix"])
    op.create_index("ix_api_clients_created_at", "api_clients", ["created_at"])

    # ------------------------------------------------------------------ #
    # Batches & documents                                                  #
    # ------------------------------------------------------------------ #
    op.create_table(
        "batches",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("reference_no", sa.String(64)),
        sa.Column("state_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("states.id")),
        sa.Column("district_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("districts.id")),
        sa.Column("tehsil_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tehsils.id")),
        sa.Column("village_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("villages.id")),
        sa.Column("record_year", sa.Integer()),
        sa.Column("document_type", sa.String(40)),
        sa.Column("source_office", sa.String(200)),
        sa.Column("language_hint", sa.String(8)),
        sa.Column("notes", sa.Text()),
        sa.Column("total_documents", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("processed_documents", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("failed_documents", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_pages", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("status", sa.String(24), nullable=False, server_default="'OPEN'"),
        sa.Column("uploaded_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id")),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_batches_reference_no", "batches", ["reference_no"])
    op.create_index("ix_batches_state_id", "batches", ["state_id"])
    op.create_index("ix_batches_district_id", "batches", ["district_id"])
    op.create_index("ix_batches_tehsil_id", "batches", ["tehsil_id"])
    op.create_index("ix_batches_village_id", "batches", ["village_id"])
    op.create_index("ix_batches_status", "batches", ["status"])
    op.create_index("ix_batches_created_at", "batches", ["created_at"])

    op.create_table(
        "documents",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("batch_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("batches.id", ondelete="SET NULL")),
        sa.Column("original_filename", sa.String(400), nullable=False),
        sa.Column("content_sha256", sa.String(64), nullable=False),
        sa.Column("mime_type", sa.String(120), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("storage_key", sa.String(500), nullable=False),
        sa.Column("page_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("document_type", sa.String(40), nullable=False, server_default="'UNKNOWN'"),
        sa.Column("document_type_confidence", sa.Float()),
        sa.Column("detected_languages", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("quality_score", sa.Integer()),
        sa.Column("quality_issues", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("state_id", postgresql.UUID(as_uuid=True)),
        sa.Column("district_id", postgresql.UUID(as_uuid=True)),
        sa.Column("tehsil_id", postgresql.UUID(as_uuid=True)),
        sa.Column("village_id", postgresql.UUID(as_uuid=True)),
        sa.Column("status", sa.String(24), nullable=False, server_default="'UPLOADED'"),
        sa.Column("current_stage", sa.String(24)),
        sa.Column("error_code", sa.String(64)),
        sa.Column("error_message", sa.Text()),
        sa.Column("retry_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_duplicate_of", postgresql.UUID(as_uuid=True)),
        sa.Column("uploaded_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id")),
        sa.Column("processing_started_at", sa.DateTime(timezone=True)),
        sa.Column("processing_finished_at", sa.DateTime(timezone=True)),
        sa.Column("model_versions", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_documents_batch_id", "documents", ["batch_id"])
    op.create_index("ix_documents_content_sha256", "documents", ["content_sha256"])
    op.create_index("ix_documents_state_id", "documents", ["state_id"])
    op.create_index("ix_documents_district_id", "documents", ["district_id"])
    op.create_index("ix_documents_tehsil_id", "documents", ["tehsil_id"])
    op.create_index("ix_documents_village_id", "documents", ["village_id"])
    op.create_index("ix_documents_status", "documents", ["status"])
    op.create_index("ix_documents_status_created", "documents", ["status", "created_at"])
    op.create_index("ix_documents_hash", "documents", ["content_sha256"])
    op.create_index("ix_documents_created_at", "documents", ["created_at"])

    op.create_table(
        "document_pages",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("document_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("documents.id", ondelete="CASCADE"), nullable=False),
        sa.Column("page_no", sa.Integer(), nullable=False),
        sa.Column("storage_key_raw", sa.String(500), nullable=False),
        sa.Column("storage_key_clean", sa.String(500)),
        sa.Column("storage_key_thumb", sa.String(500)),
        sa.Column("width", sa.Integer()),
        sa.Column("height", sa.Integer()),
        sa.Column("dpi", sa.Integer()),
        sa.Column("skew_angle", sa.Float()),
        sa.Column("rotation_applied", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("quality_score", sa.Integer()),
        sa.Column("quality_issues", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("blur_score", sa.Float()),
        sa.Column("contrast_score", sa.Float()),
        sa.Column("ink_coverage", sa.Float()),
        sa.Column("detected_script", sa.String(24)),
        sa.Column("has_handwriting", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("is_map_page", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("document_id", "page_no", name="uq_page_no"),
    )
    op.create_index("ix_document_pages_document_id", "document_pages", ["document_id"])
    op.create_index("ix_document_pages_created_at", "document_pages", ["created_at"])

    op.create_table(
        "page_regions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("page_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("document_pages.id", ondelete="CASCADE"), nullable=False),
        sa.Column("parent_region_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("page_regions.id", ondelete="CASCADE")),
        sa.Column("region_type", sa.String(32), nullable=False),
        sa.Column("bbox", postgresql.JSONB(), nullable=False),
        sa.Column("polygon", postgresql.JSONB()),
        sa.Column("confidence", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column("row_index", sa.Integer()),
        sa.Column("col_index", sa.Integer()),
        sa.Column("reading_order", sa.Integer()),
        sa.Column("model_version", sa.String(64)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_page_regions_page_id", "page_regions", ["page_id"])
    op.create_index("ix_page_regions_region_type", "page_regions", ["region_type"])
    op.create_index("ix_page_regions_created_at", "page_regions", ["created_at"])

    op.create_table(
        "ocr_spans",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("page_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("document_pages.id", ondelete="CASCADE"), nullable=False),
        sa.Column("region_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("page_regions.id", ondelete="CASCADE")),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("text_normalized", sa.Text()),
        sa.Column("script", sa.String(24)),
        sa.Column("language", sa.String(8)),
        sa.Column("bbox", postgresql.JSONB(), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column("raw_confidence", sa.Float()),
        sa.Column("engine", sa.String(32)),
        sa.Column("is_handwritten", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("alternatives", postgresql.JSONB()),
        sa.Column("reading_order", sa.Integer()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_ocr_spans_page_id", "ocr_spans", ["page_id"])
    op.create_index("ix_ocr_spans_region_id", "ocr_spans", ["region_id"])
    op.create_index("ix_spans_page_conf", "ocr_spans", ["page_id", "confidence"])
    op.create_index("ix_ocr_spans_created_at", "ocr_spans", ["created_at"])

    # ------------------------------------------------------------------ #
    # Land records                                                         #
    # ------------------------------------------------------------------ #
    op.create_table(
        "land_records",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("document_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("documents.id", ondelete="CASCADE"), nullable=False),
        sa.Column("page_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("document_pages.id", ondelete="SET NULL")),
        sa.Column("batch_id", postgresql.UUID(as_uuid=True)),
        sa.Column("state_id", postgresql.UUID(as_uuid=True)),
        sa.Column("district_id", postgresql.UUID(as_uuid=True)),
        sa.Column("tehsil_id", postgresql.UUID(as_uuid=True)),
        sa.Column("village_id", postgresql.UUID(as_uuid=True)),
        sa.Column("survey_number", sa.String(64)),
        sa.Column("khasra_number", sa.String(64)),
        sa.Column("khata_number", sa.String(64)),
        sa.Column("plot_number", sa.String(64)),
        sa.Column("sub_division", sa.String(64)),
        sa.Column("owner_name", sa.String(300)),
        sa.Column("owner_name_roman", sa.String(300)),
        sa.Column("father_or_husband_name", sa.String(300)),
        sa.Column("father_or_husband_name_roman", sa.String(300)),
        sa.Column("owner_share", sa.Numeric(10, 6)),
        sa.Column("owner_category", sa.String(24)),
        sa.Column("plot_area_original", sa.Numeric(16, 4)),
        sa.Column("area_unit_original", sa.String(24)),
        sa.Column("plot_area_sqm", sa.Numeric(16, 2)),
        sa.Column("land_classification", sa.String(32)),
        sa.Column("soil_type", sa.String(64)),
        sa.Column("irrigation_source", sa.String(64)),
        sa.Column("mutation_number", sa.String(64)),
        sa.Column("mutation_date", sa.Date()),
        sa.Column("registration_number", sa.String(64)),
        sa.Column("registration_date", sa.Date()),
        sa.Column("encumbrance", sa.Text()),
        sa.Column("tenancy_rights", sa.Text()),
        sa.Column("revenue_assessment", sa.Numeric(14, 2)),
        sa.Column("document_type", sa.String(40)),
        sa.Column("record_year", sa.Integer()),
        sa.Column("source_language", sa.String(8)),
        sa.Column("confidence_overall", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column("confidence_min_mandatory", sa.Float()),
        sa.Column("verification_status", sa.String(24), nullable=False, server_default="'PENDING_REVIEW'"),
        sa.Column("validation_status", sa.String(16)),
        sa.Column("blocking_failures", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("parcel_id", postgresql.UUID(as_uuid=True)),
        sa.Column("map_sheet_ref", sa.String(120)),
        sa.Column("area_delta_pct", sa.Float()),
        sa.Column("extracted_at", sa.DateTime(timezone=True)),
        sa.Column("verified_at", sa.DateTime(timezone=True)),
        sa.Column("verified_by", postgresql.UUID(as_uuid=True)),
        sa.Column("published_at", sa.DateTime(timezone=True)),
        sa.Column("rejection_reason", sa.Text()),
        sa.Column("model_version", sa.String(120)),
        sa.Column("correction_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_land_records_document_id", "land_records", ["document_id"])
    op.create_index("ix_land_records_batch_id", "land_records", ["batch_id"])
    op.create_index("ix_land_records_state_id", "land_records", ["state_id"])
    op.create_index("ix_land_records_district_id", "land_records", ["district_id"])
    op.create_index("ix_land_records_tehsil_id", "land_records", ["tehsil_id"])
    op.create_index("ix_land_records_village_id", "land_records", ["village_id"])
    op.create_index("ix_land_records_survey_number", "land_records", ["survey_number"])
    op.create_index("ix_land_records_khasra_number", "land_records", ["khasra_number"])
    op.create_index("ix_land_records_khata_number", "land_records", ["khata_number"])
    op.create_index("ix_land_records_mutation_number", "land_records", ["mutation_number"])
    op.create_index("ix_land_records_owner_name", "land_records", ["owner_name"])
    op.create_index("ix_land_records_plot_area_sqm", "land_records", ["plot_area_sqm"])
    op.create_index("ix_land_records_land_classification", "land_records", ["land_classification"])
    op.create_index("ix_land_records_document_type", "land_records", ["document_type"])
    op.create_index("ix_land_records_record_year", "land_records", ["record_year"])
    op.create_index("ix_land_records_source_language", "land_records", ["source_language"])
    op.create_index("ix_land_records_confidence_overall", "land_records", ["confidence_overall"])
    op.create_index("ix_land_records_verification_status", "land_records", ["verification_status"])
    op.create_index("ix_land_records_validation_status", "land_records", ["validation_status"])
    op.create_index("ix_land_records_parcel_id", "land_records", ["parcel_id"])
    op.create_index("ix_land_records_created_at", "land_records", ["created_at"])
    op.create_index("ix_records_status_conf", "land_records", ["verification_status", "confidence_overall"])
    op.create_index("ix_records_survey", "land_records", ["village_id", "survey_number"])
    op.execute("CREATE INDEX IF NOT EXISTS ix_records_owner_trgm ON land_records USING gin (owner_name gin_trgm_ops)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_records_owner_roman_trgm ON land_records USING gin (owner_name_roman gin_trgm_ops)")

    op.create_table(
        "record_fields",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("record_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("land_records.id", ondelete="CASCADE"), nullable=False),
        sa.Column("field_name", sa.String(64), nullable=False),
        sa.Column("value_text", sa.Text()),
        sa.Column("value_normalized", sa.Text()),
        sa.Column("value_roman", sa.Text()),
        sa.Column("confidence", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column("confidence_breakdown", postgresql.JSONB()),
        sa.Column("source", sa.String(16)),
        sa.Column("engine", sa.String(32)),
        sa.Column("page_no", sa.Integer()),
        sa.Column("bbox", postgresql.JSONB()),
        sa.Column("span_ids", postgresql.JSONB()),
        sa.Column("alternatives", postgresql.JSONB()),
        sa.Column("is_mandatory", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("is_corrected", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("original_value", sa.Text()),
        sa.Column("corrected_by", postgresql.UUID(as_uuid=True)),
        sa.Column("flag", sa.String(32)),
        sa.Column("note", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_record_fields_record_id", "record_fields", ["record_id"])
    op.create_index("ix_record_fields_record_name", "record_fields", ["record_id", "field_name"], unique=True)
    op.create_index("ix_record_fields_low_conf", "record_fields", ["record_id", "confidence"])
    op.create_index("ix_record_fields_created_at", "record_fields", ["created_at"])

    op.create_table(
        "co_owners",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("record_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("land_records.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(300), nullable=False),
        sa.Column("name_roman", sa.String(300)),
        sa.Column("relation", sa.String(64)),
        sa.Column("relation_name", sa.String(300)),
        sa.Column("share", sa.Numeric(10, 6)),
        sa.Column("share_text", sa.String(64)),
        sa.Column("confidence", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column("bbox", postgresql.JSONB()),
        sa.Column("sequence", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_co_owners_record_id", "co_owners", ["record_id"])
    op.create_index("ix_co_owners_created_at", "co_owners", ["created_at"])

    # ------------------------------------------------------------------ #
    # Validation                                                           #
    # ------------------------------------------------------------------ #
    op.create_table(
        "validation_rules",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("rule_key", sa.String(64), nullable=False, unique=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("category", sa.String(32), nullable=False),
        sa.Column("description_en", sa.Text()),
        sa.Column("description_hi", sa.Text()),
        sa.Column("severity", sa.String(16), nullable=False),
        sa.Column("applies_to_document_types", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("applies_to_states", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("requires_fields", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("expression", sa.Text(), nullable=False),
        sa.Column("params", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("message_en", sa.Text()),
        sa.Column("message_hi", sa.Text()),
        sa.Column("fix_hint", sa.Text()),
        sa.Column("is_enabled", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("execution_order", sa.Integer(), nullable=False, server_default="100"),
        sa.Column("created_by", postgresql.UUID(as_uuid=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_validation_rules_rule_key", "validation_rules", ["rule_key"])
    op.create_index("ix_validation_rules_category", "validation_rules", ["category"])
    op.create_index("ix_validation_rules_severity", "validation_rules", ["severity"])
    op.create_index("ix_validation_rules_is_enabled", "validation_rules", ["is_enabled"])
    op.create_index("ix_validation_rules_created_at", "validation_rules", ["created_at"])

    op.create_table(
        "validation_results",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("record_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("land_records.id", ondelete="CASCADE"), nullable=False),
        sa.Column("rule_key", sa.String(64), nullable=False),
        sa.Column("rule_version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("severity", sa.String(16), nullable=False),
        sa.Column("message", sa.Text()),
        sa.Column("fix_hint", sa.Text()),
        sa.Column("observed", postgresql.JSONB()),
        sa.Column("affected_fields", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("resolved_at", sa.DateTime(timezone=True)),
        sa.Column("resolved_by", postgresql.UUID(as_uuid=True)),
        sa.Column("resolution_note", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_validation_results_record_id", "validation_results", ["record_id"])
    op.create_index("ix_validation_results_rule_key", "validation_results", ["rule_key"])
    op.create_index("ix_validation_results_status", "validation_results", ["status"])
    op.create_index("ix_validation_record_status", "validation_results", ["record_id", "status"])
    op.create_index("ix_validation_rule_status", "validation_results", ["rule_key", "status"])
    op.create_index("ix_validation_results_created_at", "validation_results", ["created_at"])

    op.create_table(
        "duplicate_clusters",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("cluster_key", sa.String(200), nullable=False),
        sa.Column("match_type", sa.String(24), nullable=False),
        sa.Column("score", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column("signals", postgresql.JSONB()),
        sa.Column("status", sa.String(24), nullable=False, server_default="'OPEN'"),
        sa.Column("resolution", sa.String(24)),
        sa.Column("primary_record_id", postgresql.UUID(as_uuid=True)),
        sa.Column("resolved_by", postgresql.UUID(as_uuid=True)),
        sa.Column("resolved_at", sa.DateTime(timezone=True)),
        sa.Column("resolution_note", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_duplicate_clusters_cluster_key", "duplicate_clusters", ["cluster_key"])
    op.create_index("ix_duplicate_clusters_status", "duplicate_clusters", ["status"])
    op.create_index("ix_duplicate_clusters_created_at", "duplicate_clusters", ["created_at"])

    op.create_table(
        "duplicate_members",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("cluster_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("duplicate_clusters.id", ondelete="CASCADE"), nullable=False),
        sa.Column("record_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("land_records.id", ondelete="CASCADE"), nullable=False),
        sa.Column("is_primary", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("similarity", sa.Float()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_duplicate_members_cluster_id", "duplicate_members", ["cluster_id"])
    op.create_index("ix_duplicate_members_record_id", "duplicate_members", ["record_id"])
    op.create_index("ix_duplicate_members_created_at", "duplicate_members", ["created_at"])

    # ------------------------------------------------------------------ #
    # Review                                                               #
    # ------------------------------------------------------------------ #
    op.create_table(
        "review_queue",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("record_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("land_records.id", ondelete="CASCADE"), nullable=False),
        sa.Column("document_id", postgresql.UUID(as_uuid=True)),
        sa.Column("batch_id", postgresql.UUID(as_uuid=True)),
        sa.Column("state_id", postgresql.UUID(as_uuid=True)),
        sa.Column("district_id", postgresql.UUID(as_uuid=True)),
        sa.Column("tehsil_id", postgresql.UUID(as_uuid=True)),
        sa.Column("village_id", postgresql.UUID(as_uuid=True)),
        sa.Column("queue_type", sa.String(24), nullable=False, server_default="'STANDARD'"),
        sa.Column("priority", sa.Integer(), nullable=False, server_default="50"),
        sa.Column("reason", sa.String(200)),
        sa.Column("low_confidence_fields", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("confidence_overall", sa.Float()),
        sa.Column("status", sa.String(16), nullable=False, server_default="'OPEN'"),
        sa.Column("assigned_to", postgresql.UUID(as_uuid=True)),
        sa.Column("locked_by", postgresql.UUID(as_uuid=True)),
        sa.Column("locked_until", sa.DateTime(timezone=True)),
        sa.Column("sla_due_at", sa.DateTime(timezone=True)),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        sa.Column("completed_by", postgresql.UUID(as_uuid=True)),
        sa.Column("handling_seconds", sa.Integer()),
        sa.Column("requires_second_approval", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("first_approver", postgresql.UUID(as_uuid=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_review_queue_record_id", "review_queue", ["record_id"])
    op.create_index("ix_review_queue_document_id", "review_queue", ["document_id"])
    op.create_index("ix_review_queue_batch_id", "review_queue", ["batch_id"])
    op.create_index("ix_review_queue_state_id", "review_queue", ["state_id"])
    op.create_index("ix_review_queue_district_id", "review_queue", ["district_id"])
    op.create_index("ix_review_queue_tehsil_id", "review_queue", ["tehsil_id"])
    op.create_index("ix_review_queue_village_id", "review_queue", ["village_id"])
    op.create_index("ix_review_queue_queue_type", "review_queue", ["queue_type"])
    op.create_index("ix_review_queue_priority", "review_queue", ["priority"])
    op.create_index("ix_review_queue_status", "review_queue", ["status"])
    op.create_index("ix_review_queue_assigned_to", "review_queue", ["assigned_to"])
    op.create_index("ix_review_queue_sla_due_at", "review_queue", ["sla_due_at"])
    op.create_index("ix_review_queue_created_at", "review_queue", ["created_at"])
    op.create_index("ix_queue_pick", "review_queue", ["status", "queue_type", "priority", "created_at"])
    op.create_index("ix_queue_assignee", "review_queue", ["assigned_to", "status"])
    op.create_index("ix_queue_sla", "review_queue", ["status", "sla_due_at"])

    op.create_table(
        "review_actions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("record_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("land_records.id", ondelete="CASCADE"), nullable=False),
        sa.Column("queue_item_id", postgresql.UUID(as_uuid=True)),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("action", sa.String(32), nullable=False),
        sa.Column("field_name", sa.String(64)),
        sa.Column("old_value", sa.Text()),
        sa.Column("new_value", sa.Text()),
        sa.Column("comment", sa.Text()),
        sa.Column("reason_code", sa.String(48)),
        sa.Column("duration_ms", sa.Integer()),
        sa.Column("client_meta", postgresql.JSONB()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_review_actions_record_id", "review_actions", ["record_id"])
    op.create_index("ix_review_actions_user_id", "review_actions", ["user_id"])
    op.create_index("ix_review_actions_action", "review_actions", ["action"])
    op.create_index("ix_review_actions_created_at", "review_actions", ["created_at"])
    op.create_index("ix_review_actions_record", "review_actions", ["record_id", "created_at"])
    op.create_index("ix_review_actions_user", "review_actions", ["user_id", "created_at"])

    # ------------------------------------------------------------------ #
    # Cadastral mapping                                                    #
    # ------------------------------------------------------------------ #
    op.create_table(
        "parcels",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("village_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("villages.id", ondelete="SET NULL")),
        sa.Column("tehsil_id", postgresql.UUID(as_uuid=True)),
        sa.Column("district_id", postgresql.UUID(as_uuid=True)),
        sa.Column("state_id", postgresql.UUID(as_uuid=True)),
        sa.Column("survey_number", sa.String(64)),
        sa.Column("khasra_number", sa.String(64)),
        sa.Column("sub_division", sa.String(64)),
        sa.Column("geom", sa.Text(), nullable=False),   # geometry(MULTIPOLYGON,4326)
        sa.Column("centroid", sa.Text()),                # geometry(POINT,4326)
        sa.Column("area_sqm", sa.Numeric(16, 2)),
        sa.Column("perimeter_m", sa.Numeric(16, 2)),
        sa.Column("source", sa.String(32), nullable=False, server_default="'IMPORT'"),
        sa.Column("map_sheet_id", postgresql.UUID(as_uuid=True)),
        sa.Column("map_sheet_ref", sa.String(120)),
        sa.Column("label_confidence", sa.Float()),
        sa.Column("is_validated", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("topology_issues", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("land_classification", sa.String(32)),
        sa.Column("notes", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_parcels_village_id", "parcels", ["village_id"])
    op.create_index("ix_parcels_survey_number", "parcels", ["survey_number"])
    op.create_index("ix_parcels_khasra_number", "parcels", ["khasra_number"])
    op.create_index("ix_parcels_is_validated", "parcels", ["is_validated"])
    op.create_index("ix_parcels_created_at", "parcels", ["created_at"])
    op.create_index("ix_parcels_village_survey", "parcels", ["village_id", "survey_number"])
    op.execute("SELECT AddGeometryColumn('parcels','geom_col',4326,'MULTIPOLYGON',2) WHERE FALSE")
    op.execute("CREATE INDEX IF NOT EXISTS ix_parcels_geom ON parcels USING gist (geom::geometry)")

    op.create_table(
        "map_sheets",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("village_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("villages.id", ondelete="SET NULL")),
        sa.Column("document_id", postgresql.UUID(as_uuid=True)),
        sa.Column("page_id", postgresql.UUID(as_uuid=True)),
        sa.Column("sheet_ref", sa.String(120)),
        sa.Column("storage_key", sa.String(500), nullable=False),
        sa.Column("storage_key_warped", sa.String(500)),
        sa.Column("scale_denominator", sa.Integer()),
        sa.Column("ground_control_points", postgresql.JSONB()),
        sa.Column("transform", postgresql.JSONB()),
        sa.Column("transform_type", sa.String(24)),
        sa.Column("srid", sa.Integer()),
        sa.Column("rms_error_m", sa.Float()),
        sa.Column("bounds", sa.Text()),            # geometry(POLYGON,4326)
        sa.Column("status", sa.String(24), nullable=False, server_default="'UPLOADED'"),
        sa.Column("parcels_extracted", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("georeferenced_by", postgresql.UUID(as_uuid=True)),
        sa.Column("georeferenced_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_map_sheets_village_id", "map_sheets", ["village_id"])
    op.create_index("ix_map_sheets_document_id", "map_sheets", ["document_id"])
    op.create_index("ix_map_sheets_sheet_ref", "map_sheets", ["sheet_ref"])
    op.create_index("ix_map_sheets_status", "map_sheets", ["status"])
    op.create_index("ix_map_sheets_created_at", "map_sheets", ["created_at"])

    op.create_table(
        "parcel_record_links",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("parcel_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("parcels.id", ondelete="CASCADE"), nullable=False),
        sa.Column("record_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("land_records.id", ondelete="CASCADE"), nullable=False),
        sa.Column("match_type", sa.String(24), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column("area_delta_pct", sa.Float()),
        sa.Column("linked_by", postgresql.UUID(as_uuid=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_parcel_record_links_parcel_id", "parcel_record_links", ["parcel_id"])
    op.create_index("ix_parcel_record_links_record_id", "parcel_record_links", ["record_id"])
    op.create_index("ix_link_parcel_record", "parcel_record_links", ["parcel_id", "record_id"], unique=True)
    op.create_index("ix_parcel_record_links_created_at", "parcel_record_links", ["created_at"])

    # ------------------------------------------------------------------ #
    # Governance — audit, integrations, sync, learning, notifications      #
    # ------------------------------------------------------------------ #
    op.create_table(
        "audit_log",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("actor_id", postgresql.UUID(as_uuid=True)),
        sa.Column("actor_username", sa.String(64)),
        sa.Column("actor_ip", sa.String(64)),
        sa.Column("actor_roles", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("entity_type", sa.String(48), nullable=False),
        sa.Column("entity_id", sa.String(64)),
        sa.Column("action", sa.String(32), nullable=False),
        sa.Column("payload", postgresql.JSONB()),
        sa.Column("payload_hash", sa.String(64), nullable=False),
        sa.Column("prev_hash", sa.String(64)),
        sa.Column("chain_hash", sa.String(64), nullable=False),
        sa.Column("request_id", sa.String(64)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_audit_log_actor_id", "audit_log", ["actor_id"])
    op.create_index("ix_audit_log_entity_type", "audit_log", ["entity_type"])
    op.create_index("ix_audit_log_entity_id", "audit_log", ["entity_id"])
    op.create_index("ix_audit_log_action", "audit_log", ["action"])
    op.create_index("ix_audit_log_chain_hash", "audit_log", ["chain_hash"])
    op.create_index("ix_audit_log_request_id", "audit_log", ["request_id"])
    op.create_index("ix_audit_log_created_at", "audit_log", ["created_at"])
    op.create_index("ix_audit_entity", "audit_log", ["entity_type", "entity_id", "created_at"])
    op.create_index("ix_audit_actor", "audit_log", ["actor_id", "created_at"])

    op.create_table(
        "document_access_log",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("document_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("record_id", postgresql.UUID(as_uuid=True)),
        sa.Column("user_id", postgresql.UUID(as_uuid=True)),
        sa.Column("api_client_id", postgresql.UUID(as_uuid=True)),
        sa.Column("ip_address", sa.String(64)),
        sa.Column("action", sa.String(24), nullable=False),
        sa.Column("purpose", sa.String(200)),
        sa.Column("user_agent", sa.String(300)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_document_access_log_document_id", "document_access_log", ["document_id"])
    op.create_index("ix_document_access_log_record_id", "document_access_log", ["record_id"])
    op.create_index("ix_document_access_log_user_id", "document_access_log", ["user_id"])
    op.create_index("ix_document_access_log_created_at", "document_access_log", ["created_at"])
    op.create_index("ix_access_doc_time", "document_access_log", ["document_id", "created_at"])

    op.create_table(
        "integrations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("key", sa.String(48), nullable=False, unique=True),
        sa.Column("name", sa.String(160), nullable=False),
        sa.Column("kind", sa.String(32), nullable=False),
        sa.Column("base_url", sa.String(400)),
        sa.Column("auth_config", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("field_mapping", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("is_enabled", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("health_status", sa.String(16)),
        sa.Column("last_health_check", sa.DateTime(timezone=True)),
        sa.Column("circuit_open_until", sa.DateTime(timezone=True)),
        sa.Column("success_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("failure_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_integrations_key", "integrations", ["key"])
    op.create_index("ix_integrations_is_enabled", "integrations", ["is_enabled"])
    op.create_index("ix_integrations_created_at", "integrations", ["created_at"])

    op.create_table(
        "sync_jobs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("integration_key", sa.String(48), nullable=False),
        sa.Column("record_id", postgresql.UUID(as_uuid=True)),
        sa.Column("document_id", postgresql.UUID(as_uuid=True)),
        sa.Column("direction", sa.String(16), nullable=False),
        sa.Column("idempotency_key", sa.String(80), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="'PENDING'"),
        sa.Column("external_id", sa.String(120)),
        sa.Column("request_payload", postgresql.JSONB()),
        sa.Column("response_payload", postgresql.JSONB()),
        sa.Column("http_status", sa.Integer()),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("max_attempts", sa.Integer(), nullable=False, server_default="5"),
        sa.Column("next_attempt_at", sa.DateTime(timezone=True)),
        sa.Column("error", sa.Text()),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_sync_jobs_integration_key", "sync_jobs", ["integration_key"])
    op.create_index("ix_sync_jobs_record_id", "sync_jobs", ["record_id"])
    op.create_index("ix_sync_jobs_idempotency_key", "sync_jobs", ["idempotency_key"])
    op.create_index("ix_sync_jobs_status", "sync_jobs", ["status"])
    op.create_index("ix_sync_jobs_created_at", "sync_jobs", ["created_at"])
    op.create_index("ix_sync_pending", "sync_jobs", ["status", "next_attempt_at"])
    op.create_index("ix_sync_record", "sync_jobs", ["record_id", "integration_key"])

    op.create_table(
        "webhooks",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("client_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("api_clients.id", ondelete="CASCADE")),
        sa.Column("url", sa.String(500), nullable=False),
        sa.Column("events", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("secret", sa.String(120), nullable=False),
        sa.Column("is_enabled", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("failure_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_delivery_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_webhooks_client_id", "webhooks", ["client_id"])
    op.create_index("ix_webhooks_created_at", "webhooks", ["created_at"])

    op.create_table(
        "learning_corrections",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("record_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("page_id", postgresql.UUID(as_uuid=True)),
        sa.Column("field_name", sa.String(64), nullable=False),
        sa.Column("ai_value", sa.Text()),
        sa.Column("human_value", sa.Text()),
        sa.Column("ai_confidence", sa.Float()),
        sa.Column("bbox", postgresql.JSONB()),
        sa.Column("crop_storage_key", sa.String(500)),
        sa.Column("script", sa.String(24)),
        sa.Column("language", sa.String(8)),
        sa.Column("is_handwritten", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("document_type", sa.String(40)),
        sa.Column("district_id", postgresql.UUID(as_uuid=True)),
        sa.Column("model_version", sa.String(120)),
        sa.Column("corrected_by", postgresql.UUID(as_uuid=True)),
        sa.Column("used_in_training_run", sa.String(64)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_learning_corrections_record_id", "learning_corrections", ["record_id"])
    op.create_index("ix_learning_corrections_field_name", "learning_corrections", ["field_name"])
    op.create_index("ix_learning_corrections_language", "learning_corrections", ["language"])
    op.create_index("ix_learning_corrections_document_type", "learning_corrections", ["document_type"])
    op.create_index("ix_learning_corrections_district_id", "learning_corrections", ["district_id"])
    op.create_index("ix_learning_corrections_used_in_training_run", "learning_corrections", ["used_in_training_run"])
    op.create_index("ix_learning_corrections_created_at", "learning_corrections", ["created_at"])
    op.create_index("ix_corrections_training", "learning_corrections", ["used_in_training_run", "created_at"])
    op.create_index("ix_corrections_field_lang", "learning_corrections", ["field_name", "language"])

    op.create_table(
        "model_versions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("model_key", sa.String(48), nullable=False),
        sa.Column("version", sa.String(32), nullable=False),
        sa.Column("artifact_uri", sa.String(500)),
        sa.Column("base_model", sa.String(160)),
        sa.Column("metrics", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("training_examples", sa.Integer()),
        sa.Column("training_run_id", sa.String(64)),
        sa.Column("golden_set_version", sa.String(32)),
        sa.Column("status", sa.String(16), nullable=False, server_default="'TRAINED'"),
        sa.Column("traffic_pct", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("trained_at", sa.DateTime(timezone=True)),
        sa.Column("promoted_at", sa.DateTime(timezone=True)),
        sa.Column("promoted_by", postgresql.UUID(as_uuid=True)),
        sa.Column("notes", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_model_versions_model_key", "model_versions", ["model_key"])
    op.create_index("ix_model_versions_status", "model_versions", ["status"])
    op.create_index("ix_model_versions_created_at", "model_versions", ["created_at"])
    op.create_index("ix_model_key_version", "model_versions", ["model_key", "version"], unique=True)

    op.create_table(
        "notifications",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("kind", sa.String(48), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("body", sa.Text()),
        sa.Column("link", sa.String(500)),
        sa.Column("severity", sa.String(16), nullable=False, server_default="'INFO'"),
        sa.Column("read_at", sa.DateTime(timezone=True)),
        sa.Column("channels_sent", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_notifications_user_id", "notifications", ["user_id"])
    op.create_index("ix_notifications_kind", "notifications", ["kind"])
    op.create_index("ix_notifications_read_at", "notifications", ["read_at"])
    op.create_index("ix_notifications_created_at", "notifications", ["created_at"])
    op.create_index("ix_notif_user_unread", "notifications", ["user_id", "read_at"])


def downgrade() -> None:
    # Drop in reverse FK order
    op.drop_table("notifications")
    op.drop_table("model_versions")
    op.drop_table("learning_corrections")
    op.drop_table("webhooks")
    op.drop_table("sync_jobs")
    op.drop_table("integrations")
    op.drop_table("document_access_log")
    op.drop_table("audit_log")
    op.drop_table("parcel_record_links")
    op.drop_table("map_sheets")
    op.drop_table("parcels")
    op.drop_table("review_actions")
    op.drop_table("review_queue")
    op.drop_table("duplicate_members")
    op.drop_table("duplicate_clusters")
    op.drop_table("validation_results")
    op.drop_table("validation_rules")
    op.drop_table("co_owners")
    op.drop_table("record_fields")
    op.drop_table("land_records")
    op.drop_table("ocr_spans")
    op.drop_table("page_regions")
    op.drop_table("document_pages")
    op.drop_table("documents")
    op.drop_table("batches")
    op.drop_table("api_clients")
    op.drop_table("refresh_tokens")
    op.drop_table("user_jurisdictions")
    op.drop_table("user_roles")
    op.drop_table("users")
    op.drop_table("roles")
    op.drop_table("area_unit_conversions")
    op.drop_table("villages")
    op.drop_table("tehsils")
    op.drop_table("districts")
    op.drop_table("states")
