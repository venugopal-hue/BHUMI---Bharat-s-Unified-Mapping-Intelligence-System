"""Normalization: units, dates, numerals and names.

Every value in an Indian land record is written a dozen different ways. This
module turns all of them into one canonical form while keeping the original
text, because the original is what the verifier compares against the scan.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date
from typing import Any

# ── Area units ──────────────────────────────────────────────────────
# The default square-metre value for each unit. Values that vary by region are
# overridden per district from the area_unit_conversions table — a bigha in
# Uttar Pradesh is nearly twice a bigha in West Bengal.
UNIT_TO_SQM: dict[str, float] = {
    "sq_metre": 1.0,
    "hectare": 10_000.0,
    "are": 100.0,
    "acre": 4_046.86,
    "bigha": 2_529.0,
    "biswa": 126.44,
    "guntha": 101.17,
    "kanal": 505.86,
    "marla": 25.29,
    "cent": 40.47,
    "ground": 222.97,
    "katha": 126.44,
}

UNIT_ALIASES: dict[str, str] = {
    "ha": "hectare", "hect": "hectare", "hectare": "hectare", "hectares": "hectare",
    "हे": "hectare", "हेक्टर": "hectare", "हेक्टेयर": "hectare",
    "ac": "acre", "acre": "acre", "acres": "acre", "एकड़": "acre", "एकर": "acre",
    "bigha": "bigha", "बीघा": "bigha", "बिघा": "bigha",
    "biswa": "biswa", "बिस्वा": "biswa",
    "guntha": "guntha", "gunta": "guntha", "गुंठा": "guntha", "आर": "are",
    "kanal": "kanal", "कनाल": "kanal",
    "marla": "marla", "मरला": "marla",
    "cent": "cent", "cents": "cent", "சென்ட்": "cent",
    "ground": "ground", "கிரவுண்ட்": "ground",
    "katha": "katha", "kattha": "katha", "कट्ठा": "katha",
    "sqm": "sq_metre", "sq.m": "sq_metre", "m2": "sq_metre",
    "square metre": "sq_metre", "square meter": "sq_metre", "चौरस मीटर": "sq_metre",
    "are": "are", "आरे": "are",
}


@dataclass(slots=True)
class Area:
    original_value: float
    original_unit: str
    sqm: float
    unit_factor: float
    confidence: float = 1.0

    @property
    def hectares(self) -> float:
        return round(self.sqm / 10_000, 4)

    @property
    def acres(self) -> float:
        return round(self.sqm / 4046.86, 4)


AREA_PATTERN = re.compile(
    r"(?P<value>\d{1,7}(?:[.,]\d{1,4})?)\s*"
    r"(?P<unit>hectares?|ha\b|acres?|ac\b|bigha|biswa|guntha|gunta|kanal|marla|"
    r"cents?|ground|katha|kattha|sq\.?\s*m|sqm|m2|"
    r"हेक्टर|हेक्टेयर|हे\b|एकड़|एकर|बीघा|बिघा|बिस्वा|गुंठा|कनाल|मरला|कट्ठा|आर)",
    re.IGNORECASE | re.UNICODE,
)


def canonical_unit(raw: str | None) -> str | None:
    if not raw:
        return None
    key = raw.strip().lower().rstrip(".")
    return UNIT_ALIASES.get(key) or (key if key in UNIT_TO_SQM else None)


def parse_area(
    text: str, *, unit_overrides: dict[str, float] | None = None
) -> Area | None:
    """Parse "1.42 हेक्टर" or "2 acre 30 guntha" into square metres.

    Composite areas ("2 acre 30 guntha") are the norm in Maharashtra records, so
    every match in the string is summed rather than taking only the first.
    """
    if not text:
        return None

    overrides = unit_overrides or {}
    matches = list(AREA_PATTERN.finditer(text))
    if not matches:
        return None

    total_sqm = 0.0
    first_value: float | None = None
    first_unit: str | None = None

    for match in matches:
        try:
            value = float(match.group("value").replace(",", ""))
        except ValueError:
            continue
        unit = canonical_unit(match.group("unit"))
        if unit is None:
            continue

        factor = overrides.get(unit, UNIT_TO_SQM[unit])
        total_sqm += value * factor
        if first_value is None:
            first_value, first_unit = value, unit

    if first_value is None or first_unit is None or total_sqm <= 0:
        return None

    factor = overrides.get(first_unit, UNIT_TO_SQM[first_unit])
    return Area(
        original_value=first_value,
        original_unit=first_unit,
        sqm=round(total_sqm, 2),
        unit_factor=factor,
        confidence=1.0 if len(matches) == 1 else 0.9,
    )


# ── Dates ───────────────────────────────────────────────────────────
# Revenue records date events in Gregorian, Vikram Samvat, Fasli and Saka. The
# offsets below are approximate by design: they are used to flag an implausible
# year, never to assert an exact day.
ERA_OFFSETS = {"VS": -57, "FASLI": 590, "SAKA": 78}

DATE_PATTERNS = [
    re.compile(r"\b(?P<d>\d{1,2})[-/.](?P<m>\d{1,2})[-/.](?P<y>\d{4})\b"),
    re.compile(r"\b(?P<y>\d{4})[-/.](?P<m>\d{1,2})[-/.](?P<d>\d{1,2})\b"),
    re.compile(r"\b(?P<d>\d{1,2})[-/.](?P<m>\d{1,2})[-/.](?P<y>\d{2})\b"),
]


def parse_date(text: str, *, era: str | None = None) -> date | None:
    if not text:
        return None
    from ml.vision.ocr import normalize_digits

    cleaned = normalize_digits(str(text)).strip()

    for pattern in DATE_PATTERNS:
        match = pattern.search(cleaned)
        if not match:
            continue
        try:
            day, month, year = (
                int(match.group("d")),
                int(match.group("m")),
                int(match.group("y")),
            )
        except (ValueError, IndexError):
            continue

        if year < 100:
            year += 2000 if year <= 30 else 1900
        if era and era.upper() in ERA_OFFSETS:
            year += ERA_OFFSETS[era.upper()]
        if not (1800 <= year <= date.today().year + 1):
            continue
        if not (1 <= month <= 12 and 1 <= day <= 31):
            continue

        try:
            return date(year, month, day)
        except ValueError:
            continue

    try:
        from dateutil import parser

        parsed = parser.parse(cleaned, dayfirst=True, fuzzy=True).date()
        return parsed if 1800 <= parsed.year <= date.today().year + 1 else None
    except Exception:
        return None


def parse_year(text: str) -> int | None:
    """Record years appear as 2019, 2019-20, or २०१९."""
    if not text:
        return None
    from ml.vision.ocr import normalize_digits

    match = re.search(r"\b(1[89]\d{2}|20\d{2})\b", normalize_digits(str(text)))
    if not match:
        return None
    year = int(match.group(1))
    return year if 1800 <= year <= date.today().year else None


# ── Names ───────────────────────────────────────────────────────────
HONORIFICS = [
    "shri", "sri", "smt", "shrimati", "kumari", "km", "mr", "mrs", "ms", "dr",
    "श्री", "श्रीमती", "कुमारी", "सौ", "स्व", "थिरु", "திரு", "శ్రీ",
]

RELATION_MARKERS = {
    "s/o": "son_of", "so": "son_of", "पुत्र": "son_of", "बिन": "son_of",
    "w/o": "wife_of", "wo": "wife_of", "पत्नी": "wife_of", "बेवा": "widow_of",
    "d/o": "daughter_of", "do": "daughter_of", "पुत्री": "daughter_of",
    "c/o": "care_of", "वल्द": "son_of",
}

RELATION_PATTERN = re.compile(
    r"\b(s/o|w/o|d/o|c/o|so|wo|do|पुत्र|पुत्री|पत्नी|बिन|वल्द|बेवा)\b[\s.:-]*",
    re.IGNORECASE | re.UNICODE,
)


@dataclass(slots=True)
class ParsedName:
    name: str
    relation: str | None = None
    relation_name: str | None = None
    honorific: str | None = None


def clean_name(text: str) -> str:
    """Strip OCR noise without mangling a genuine name."""
    if not text:
        return ""
    cleaned = re.sub(r"[^\w\s./-]", " ", str(text), flags=re.UNICODE)
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" .,-")
    return cleaned


def parse_owner_name(text: str) -> ParsedName:
    """Split "श्री रामचंद्र गोविंद पाटील बिन गोविंद" into its parts.

    Relation markers matter: without splitting them, the father's name ends up
    inside the owner's name and every duplicate check against it fails.
    """
    cleaned = clean_name(text)
    if not cleaned:
        return ParsedName(name="")

    honorific = None
    lowered = cleaned.lower()
    for title in HONORIFICS:
        if lowered.startswith(title + " ") or lowered.startswith(title + "."):
            honorific = title
            cleaned = cleaned[len(title) :].lstrip(" .")
            break

    match = RELATION_PATTERN.search(cleaned)
    if match:
        marker = match.group(1).lower()
        owner = cleaned[: match.start()].strip()
        relative = cleaned[match.end() :].strip()
        return ParsedName(
            name=owner,
            relation=RELATION_MARKERS.get(marker, "related_to"),
            relation_name=relative or None,
            honorific=honorific,
        )

    return ParsedName(name=cleaned, honorific=honorific)


def transliterate(text: str, source_script: str = "devanagari") -> str | None:
    """Native script → roman, so search works whichever way a name is typed.

    Falls back to None rather than a wrong guess — a bad transliteration in the
    search index is worse than no transliteration.
    """
    if not text:
        return None
    try:
        from indicnlp.transliterate.unicode_transliterate import ItransTransliterator

        code = {
            "devanagari": "hi", "bengali": "bn", "tamil": "ta", "telugu": "te",
            "kannada": "kn", "malayalam": "ml", "gujarati": "gu",
            "gurmukhi": "pa", "odia": "or",
        }.get(source_script)
        if code is None:
            return None
        return ItransTransliterator.to_itrans(text, code).title()
    except Exception:
        return None


# ── Shares ──────────────────────────────────────────────────────────
FRACTION_PATTERN = re.compile(r"(\d{1,4})\s*/\s*(\d{1,4})")


def parse_share(text: str) -> tuple[float | None, str | None]:
    """Shares appear as "1/3", "0.333", "33%" or "एक तृतीयांश"."""
    if not text:
        return None, None
    from ml.vision.ocr import normalize_digits

    cleaned = normalize_digits(str(text)).strip()

    match = FRACTION_PATTERN.search(cleaned)
    if match:
        numerator, denominator = int(match.group(1)), int(match.group(2))
        if denominator:
            return round(numerator / denominator, 6), f"{numerator}/{denominator}"

    percent = re.search(r"(\d{1,3}(?:\.\d+)?)\s*%", cleaned)
    if percent:
        value = float(percent.group(1)) / 100
        return (round(value, 6), percent.group(0)) if 0 < value <= 1 else (None, None)

    decimal = re.search(r"\b0?\.\d+\b|\b1\.0+\b", cleaned)
    if decimal:
        value = float(decimal.group(0))
        return (round(value, 6), decimal.group(0)) if 0 < value <= 1 else (None, None)

    return None, None


# ── Identifiers ─────────────────────────────────────────────────────
def normalize_identifier(text: str) -> str | None:
    """Canonicalize a survey/khasra/khata number.

    Land identifiers are the fields where an OCR slip does the most damage, so
    normalization here is deliberately conservative: strip noise, keep structure.
    """
    if not text:
        return None
    from ml.vision.ocr import normalize_digits

    cleaned = normalize_digits(str(text)).upper()
    cleaned = re.sub(r"[^\dA-Z/\-]", "", cleaned)
    cleaned = re.sub(r"[/\-]{2,}", "/", cleaned).strip("/-")
    return cleaned or None


def normalize_land_class(text: str) -> str:
    if not text:
        return "UNKNOWN"
    lowered = str(text).lower()
    table = {
        "IRRIGATED": ["irrigated", "wet", "bagayat", "सिंचित", "बागायत", "नहरी", "நன்செய்"],
        "UNIRRIGATED": ["unirrigated", "dry", "jirayat", "असिंचित", "जिरायत", "बारानी", "புன்செய்"],
        "BARREN": ["barren", "banjar", "बंजर", "पडीक", "waste"],
        "FOREST": ["forest", "jungle", "वन", "जंगल"],
        "ABADI": ["abadi", "residential", "आबादी", "गावठाण", "gaothan"],
        "GOVERNMENT": ["government", "sarkari", "सरकारी", "शासकीय"],
        "WATER_BODY": ["pond", "tank", "lake", "तलाव", "तालाब"],
        "PASTURE": ["pasture", "grazing", "charai", "गायरान", "चराई"],
        "ORCHARD": ["orchard", "garden", "बाग", "फळबाग"],
        "COMMERCIAL": ["commercial", "व्यावसायिक"],
    }
    for label, keywords in table.items():
        if any(keyword in lowered for keyword in keywords):
            return label
    return "UNKNOWN"


def normalize_record(
    raw: dict[str, Any], *, unit_overrides: dict[str, float] | None = None
) -> dict[str, Any]:
    """Apply every normalizer to a raw extraction result."""
    out: dict[str, Any] = dict(raw)

    for key in ("survey_number", "khasra_number", "khata_number", "plot_number"):
        if raw.get(key):
            out[key] = normalize_identifier(raw[key])

    if raw.get("owner_name"):
        parsed = parse_owner_name(raw["owner_name"])
        out["owner_name"] = parsed.name
        out["owner_name_roman"] = transliterate(parsed.name)
        if parsed.relation_name and not raw.get("father_or_husband_name"):
            out["father_or_husband_name"] = parsed.relation_name
            out["owner_relation"] = parsed.relation

    area_source = raw.get("plot_area_text") or raw.get("plot_area")
    if area_source:
        area = parse_area(str(area_source), unit_overrides=unit_overrides)
        if area:
            out["plot_area"] = area.original_value
            out["area_unit"] = area.original_unit.upper()
            out["plot_area_sqm"] = area.sqm
            out["area_unit_factor"] = area.unit_factor

    for key in ("mutation_date", "registration_date"):
        if raw.get(key):
            parsed_date = parse_date(str(raw[key]))
            out[key] = parsed_date.isoformat() if parsed_date else None

    if raw.get("record_year"):
        out["record_year"] = parse_year(str(raw["record_year"]))

    if raw.get("land_classification"):
        out["land_classification"] = normalize_land_class(str(raw["land_classification"]))

    if raw.get("owner_share"):
        share, share_text = parse_share(str(raw["owner_share"]))
        out["owner_share"] = share
        out["owner_share_text"] = share_text

    return out
