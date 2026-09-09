"""Field extraction: OCR spans → the 24-field canonical record.

Three layers, in order of precision:

  1. Labelled patterns  — "सर्वे नं. 142/2" is unambiguous; take it.
  2. Positional rules   — in a 7/12 the parcel number is top-left; use layout.
  3. NER / LLM fallback — only for what the first two could not resolve.

Anything still unresolved is left blank with a low confidence rather than
guessed. A blank field routed to a human costs 20 seconds; a confidently wrong
survey number costs a lawsuit.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from ml.vision.ocr import clean_text, group_into_lines, line_bbox, line_text, normalize_digits

# ── Field label vocabulary (multi-script) ───────────────────────────
# Regional wording for each field. Deliberately broad: a label missed here falls
# through to positional inference, which is less precise.
FIELD_LABELS: dict[str, list[str]] = {
    "survey_number": [
        "survey no", "survey number", "s.no", "sy.no", "gat no", "gat number",
        "सर्वे नं", "सर्वे नंबर", "सर्व्हे", "गट नं", "गट क्रमांक", "भूमापन",
        "సర్వే నం", "சர்வே எண்", "ಸರ್ವೆ ನಂ",
    ],
    "khasra_number": [
        "khasra", "khasra no", "khasra number",
        "खसरा", "खसरा नं", "खसरा संख्या", "किता",
    ],
    "khata_number": [
        "khata", "khata no", "khata number", "khewat", "account no",
        "खाता", "खाता नं", "खाता संख्या", "खेवट", "खतौनी",
    ],
    "plot_number": ["plot no", "plot number", "प्लॉट नं", "भूखंड"],
    "owner_name": [
        "owner", "owner name", "khatedar", "holder", "name of holder", "pattadar",
        "स्वामी", "मालक", "खातेदार", "भूधारक", "नाम", "कब्जेदार", "अधिकार",
        "உரிமையாளர்", "యజమాని",
    ],
    "father_or_husband_name": [
        "father", "father name", "s/o", "w/o", "d/o", "husband",
        "पिता", "पिता का नाम", "वडील", "पति", "पत्नी", "बिन", "वल्द",
    ],
    "plot_area": [
        "area", "total area", "rakba", "kshetrafal", "extent",
        "क्षेत्र", "क्षेत्रफल", "रकबा", "क्षेत्रफळ", "पोट खराबा",
        "பரப்பளவு", "విస్తీర్ణం",
    ],
    "land_classification": [
        "land type", "classification", "class", "nature of land", "kism",
        "भूमि प्रकार", "जमीन प्रकार", "किस्म", "वर्गीकरण", "प्रकार",
    ],
    "village": ["village", "gram", "गाँव", "गांव", "ग्राम", "गाव", "मौजा", "mouza", "கிராமம்"],
    "tehsil": ["tehsil", "taluka", "taluk", "mandal", "तहसील", "तालुका", "तह."],
    "district": ["district", "zila", "जिला", "ज़िला", "जिल्हा", "மாவட்டம்"],
    "state": ["state", "राज्य"],
    "mutation_number": [
        "mutation", "mutation no", "intkal", "ferfar",
        "नामांतरण", "म्युटेशन", "इंतकाल", "फेरफार",
    ],
    "registration_number": [
        "registration no", "reg no", "document no", "deed no",
        "पंजीकरण", "नोंदणी", "दस्त क्रमांक",
    ],
    "record_year": ["year", "fasli", "वर्ष", "साल", "सन", "फसली"],
    "patwari_halka": ["patwari halka", "halka", "पटवारी हल्का", "हल्का"],
    "irrigation_source": [
        "irrigation", "water source", "सिंचाई", "जलस्रोत", "पाणी", "विहीर", "well",
    ],
    "soil_type": ["soil", "soil type", "मिट्टी", "मृदा", "जमीन"],
    "revenue_assessment": [
        "assessment", "land revenue", "lagan", "आकार", "लगान", "कर", "महसूल",
    ],
    "tenancy_rights": ["tenancy", "tenant", "kabjedar", "कुळ", "काश्तकार", "अधिकार"],
    "encumbrance": ["encumbrance", "charge", "lien", "बोजा", "भार", "इतर हक्क"],
    "pin_code": ["pin", "pin code", "pincode", "पिन"],
}

# Value shapes for the identifier fields, used both to find and to trust a value.
VALUE_PATTERNS: dict[str, re.Pattern] = {
    "survey_number": re.compile(r"\b(\d{1,5}(?:\s*[/\-]\s*[\dA-Za-z]{1,6}){0,3})\b"),
    "khasra_number": re.compile(r"\b(\d{1,6}(?:\s*[/\-]\s*[\dA-Za-z]{1,6})?)\b"),
    "khata_number": re.compile(r"\b([\dA-Za-z]{1,12}(?:\s*[/\-]\s*[\dA-Za-z]{1,6})?)\b"),
    "plot_number": re.compile(r"\b(\d{1,6}(?:[/\-][\dA-Za-z]{1,4})?)\b"),
    "pin_code": re.compile(r"\b([1-9]\d{5})\b"),
    "record_year": re.compile(r"\b(1[89]\d{2}|20\d{2})(?:\s*[-/]\s*\d{2,4})?\b"),
    "mutation_number": re.compile(r"\b([\dA-Za-z]{1,10}(?:[/\-][\dA-Za-z]{1,8}){0,2})\b"),
    "registration_number": re.compile(r"\b([\dA-Za-z]{1,12}(?:[/\-][\dA-Za-z]{1,8}){0,2})\b"),
}

SEPARATOR = re.compile(r"[:：\-–—=]\s*|\s{2,}")

MANDATORY = {"survey_number", "owner_name", "village", "district", "plot_area"}


@dataclass(slots=True)
class ExtractedField:
    name: str
    value: str | None
    raw_text: str | None
    confidence: float
    source: str                       # rule | layout | ner | llm | crossref
    bbox: dict[str, int] | None = None
    page_no: int = 1
    alternatives: list[str] = field(default_factory=list)
    breakdown: dict[str, float] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "field_name": self.name,
            "value_text": self.raw_text,
            "value_normalized": self.value,
            "confidence": round(self.confidence, 4),
            "confidence_breakdown": self.breakdown or None,
            "source": self.source,
            "bbox": self.bbox,
            "page_no": self.page_no,
            "alternatives": self.alternatives or None,
            "is_mandatory": self.name in MANDATORY,
        }


def _normalize_label(text: str) -> str:
    return re.sub(r"[^\w\s]", "", text.lower(), flags=re.UNICODE).strip()


def _label_match(line: str, field_name: str) -> tuple[bool, float, str]:
    """Does this line carry a label for the field, and how sure are we?

    Exact label matches earn full credit; a fuzzy match is accepted but marked
    down, which flows straight through to the field's confidence.
    """
    normalized = _normalize_label(line)
    best_score, best_label = 0.0, ""

    for label in FIELD_LABELS.get(field_name, []):
        normalized_label = _normalize_label(label)
        if not normalized_label:
            continue
        if normalized.startswith(normalized_label):
            return True, 1.0, label
        if normalized_label in normalized:
            score = 0.9
        else:
            from rapidfuzz import fuzz

            score = fuzz.partial_ratio(normalized_label, normalized) / 100
            if score < 0.82:
                continue
            score *= 0.75

        if score > best_score:
            best_score, best_label = score, label

    return (best_score > 0, best_score, best_label)


def _value_after_label(line: str, label: str) -> str:
    """Take what follows the label, whether separated by a colon or whitespace."""
    normalized_line = _normalize_label(line)
    normalized_label = _normalize_label(label)
    index = normalized_line.find(normalized_label)
    if index == -1:
        parts = SEPARATOR.split(line, maxsplit=1)
        return parts[1].strip() if len(parts) > 1 else ""

    approximate = index + len(normalized_label)
    tail = line[min(approximate, len(line)) :]
    return SEPARATOR.sub(" ", tail, count=1).strip(" :-–—=\t")


def extract_labelled(
    lines: list[list[dict]], page_no: int = 1
) -> dict[str, ExtractedField]:
    """Layer 1: labelled patterns. Highest precision, so it runs first and wins."""
    found: dict[str, ExtractedField] = {}

    for line in lines:
        text = clean_text(line_text(line))
        if not text or len(text) < 2:
            continue

        bbox = line_bbox(line)
        span_confidence = sum(s["confidence"] for s in line) / len(line)

        for field_name in FIELD_LABELS:
            if field_name in found and found[field_name].confidence >= 0.9:
                continue

            matched, label_confidence, label = _label_match(text, field_name)
            if not matched:
                continue

            value = _value_after_label(text, label)
            if not value or len(value) > 200:
                continue

            pattern = VALUE_PATTERNS.get(field_name)
            pattern_confidence = 0.6
            if pattern:
                match = pattern.search(normalize_digits(value))
                if match:
                    value = match.group(1)
                    pattern_confidence = 1.0
                else:
                    pattern_confidence = 0.35

            breakdown = {
                "ocr": round(span_confidence, 4),
                "label": round(label_confidence, 4),
                "pattern": pattern_confidence,
            }
            confidence = round(
                span_confidence * 0.5 + label_confidence * 0.3 + pattern_confidence * 0.2, 4
            )

            existing = found.get(field_name)
            if existing and existing.confidence >= confidence:
                if value not in existing.alternatives and value != existing.value:
                    existing.alternatives.append(value)
                continue

            found[field_name] = ExtractedField(
                name=field_name,
                value=value.strip(),
                raw_text=text,
                confidence=confidence,
                source="rule",
                bbox=bbox,
                page_no=page_no,
                breakdown=breakdown,
            )

    return found


def extract_positional(
    lines: list[list[dict]], page_no: int, document_type: str
) -> dict[str, ExtractedField]:
    """Layer 2: layout inference for the fields labels missed.

    Templates differ by state, so this stays conservative — a positional guess
    is always marked down relative to a labelled match.
    """
    found: dict[str, ExtractedField] = {}
    if not lines:
        return found

    header_lines = lines[: min(4, len(lines))]
    header_text = " ".join(clean_text(line_text(line)) for line in header_lines)

    if document_type in ("SEVEN_TWELVE", "ROR", "KHATAUNI", "JAMABANDI"):
        match = VALUE_PATTERNS["survey_number"].search(normalize_digits(header_text))
        if match:
            found["survey_number"] = ExtractedField(
                name="survey_number",
                value=match.group(1),
                raw_text=header_text[:120],
                confidence=0.55,
                source="layout",
                bbox=line_bbox(header_lines[0]),
                page_no=page_no,
                breakdown={"positional": 0.55},
            )

    year_match = VALUE_PATTERNS["record_year"].search(normalize_digits(header_text))
    if year_match:
        found["record_year"] = ExtractedField(
            name="record_year",
            value=year_match.group(1),
            raw_text=header_text[:120],
            confidence=0.6,
            source="layout",
            bbox=line_bbox(header_lines[0]),
            page_no=page_no,
        )

    return found


def extract_areas(lines: list[list[dict]], page_no: int) -> ExtractedField | None:
    """Area gets its own pass — it is mandatory, and it is the field most often
    written without a label next to a number that means something else."""
    from ml.extraction.normalize import AREA_PATTERN

    best: ExtractedField | None = None
    for line in lines:
        text = clean_text(line_text(line))
        match = AREA_PATTERN.search(normalize_digits(text))
        if not match:
            continue

        span_confidence = sum(s["confidence"] for s in line) / len(line)
        labelled = any(_label_match(text, "plot_area")[0] for _ in (0,))
        confidence = round(span_confidence * (0.95 if labelled else 0.7), 4)

        if best is None or confidence > best.confidence:
            best = ExtractedField(
                name="plot_area",
                value=match.group(0),
                raw_text=text,
                confidence=confidence,
                source="rule",
                bbox=line_bbox(line),
                page_no=page_no,
                breakdown={"ocr": round(span_confidence, 4), "labelled": 1.0 if labelled else 0.6},
            )
    return best


def extract_co_owners(lines: list[list[dict]]) -> list[dict[str, Any]]:
    """Joint holdings are the norm. A record that keeps only the first name is
    wrong in a way that matters — shares will not sum to one."""
    from ml.extraction.normalize import parse_owner_name, parse_share

    owners: list[dict[str, Any]] = []
    for index, line in enumerate(lines):
        text = clean_text(line_text(line))
        if len(text) < 4:
            continue

        share, share_text = parse_share(text)
        if share is None:
            continue

        name_part = re.sub(r"\d+\s*/\s*\d+|\d+(\.\d+)?\s*%", "", text).strip()
        parsed = parse_owner_name(name_part)
        if not parsed.name or len(parsed.name) < 3:
            continue

        owners.append(
            {
                "name": parsed.name,
                "relation": parsed.relation,
                "relation_name": parsed.relation_name,
                "share": share,
                "share_text": share_text,
                "confidence": round(sum(s["confidence"] for s in line) / len(line), 4),
                "bbox": line_bbox(line),
                "sequence": index,
            }
        )
    return owners


def classify_document(text: str) -> tuple[str, float]:
    """Cheap keyword classifier. The trained DiT model supersedes this when the
    model artifacts are present; this keeps the pipeline working without them."""
    lowered = text.lower()
    signatures = {
        "SEVEN_TWELVE": ["7/12", "सात बारा", "सातबारा", "गाव नमुना", "satbara", "गट क्रमांक"],
        "KHATAUNI": ["खतौनी", "khatauni", "खाता संख्या"],
        "JAMABANDI": ["jamabandi", "जमाबंदी", "खेवट", "khewat"],
        "PAHANI": ["pahani", "పహాణి", "పట్టాదారు"],
        "ADANGAL": ["adangal", "అడంగల్"],
        "CHITTA": ["chitta", "சிட்டா"],
        "PATTA": ["patta", "பட்டா"],
        "MUTATION_REGISTER": ["mutation", "नामांतरण", "फेरफार", "इंतकाल", "intkal"],
        "SALE_DEED": ["sale deed", "विक्रय", "खरेदीखत", "conveyance"],
        "CADASTRAL_MAP": ["shajra", "शजरा", "tippan", "टिप्पण", "fmb", "नकाशा"],
        "INDEX_II": ["index-ii", "index 2", "इंडेक्स"],
        "ENCUMBRANCE_CERTIFICATE": ["encumbrance certificate", "बोजा प्रमाणपत्र"],
    }

    scores = {
        doc_type: sum(1 for keyword in keywords if keyword in lowered)
        for doc_type, keywords in signatures.items()
    }
    best = max(scores, key=scores.get)
    hits = scores[best]

    if hits == 0:
        return "UNKNOWN", 0.0
    return best, round(min(0.55 + hits * 0.15, 0.95), 3)


def extract_record(
    ocr_result: dict[str, Any],
    *,
    page_no: int = 1,
    document_type: str = "UNKNOWN",
    batch_context: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Run the whole extraction for one page and score the result."""
    spans = ocr_result.get("spans", [])
    lines = group_into_lines(spans)
    full_text = ocr_result.get("text", "")

    if document_type == "UNKNOWN":
        document_type, type_confidence = classify_document(full_text)
    else:
        type_confidence = 1.0

    fields = extract_labelled(lines, page_no)

    for name, extracted in extract_positional(lines, page_no, document_type).items():
        if name not in fields or fields[name].confidence < extracted.confidence:
            fields.setdefault(name, extracted)

    area = extract_areas(lines, page_no)
    if area and (
        "plot_area" not in fields or fields["plot_area"].confidence < area.confidence
    ):
        fields["plot_area"] = area

    # Batch metadata is authoritative for jurisdiction — the operator selected
    # it, so it outranks anything OCR read off a smudged header.
    context = batch_context or {}
    for name in ("village", "tehsil", "district", "state"):
        if context.get(name):
            fields[name] = ExtractedField(
                name=name,
                value=str(context[name]),
                raw_text=str(context[name]),
                confidence=1.0,
                source="crossref",
                page_no=page_no,
                breakdown={"crossref": 1.0},
            )

    if context.get("record_year") and "record_year" not in fields:
        fields["record_year"] = ExtractedField(
            name="record_year",
            value=str(context["record_year"]),
            raw_text=str(context["record_year"]),
            confidence=0.95,
            source="crossref",
            page_no=page_no,
        )

    co_owners = extract_co_owners(lines)

    raw_values = {name: f.value for name, f in fields.items()}
    raw_values["plot_area_text"] = fields["plot_area"].value if "plot_area" in fields else None

    from ml.extraction.normalize import normalize_record

    normalized = normalize_record(
        raw_values, unit_overrides=context.get("unit_overrides")
    )

    for name, extracted in fields.items():
        if normalized.get(name) not in (None, ""):
            extracted.value = str(normalized[name])

    mandatory_confidences = [
        f.confidence for name, f in fields.items() if name in MANDATORY
    ]
    missing_mandatory = MANDATORY - set(fields)
    all_confidences = [f.confidence for f in fields.values()]

    min_mandatory = min(mandatory_confidences) if mandatory_confidences else 0.0
    if missing_mandatory:
        min_mandatory = 0.0

    mean_all = sum(all_confidences) / len(all_confidences) if all_confidences else 0.0
    overall = round(min_mandatory * 0.7 + mean_all * 0.3, 4)

    return {
        "document_type": document_type,
        "document_type_confidence": type_confidence,
        "language": ocr_result.get("language"),
        "script": ocr_result.get("dominant_script"),
        "fields": [f.to_dict() for f in fields.values()],
        "normalized": normalized,
        "co_owners": co_owners,
        "confidence_overall": overall,
        "confidence_min_mandatory": round(min_mandatory, 4),
        "missing_mandatory": sorted(missing_mandatory),
        "low_confidence_fields": sorted(
            name for name, f in fields.items() if f.confidence < 0.85
        ),
        "fields_extracted": len(fields),
        "lines_read": len(lines),
    }
