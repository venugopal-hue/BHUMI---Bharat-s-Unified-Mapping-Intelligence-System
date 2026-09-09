"""The canonical 24-field land record schema.

One definition, consumed by the extractor, the validator, the Review console
form, and the integration field-mapping files. Adding a field here makes it
appear everywhere.
"""

from __future__ import annotations

FIELD_GROUPS: dict[str, dict] = {
    "identity": {
        "label": "Parcel Identity",
        "label_hi": "भूखंड पहचान",
        "fields": [
            "survey_number",
            "khasra_number",
            "khata_number",
            "plot_number",
            "sub_division",
        ],
    },
    "owner": {
        "label": "Ownership",
        "label_hi": "स्वामित्व",
        "fields": [
            "owner_name",
            "father_or_husband_name",
            "owner_share",
            "owner_category",
        ],
    },
    "location": {
        "label": "Location",
        "label_hi": "स्थान",
        "fields": ["village", "patwari_halka", "tehsil", "district", "state", "pin_code"],
    },
    "land": {
        "label": "Land Details",
        "label_hi": "भूमि विवरण",
        "fields": [
            "plot_area",
            "area_unit",
            "land_classification",
            "soil_type",
            "irrigation_source",
        ],
    },
    "legal": {
        "label": "Legal & Revenue",
        "label_hi": "विधिक एवं राजस्व",
        "fields": [
            "mutation_number",
            "mutation_date",
            "registration_number",
            "registration_date",
            "encumbrance",
            "tenancy_rights",
            "revenue_assessment",
        ],
    },
    "meta": {
        "label": "Document Metadata",
        "label_hi": "दस्तावेज़ मेटाडेटा",
        "fields": ["document_type", "record_year", "source_language"],
    },
}

# Without these a record cannot identify a parcel or its owner, so they gate
# straight-through processing regardless of the overall average.
MANDATORY_FIELDS: set[str] = {
    "survey_number",
    "owner_name",
    "village",
    "district",
    "plot_area",
}

FIELD_LABELS: dict[str, tuple[str, str]] = {
    "survey_number": ("Survey Number", "सर्वे नंबर"),
    "khasra_number": ("Khasra Number", "खसरा नंबर"),
    "khata_number": ("Khata Number", "खाता नंबर"),
    "plot_number": ("Plot Number", "प्लॉट नंबर"),
    "sub_division": ("Sub-division", "उप-विभाग"),
    "owner_name": ("Owner Name", "स्वामी का नाम"),
    "father_or_husband_name": ("Father / Husband Name", "पिता / पति का नाम"),
    "owner_share": ("Share", "हिस्सा"),
    "owner_category": ("Owner Category", "स्वामी श्रेणी"),
    "village": ("Village", "गाँव"),
    "patwari_halka": ("Patwari Halka", "पटवारी हल्का"),
    "tehsil": ("Tehsil", "तहसील"),
    "district": ("District", "ज़िला"),
    "state": ("State", "राज्य"),
    "pin_code": ("PIN Code", "पिन कोड"),
    "plot_area": ("Area", "क्षेत्रफल"),
    "area_unit": ("Unit", "इकाई"),
    "land_classification": ("Land Classification", "भूमि वर्गीकरण"),
    "soil_type": ("Soil Type", "मृदा प्रकार"),
    "irrigation_source": ("Irrigation Source", "सिंचाई स्रोत"),
    "mutation_number": ("Mutation Number", "नामांतरण संख्या"),
    "mutation_date": ("Mutation Date", "नामांतरण दिनांक"),
    "registration_number": ("Registration Number", "पंजीकरण संख्या"),
    "registration_date": ("Registration Date", "पंजीकरण दिनांक"),
    "encumbrance": ("Encumbrance", "भार"),
    "tenancy_rights": ("Tenancy Rights", "कृषक अधिकार"),
    "revenue_assessment": ("Revenue Assessment", "राजस्व निर्धारण"),
    "document_type": ("Document Type", "दस्तावेज़ प्रकार"),
    "record_year": ("Record Year", "अभिलेख वर्ष"),
    "source_language": ("Source Language", "स्रोत भाषा"),
}

ALL_FIELDS: list[str] = [f for g in FIELD_GROUPS.values() for f in g["fields"]]


def field_label(name: str, locale: str = "en") -> str:
    labels = FIELD_LABELS.get(name)
    if not labels:
        return name.replace("_", " ").title()
    return labels[1] if locale == "hi" else labels[0]


def group_of(field_name: str) -> str | None:
    for key, group in FIELD_GROUPS.items():
        if field_name in group["fields"]:
            return key
    return None
