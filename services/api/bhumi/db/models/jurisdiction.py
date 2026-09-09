"""Administrative hierarchy, sourced from the Local Government Directory (LGD).

State → District → Tehsil → Village. LGD codes are the authoritative keys that
let BHUMI cross-check extracted place names and integrate with other government
systems without name-matching guesswork.
"""

from __future__ import annotations

import uuid

from geoalchemy2 import Geometry
from sqlalchemy import ForeignKey, Index, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from bhumi.db.base import Base, TimestampMixin, UUIDMixin


class State(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "states"

    lgd_code: Mapped[str] = mapped_column(String(16), unique=True, index=True)
    name_en: Mapped[str] = mapped_column(String(128), index=True)
    name_local: Mapped[str | None] = mapped_column(String(128))
    iso_code: Mapped[str | None] = mapped_column(String(8))
    default_language: Mapped[str | None] = mapped_column(String(8))
    geom: Mapped[object | None] = mapped_column(
        Geometry("MULTIPOLYGON", srid=4326, spatial_index=True)
    )

    districts: Mapped[list["District"]] = relationship(back_populates="state")


class District(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "districts"
    __table_args__ = (
        UniqueConstraint("state_id", "lgd_code", name="uq_district_state_lgd"),
        Index("ix_districts_name", "name_en"),
    )

    state_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("states.id", ondelete="CASCADE"), index=True
    )
    lgd_code: Mapped[str] = mapped_column(String(16), index=True)
    name_en: Mapped[str] = mapped_column(String(128))
    name_local: Mapped[str | None] = mapped_column(String(128))
    geom: Mapped[object | None] = mapped_column(
        Geometry("MULTIPOLYGON", srid=4326, spatial_index=True)
    )

    state: Mapped[State] = relationship(back_populates="districts")
    tehsils: Mapped[list["Tehsil"]] = relationship(back_populates="district")


class Tehsil(Base, UUIDMixin, TimestampMixin):
    """Tehsil / Taluk / Mandal / Block — the sub-district revenue unit."""

    __tablename__ = "tehsils"
    __table_args__ = (
        UniqueConstraint("district_id", "lgd_code", name="uq_tehsil_district_lgd"),
        Index("ix_tehsils_name", "name_en"),
    )

    district_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("districts.id", ondelete="CASCADE"), index=True
    )
    lgd_code: Mapped[str] = mapped_column(String(16), index=True)
    name_en: Mapped[str] = mapped_column(String(128))
    name_local: Mapped[str | None] = mapped_column(String(128))
    geom: Mapped[object | None] = mapped_column(
        Geometry("MULTIPOLYGON", srid=4326, spatial_index=True)
    )

    district: Mapped[District] = relationship(back_populates="tehsils")
    villages: Mapped[list["Village"]] = relationship(back_populates="tehsil")


class Village(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "villages"
    __table_args__ = (
        UniqueConstraint("tehsil_id", "lgd_code", name="uq_village_tehsil_lgd"),
        Index("ix_villages_name", "name_en"),
        Index("ix_villages_name_trgm", "name_en", postgresql_using="gin",
              postgresql_ops={"name_en": "gin_trgm_ops"}),
    )

    tehsil_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("tehsils.id", ondelete="CASCADE"), index=True
    )
    lgd_code: Mapped[str] = mapped_column(String(16), index=True)
    name_en: Mapped[str] = mapped_column(String(128))
    name_local: Mapped[str | None] = mapped_column(String(128))
    hadbast_no: Mapped[str | None] = mapped_column(String(32))
    patwari_halka: Mapped[str | None] = mapped_column(String(64))
    pin_code: Mapped[str | None] = mapped_column(String(8))
    total_parcels_estimate: Mapped[int | None] = mapped_column(Integer)
    geom: Mapped[object | None] = mapped_column(
        Geometry("MULTIPOLYGON", srid=4326, spatial_index=True)
    )

    tehsil: Mapped[Tehsil] = relationship(back_populates="villages")


class AreaUnitConversion(Base, UUIDMixin, TimestampMixin):
    """Local area units vary by district — 1 bigha is 1,337 m² in West Bengal and
    2,529 m² in Uttar Pradesh. Conversion is data, never a hard-coded constant.
    """

    __tablename__ = "area_unit_conversions"
    __table_args__ = (
        UniqueConstraint("unit", "state_id", "district_id", name="uq_area_unit_scope"),
    )

    unit: Mapped[str] = mapped_column(String(32), index=True)
    state_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("states.id", ondelete="CASCADE")
    )
    district_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("districts.id", ondelete="CASCADE")
    )
    sq_metres: Mapped[float] = mapped_column()
    note: Mapped[str | None] = mapped_column(String(256))
