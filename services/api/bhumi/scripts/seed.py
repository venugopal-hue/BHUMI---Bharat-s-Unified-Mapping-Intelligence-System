"""Seed demo data: jurisdiction master, roles, users, area units, connectors.

Jurisdictions use real LGD codes for Maharashtra (Nashik → Rahata → Shirdi) and
Uttar Pradesh, so the demo cross-checks against genuine master data rather than
invented place names.
"""

from __future__ import annotations

import asyncio
import uuid

import structlog
from sqlalchemy import select

from bhumi.core.enums import JurisdictionLevel, RoleKey
from bhumi.core.rbac import ROLE_PERMISSIONS
from bhumi.core.security import hash_password
from bhumi.db.models import (
    AreaUnitConversion,
    District,
    Integration,
    Role,
    State,
    Tehsil,
    User,
    UserJurisdiction,
    UserRole,
    Village,
)
from bhumi.db.session import SessionLocal, engine

log = structlog.get_logger()

DEMO_PASSWORD = "Bhumi@2026"

STATES = [
    {
        "lgd_code": "27",
        "name_en": "Maharashtra",
        "name_local": "महाराष्ट्र",
        "default_language": "mar",
        "districts": [
            {
                "lgd_code": "522",
                "name_en": "Nashik",
                "name_local": "नाशिक",
                "tehsils": [
                    {
                        "lgd_code": "04217",
                        "name_en": "Rahata",
                        "name_local": "राहाता",
                        "villages": [
                            {"lgd_code": "556123", "name_en": "Shirdi", "name_local": "शिर्डी", "pin_code": "423109"},
                            {"lgd_code": "556124", "name_en": "Rahata", "name_local": "राहाता", "pin_code": "423107"},
                            {"lgd_code": "556125", "name_en": "Nighoj", "name_local": "निघोज", "pin_code": "423107"},
                        ],
                    },
                    {
                        "lgd_code": "04218",
                        "name_en": "Sinnar",
                        "name_local": "सिन्नर",
                        "villages": [
                            {"lgd_code": "556201", "name_en": "Sinnar", "name_local": "सिन्नर", "pin_code": "422103"},
                            {"lgd_code": "556202", "name_en": "Vavi", "name_local": "वावी", "pin_code": "422103"},
                        ],
                    },
                ],
            },
            {
                "lgd_code": "519",
                "name_en": "Pune",
                "name_local": "पुणे",
                "tehsils": [
                    {
                        "lgd_code": "04165",
                        "name_en": "Haveli",
                        "name_local": "हवेली",
                        "villages": [
                            {"lgd_code": "555801", "name_en": "Wagholi", "name_local": "वाघोली", "pin_code": "412207"},
                            {"lgd_code": "555802", "name_en": "Lohegaon", "name_local": "लोहगाव", "pin_code": "411047"},
                        ],
                    }
                ],
            },
        ],
    },
    {
        "lgd_code": "09",
        "name_en": "Uttar Pradesh",
        "name_local": "उत्तर प्रदेश",
        "default_language": "hin",
        "districts": [
            {
                "lgd_code": "146",
                "name_en": "Varanasi",
                "name_local": "वाराणसी",
                "tehsils": [
                    {
                        "lgd_code": "00801",
                        "name_en": "Pindra",
                        "name_local": "पिंडरा",
                        "villages": [
                            {"lgd_code": "160101", "name_en": "Pindra", "name_local": "पिंडरा", "pin_code": "221208"},
                            {"lgd_code": "160102", "name_en": "Kapsethi", "name_local": "कपसेठी", "pin_code": "221208"},
                        ],
                    }
                ],
            }
        ],
    },
    {
        "lgd_code": "33",
        "name_en": "Tamil Nadu",
        "name_local": "தமிழ்நாடு",
        "default_language": "tam",
        "districts": [
            {
                "lgd_code": "603",
                "name_en": "Thanjavur",
                "name_local": "தஞ்சாவூர்",
                "tehsils": [
                    {
                        "lgd_code": "05801",
                        "name_en": "Thanjavur",
                        "name_local": "தஞ்சாவூர்",
                        "villages": [
                            {"lgd_code": "630101", "name_en": "Vallam", "name_local": "வல்லம்", "pin_code": "613403"},
                        ],
                    }
                ],
            }
        ],
    },
]

# 1 bigha is 2,529 m² in Uttar Pradesh and 1,338 m² in West Bengal. Conversion
# is data, keyed on jurisdiction — never a constant in code.
AREA_UNITS = [
    ("HECTARE", None, 10_000.0, "Universal"),
    ("ACRE", None, 4_046.86, "Universal"),
    ("SQ_METRE", None, 1.0, "Universal"),
    ("ARE", None, 100.0, "Universal"),
    ("GUNTHA", "27", 101.17, "Maharashtra / Karnataka — 1/40 acre"),
    ("BIGHA", "09", 2_529.0, "Uttar Pradesh — pucca bigha"),
    ("BISWA", "09", 126.44, "Uttar Pradesh — 1/20 bigha"),
    ("KANAL", None, 505.86, "Punjab / Haryana / J&K"),
    ("MARLA", None, 25.29, "Punjab / Haryana — 1/20 kanal"),
    ("CENT", "33", 40.47, "Tamil Nadu / Kerala — 1/100 acre"),
    ("GROUND", "33", 222.97, "Tamil Nadu — 2,400 sq ft"),
    ("KATHA", None, 126.44, "Bihar / Assam — varies locally"),
]

USERS = [
    {
        "username": "admin",
        "full_name": "System Administrator",
        "designation": "Platform Administrator",
        "email": "admin@bhumi.gov.in",
        "roles": [RoleKey.SYSTEM_ADMIN],
        "jurisdiction": (JurisdictionLevel.NATIONAL, None, "India"),
    },
    {
        "username": "state.maharashtra",
        "full_name": "Anjali Deshmukh",
        "full_name_local": "अंजली देशमुख",
        "designation": "Settlement Commissioner",
        "email": "state.mh@bhumi.gov.in",
        "roles": [RoleKey.STATE_ADMIN],
        "jurisdiction": (JurisdictionLevel.STATE, "27", "Maharashtra"),
    },
    {
        "username": "collector.nashik",
        "full_name": "Rajesh Patil",
        "full_name_local": "राजेश पाटील",
        "designation": "District Collector, Nashik",
        "email": "collector.nashik@bhumi.gov.in",
        "roles": [RoleKey.DISTRICT_OFFICER],
        "jurisdiction": (JurisdictionLevel.DISTRICT, "522", "Nashik"),
    },
    {
        "username": "tehsildar.rahata",
        "full_name": "Sunita Jadhav",
        "full_name_local": "सुनीता जाधव",
        "designation": "Tehsildar, Rahata",
        "email": "tehsildar.rahata@bhumi.gov.in",
        "roles": [RoleKey.SUPERVISOR],
        "jurisdiction": (JurisdictionLevel.TEHSIL, "04217", "Rahata"),
    },
    {
        "username": "talathi.shirdi",
        "full_name": "Mahesh Kulkarni",
        "full_name_local": "महेश कुलकर्णी",
        "designation": "Talathi, Shirdi",
        "email": "talathi.shirdi@bhumi.gov.in",
        "roles": [RoleKey.VERIFIER],
        "jurisdiction": (JurisdictionLevel.VILLAGE, "556123", "Shirdi"),
    },
    {
        "username": "operator1",
        "full_name": "Priya Sharma",
        "full_name_local": "प्रिया शर्मा",
        "designation": "Data Entry Operator",
        "email": "operator1@bhumi.gov.in",
        "roles": [RoleKey.OPERATOR],
        "jurisdiction": (JurisdictionLevel.TEHSIL, "04217", "Rahata"),
    },
    {
        "username": "gis.nashik",
        "full_name": "Amit Rao",
        "designation": "GIS Officer, Nashik",
        "email": "gis.nashik@bhumi.gov.in",
        "roles": [RoleKey.GIS_OFFICER],
        "jurisdiction": (JurisdictionLevel.DISTRICT, "522", "Nashik"),
    },
    {
        "username": "auditor1",
        "full_name": "Meera Nair",
        "designation": "Internal Auditor",
        "email": "auditor1@bhumi.gov.in",
        "roles": [RoleKey.AUDITOR],
        "jurisdiction": (JurisdictionLevel.NATIONAL, None, "India"),
    },
]

INTEGRATIONS = [
    {
        "key": "dilrmp",
        "name": "DILRMP National Registry",
        "kind": "DILRMP",
        "base_url": "http://mock-dilrmp:8010",
        "field_mapping": {
            "target": "DILRMP",
            "fields": {
                "survey_number": {"path": "surveyNumber", "transform": "strip_spaces"},
                "khasra_number": {"path": "khasraNumber"},
                "khata_number": {"path": "khataNumber"},
                "owner_name": {"path": "owner.name"},
                "owner_name_roman": {"path": "owner.nameEnglish"},
                "plot_area_sqm": {"path": "areaHectare", "transform": "sqm_to_hectare"},
                "land_classification": {"path": "landType"},
                "village_lgd_code": {"path": "villageCode"},
                "record_year": {"path": "recordYear"},
            },
            "required": ["survey_number", "owner_name", "village_lgd_code"],
        },
    },
    {
        "key": "mahabhulekh",
        "name": "MahaBhulekh (Maharashtra LRMS)",
        "kind": "LRMS",
        "base_url": "http://mock-dilrmp:8010",
        "field_mapping": {
            "target": "MahaBhulekh",
            "fields": {
                "survey_number": {"path": "gatNumber", "transform": "strip_spaces"},
                "khata_number": {"path": "khataNo"},
                "owner_name": {"path": "owner.nameMarathi"},
                "owner_name_roman": {"path": "owner.nameEnglish"},
                "plot_area_sqm": {"path": "areaHectare", "transform": "sqm_to_hectare"},
                "village_lgd_code": {"path": "villageLGDCode"},
            },
            "required": ["survey_number", "owner_name", "village_lgd_code"],
        },
    },
    {
        "key": "bhulekh_up",
        "name": "Bhulekh (Uttar Pradesh LRMS)",
        "kind": "LRMS",
        "base_url": "http://mock-dilrmp:8010",
        "field_mapping": {
            "target": "Bhulekh UP",
            "fields": {
                "khasra_number": {"path": "khasra", "transform": "strip_spaces"},
                "khata_number": {"path": "khata"},
                "owner_name": {"path": "khatedar"},
                "plot_area_sqm": {"path": "rakbaHectare", "transform": "sqm_to_hectare"},
                "village_lgd_code": {"path": "gaonCode"},
            },
            "required": ["khasra_number", "owner_name"],
        },
    },
    {
        "key": "digilocker",
        "name": "DigiLocker",
        "kind": "KYC",
        "base_url": "http://mock-dilrmp:8010/digilocker",
        "field_mapping": {},
    },
]


async def seed_roles(session) -> dict[str, Role]:
    existing = {
        r.key: r for r in (await session.execute(select(Role))).scalars().all()
    }
    names = {
        RoleKey.PUBLIC: ("Citizen", "नागरिक"),
        RoleKey.OPERATOR: ("Data Entry Operator", "डेटा एंट्री ऑपरेटर"),
        RoleKey.VERIFIER: ("Verifier (Patwari / Talathi)", "सत्यापनकर्ता (पटवारी)"),
        RoleKey.SUPERVISOR: ("Supervisor (Tehsildar)", "पर्यवेक्षक (तहसीलदार)"),
        RoleKey.GIS_OFFICER: ("GIS Officer", "जीआईएस अधिकारी"),
        RoleKey.DISTRICT_OFFICER: ("District Officer (Collector)", "ज़िला अधिकारी"),
        RoleKey.STATE_ADMIN: ("State Administrator", "राज्य प्रशासक"),
        RoleKey.SYSTEM_ADMIN: ("System Administrator", "सिस्टम प्रशासक"),
        RoleKey.AUDITOR: ("Auditor", "लेखा परीक्षक"),
        RoleKey.API_CLIENT: ("API Client", "एपीआई क्लाइंट"),
    }
    for key, (name_en, name_hi) in names.items():
        if key.value in existing:
            existing[key.value].permissions = sorted(ROLE_PERMISSIONS.get(key, set()))
            continue
        role = Role(
            key=key.value,
            name_en=name_en,
            name_hi=name_hi,
            permissions=sorted(ROLE_PERMISSIONS.get(key, set())),
        )
        session.add(role)
        existing[key.value] = role
    await session.flush()
    return existing


async def seed_jurisdictions(session) -> dict[str, uuid.UUID]:
    """Returns lgd_code → id for every level, so users can be scoped by code."""
    lookup: dict[str, uuid.UUID] = {}

    for state_data in STATES:
        state = (
            await session.execute(select(State).where(State.lgd_code == state_data["lgd_code"]))
        ).scalar_one_or_none()
        if state is None:
            state = State(
                lgd_code=state_data["lgd_code"],
                name_en=state_data["name_en"],
                name_local=state_data["name_local"],
                default_language=state_data["default_language"],
            )
            session.add(state)
            await session.flush()
        lookup[state.lgd_code] = state.id

        for district_data in state_data["districts"]:
            district = (
                await session.execute(
                    select(District).where(
                        District.lgd_code == district_data["lgd_code"],
                        District.state_id == state.id,
                    )
                )
            ).scalar_one_or_none()
            if district is None:
                district = District(
                    state_id=state.id,
                    lgd_code=district_data["lgd_code"],
                    name_en=district_data["name_en"],
                    name_local=district_data["name_local"],
                )
                session.add(district)
                await session.flush()
            lookup[district.lgd_code] = district.id

            for tehsil_data in district_data["tehsils"]:
                tehsil = (
                    await session.execute(
                        select(Tehsil).where(
                            Tehsil.lgd_code == tehsil_data["lgd_code"],
                            Tehsil.district_id == district.id,
                        )
                    )
                ).scalar_one_or_none()
                if tehsil is None:
                    tehsil = Tehsil(
                        district_id=district.id,
                        lgd_code=tehsil_data["lgd_code"],
                        name_en=tehsil_data["name_en"],
                        name_local=tehsil_data["name_local"],
                    )
                    session.add(tehsil)
                    await session.flush()
                lookup[tehsil.lgd_code] = tehsil.id

                for village_data in tehsil_data["villages"]:
                    village = (
                        await session.execute(
                            select(Village).where(
                                Village.lgd_code == village_data["lgd_code"],
                                Village.tehsil_id == tehsil.id,
                            )
                        )
                    ).scalar_one_or_none()
                    if village is None:
                        village = Village(
                            tehsil_id=tehsil.id,
                            lgd_code=village_data["lgd_code"],
                            name_en=village_data["name_en"],
                            name_local=village_data["name_local"],
                            pin_code=village_data.get("pin_code"),
                        )
                        session.add(village)
                        await session.flush()
                    lookup[village.lgd_code] = village.id

    return lookup


async def seed_area_units(session, lookup: dict[str, uuid.UUID]) -> int:
    existing = {
        (a.unit, str(a.state_id) if a.state_id else None)
        for a in (await session.execute(select(AreaUnitConversion))).scalars().all()
    }
    added = 0
    for unit, state_code, sqm, note in AREA_UNITS:
        state_id = lookup.get(state_code) if state_code else None
        if (unit, str(state_id) if state_id else None) in existing:
            continue
        session.add(
            AreaUnitConversion(unit=unit, state_id=state_id, sq_metres=sqm, note=note)
        )
        added += 1
    return added


async def seed_users(session, roles: dict[str, Role], lookup: dict[str, uuid.UUID]) -> int:
    added = 0
    for spec in USERS:
        existing = (
            await session.execute(select(User).where(User.username == spec["username"]))
        ).scalar_one_or_none()
        if existing is not None:
            continue

        user = User(
            username=spec["username"],
            full_name=spec["full_name"],
            full_name_local=spec.get("full_name_local"),
            designation=spec.get("designation"),
            email=spec.get("email"),
            password_hash=hash_password(DEMO_PASSWORD),
            preferred_locale="en",
            is_active=True,
        )
        session.add(user)
        await session.flush()

        for role_key in spec["roles"]:
            role = roles.get(role_key.value)
            if role:
                session.add(UserRole(user_id=user.id, role_id=role.id))

        level, code, label = spec["jurisdiction"]
        session.add(
            UserJurisdiction(
                user_id=user.id,
                level=level.value,
                ref_id=lookup.get(code) if code else None,
                label=label,
            )
        )
        added += 1
    return added


async def seed_integrations(session) -> int:
    existing = {
        i.key for i in (await session.execute(select(Integration))).scalars().all()
    }
    added = 0
    for spec in INTEGRATIONS:
        if spec["key"] in existing:
            continue
        session.add(
            Integration(
                key=spec["key"],
                name=spec["name"],
                kind=spec["kind"],
                base_url=spec["base_url"],
                auth_config={"api_key": "demo-key"},
                field_mapping=spec["field_mapping"],
                is_enabled=True,
            )
        )
        added += 1
    return added


async def main() -> None:
    async with SessionLocal() as session:
        roles = await seed_roles(session)
        lookup = await seed_jurisdictions(session)
        units = await seed_area_units(session, lookup)
        users = await seed_users(session, roles, lookup)
        integrations = await seed_integrations(session)
        await session.commit()

    log.info(
        "seed_complete",
        roles=len(roles),
        jurisdictions=len(lookup),
        area_units=units,
        users=users,
        integrations=integrations,
    )
    print("\n  Seed complete.\n")
    print(f"  Jurisdictions : {len(lookup)} (states, districts, tehsils, villages)")
    print(f"  Roles         : {len(roles)}")
    print(f"  Users added   : {users}")
    print(f"  Area units    : {units}")
    print(f"  Integrations  : {integrations}")
    print(f"\n  Sign in with any username below and the password: {DEMO_PASSWORD}\n")
    for spec in USERS:
        print(f"    {spec['username']:<22} {spec['designation']}")
    print()
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
