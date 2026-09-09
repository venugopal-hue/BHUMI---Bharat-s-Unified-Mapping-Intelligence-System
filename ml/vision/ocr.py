"""OCR: script detection, engine routing, ensembling and confidence calibration.

Routing matters more than any single engine. Printed Devanagari, handwritten
Devanagari, a Tamil chitta and a column of survey numbers each want a different
model, and sending all of them through one general OCR is how projects end up
reporting 60% accuracy.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

import numpy as np

# Unicode blocks → the script BHUMI routes on.
SCRIPT_RANGES: dict[str, list[tuple[int, int]]] = {
    "devanagari": [(0x0900, 0x097F)],
    "bengali": [(0x0980, 0x09FF)],
    "gurmukhi": [(0x0A00, 0x0A7F)],
    "gujarati": [(0x0A80, 0x0AFF)],
    "odia": [(0x0B00, 0x0B7F)],
    "tamil": [(0x0B80, 0x0BFF)],
    "telugu": [(0x0C00, 0x0C7F)],
    "kannada": [(0x0C80, 0x0CFF)],
    "malayalam": [(0x0D00, 0x0D7F)],
    "arabic": [(0x0600, 0x06FF), (0x0750, 0x077F)],
    "latin": [(0x0041, 0x024F)],
}

SCRIPT_TO_TESSERACT: dict[str, str] = {
    "devanagari": "hin+mar",
    "bengali": "ben",
    "gurmukhi": "pan",
    "gujarati": "guj",
    "odia": "ori",
    "tamil": "tam",
    "telugu": "tel",
    "kannada": "kan",
    "malayalam": "mal",
    "arabic": "urd",
    "latin": "eng",
}

SCRIPT_TO_LANGUAGE: dict[str, str] = {
    "devanagari": "hin",
    "bengali": "ben",
    "gurmukhi": "pan",
    "gujarati": "guj",
    "odia": "ori",
    "tamil": "tam",
    "telugu": "tel",
    "kannada": "kan",
    "malayalam": "mal",
    "arabic": "urd",
    "latin": "eng",
}

# Indic digits → ASCII. Survey numbers and areas are written in local numerals
# far more often than people expect.
DIGIT_MAP = {
    **{chr(0x0966 + i): str(i) for i in range(10)},  # Devanagari
    **{chr(0x09E6 + i): str(i) for i in range(10)},  # Bengali
    **{chr(0x0A66 + i): str(i) for i in range(10)},  # Gurmukhi
    **{chr(0x0AE6 + i): str(i) for i in range(10)},  # Gujarati
    **{chr(0x0B66 + i): str(i) for i in range(10)},  # Odia
    **{chr(0x0BE6 + i): str(i) for i in range(10)},  # Tamil
    **{chr(0x0C66 + i): str(i) for i in range(10)},  # Telugu
    **{chr(0x0CE6 + i): str(i) for i in range(10)},  # Kannada
    **{chr(0x0D66 + i): str(i) for i in range(10)},  # Malayalam
    **{chr(0x06F0 + i): str(i) for i in range(10)},  # Extended Arabic-Indic
    **{chr(0x0660 + i): str(i) for i in range(10)},  # Arabic-Indic
}


def normalize_digits(text: str) -> str:
    return "".join(DIGIT_MAP.get(c, c) for c in text)


def detect_script(text: str) -> str:
    """Script of a recognized string, by character majority."""
    counts: dict[str, int] = {}
    for char in text:
        code = ord(char)
        for script, ranges in SCRIPT_RANGES.items():
            if any(lo <= code <= hi for lo, hi in ranges):
                counts[script] = counts.get(script, 0) + 1
                break
    if not counts:
        return "unknown"
    return max(counts, key=counts.get)


@dataclass(slots=True)
class Span:
    """One recognized text run with everything needed to locate and trust it."""

    text: str
    bbox: dict[str, int]
    confidence: float
    raw_confidence: float
    script: str = "unknown"
    language: str | None = None
    engine: str = "tesseract"
    is_handwritten: bool = False
    alternatives: list[str] = field(default_factory=list)
    reading_order: int = 0

    def to_dict(self) -> dict[str, Any]:
        return {
            "text": self.text,
            "text_normalized": normalize_digits(self.text),
            "bbox": self.bbox,
            "confidence": round(self.confidence, 4),
            "raw_confidence": round(self.raw_confidence, 4),
            "script": self.script,
            "language": self.language,
            "engine": self.engine,
            "is_handwritten": self.is_handwritten,
            "alternatives": self.alternatives or None,
            "reading_order": self.reading_order,
        }


# ── Confidence calibration ──────────────────────────────────────────
def calibrate(raw: float, *, engine: str, is_handwritten: bool, script: str) -> float:
    """Map a raw engine score onto something that means what it says.

    Tesseract reports 90 on Devanagari far more readily than it is right 90% of
    the time. Routing decisions are made on this number, so it has to be honest
    rather than flattering — the shrink factors below come from measuring each
    engine against the golden set.
    """
    confidence = max(0.0, min(raw, 1.0))

    engine_factor = {
        "tesseract": 0.88,
        "paddle": 0.94,
        "trocr": 0.90,
        "ensemble": 1.0,
        "digits": 0.96,
    }.get(engine, 0.85)

    script_factor = 1.0 if script in ("latin", "devanagari") else 0.93
    handwriting_factor = 0.72 if is_handwritten else 1.0

    return round(confidence * engine_factor * script_factor * handwriting_factor, 4)


# ── Engines ─────────────────────────────────────────────────────────
class TesseractEngine:
    """Baseline engine. Available offline, ships Indic traineddata, and needs no
    GPU — which is what makes it the safe path on demo hardware."""

    name = "tesseract"

    def __init__(self, langs: str = "eng+hin+mar") -> None:
        self.langs = langs

    def recognize(self, image: np.ndarray, *, psm: int = 6) -> list[Span]:
        try:
            import pytesseract
            from pytesseract import Output
        except ImportError:
            return []

        config = f"--oem 3 --psm {psm}"
        try:
            data = pytesseract.image_to_data(
                image, lang=self.langs, config=config, output_type=Output.DICT
            )
        except Exception:
            return []

        spans: list[Span] = []
        order = 0
        for i, text in enumerate(data.get("text", [])):
            text = (text or "").strip()
            if not text:
                continue
            raw = float(data["conf"][i]) / 100.0
            if raw < 0:
                continue

            script = detect_script(text)
            spans.append(
                Span(
                    text=text,
                    bbox={
                        "x": int(data["left"][i]),
                        "y": int(data["top"][i]),
                        "w": int(data["width"][i]),
                        "h": int(data["height"][i]),
                    },
                    confidence=calibrate(
                        raw, engine=self.name, is_handwritten=False, script=script
                    ),
                    raw_confidence=round(raw, 4),
                    script=script,
                    language=SCRIPT_TO_LANGUAGE.get(script),
                    engine=self.name,
                    reading_order=order,
                )
            )
            order += 1
        return spans


class PaddleEngine:
    """Stronger on Indic printed text than Tesseract, but a heavier install —
    optional, and the pipeline degrades to Tesseract when it is absent."""

    name = "paddle"

    def __init__(self, lang: str = "devanagari") -> None:
        self.lang = lang
        self._ocr = None

    def _load(self):
        if self._ocr is None:
            from paddleocr import PaddleOCR

            self._ocr = PaddleOCR(use_angle_cls=True, lang=self.lang, show_log=False)
        return self._ocr

    def recognize(self, image: np.ndarray, **_: Any) -> list[Span]:
        try:
            ocr = self._load()
            result = ocr.ocr(image, cls=True)
        except Exception:
            return []

        spans: list[Span] = []
        for order, line in enumerate(result[0] if result and result[0] else []):
            box, (text, raw) = line
            xs = [p[0] for p in box]
            ys = [p[1] for p in box]
            script = detect_script(text)
            spans.append(
                Span(
                    text=text.strip(),
                    bbox={
                        "x": int(min(xs)),
                        "y": int(min(ys)),
                        "w": int(max(xs) - min(xs)),
                        "h": int(max(ys) - min(ys)),
                    },
                    confidence=calibrate(
                        float(raw), engine=self.name, is_handwritten=False, script=script
                    ),
                    raw_confidence=round(float(raw), 4),
                    script=script,
                    language=SCRIPT_TO_LANGUAGE.get(script),
                    engine=self.name,
                    reading_order=order,
                )
            )
        return spans


class HandwritingEngine:
    """TrOCR fine-tuned on Indic handwriting.

    Handwriting is where accuracy is genuinely hard. BHUMI's answer is not to
    pretend it is solved — it is to recognize what it can, mark the rest
    low-confidence, and put a human on exactly those fields.
    """

    name = "trocr"

    def __init__(self, model_dir: str = "/models/trocr-indic") -> None:
        self.model_dir = model_dir
        self._model = None
        self._processor = None

    def available(self) -> bool:
        try:
            import torch  # noqa: F401
            import transformers  # noqa: F401

            return True
        except ImportError:
            return False

    def recognize_line(self, image: np.ndarray) -> tuple[str, float]:
        if not self.available():
            return "", 0.0
        try:
            from PIL import Image
            from transformers import TrOCRProcessor, VisionEncoderDecoderModel

            if self._model is None:
                self._processor = TrOCRProcessor.from_pretrained(self.model_dir)
                self._model = VisionEncoderDecoderModel.from_pretrained(self.model_dir)
                self._model.eval()

            pil = Image.fromarray(image).convert("RGB")
            pixel_values = self._processor(pil, return_tensors="pt").pixel_values
            generated = self._model.generate(pixel_values, max_length=64)
            text = self._processor.batch_decode(generated, skip_special_tokens=True)[0]
            return text.strip(), 0.75
        except Exception:
            return "", 0.0


# ── Ensemble ────────────────────────────────────────────────────────
def _iou(a: dict[str, int], b: dict[str, int]) -> float:
    ax2, ay2 = a["x"] + a["w"], a["y"] + a["h"]
    bx2, by2 = b["x"] + b["w"], b["y"] + b["h"]
    inter_w = max(0, min(ax2, bx2) - max(a["x"], b["x"]))
    inter_h = max(0, min(ay2, by2) - max(a["y"], b["y"]))
    intersection = inter_w * inter_h
    if intersection == 0:
        return 0.0
    union = a["w"] * a["h"] + b["w"] * b["h"] - intersection
    return intersection / union if union else 0.0


def ensemble(primary: list[Span], secondary: list[Span], *, iou_threshold: float = 0.5) -> list[Span]:
    """Merge two engines' output.

    Agreement between independent engines is real evidence, so it raises
    confidence. Disagreement is equally informative — it lowers confidence and
    keeps the runner-up as an alternative the verifier can pick with one click.
    """
    if not secondary:
        return primary
    if not primary:
        return secondary

    merged: list[Span] = []
    used: set[int] = set()

    for span in primary:
        best_index, best_iou = None, 0.0
        for j, other in enumerate(secondary):
            if j in used:
                continue
            overlap = _iou(span.bbox, other.bbox)
            if overlap > best_iou:
                best_index, best_iou = j, overlap

        if best_index is None or best_iou < iou_threshold:
            merged.append(span)
            continue

        match = secondary[best_index]
        used.add(best_index)

        if span.text.strip() == match.text.strip():
            span.confidence = round(min(1.0, span.confidence * 1.15 + 0.05), 4)
            span.engine = "ensemble"
        else:
            winner, loser = (
                (span, match) if span.confidence >= match.confidence else (match, span)
            )
            winner.confidence = round(winner.confidence * 0.8, 4)
            winner.alternatives = [loser.text]
            winner.engine = "ensemble"
            span = winner
        merged.append(span)

    merged.extend(secondary[j] for j in range(len(secondary)) if j not in used)
    merged.sort(key=lambda s: (s.bbox["y"] // 15, s.bbox["x"]))
    for order, span in enumerate(merged):
        span.reading_order = order
    return merged


def recognize_page(
    image: np.ndarray,
    *,
    engines: list[str] | None = None,
    langs: str = "eng+hin+mar",
    has_handwriting: bool = False,
) -> dict[str, Any]:
    """Recognize a full page and report engine agreement alongside the spans."""
    engines = engines or ["tesseract"]
    results: list[list[Span]] = []

    if "tesseract" in engines:
        results.append(TesseractEngine(langs).recognize(image))
    if "paddle" in engines:
        results.append(PaddleEngine().recognize(image))

    spans = results[0] if results else []
    for extra in results[1:]:
        spans = ensemble(spans, extra)

    if has_handwriting:
        for span in spans:
            if span.confidence < 0.6:
                span.is_handwritten = True
                span.confidence = calibrate(
                    span.raw_confidence,
                    engine=span.engine,
                    is_handwritten=True,
                    script=span.script,
                )

    scripts: dict[str, int] = {}
    for span in spans:
        scripts[span.script] = scripts.get(span.script, 0) + 1
    dominant = max(scripts, key=scripts.get) if scripts else "unknown"

    agreement = (
        sum(1 for s in spans if s.engine == "ensemble" and not s.alternatives) / len(spans)
        if spans and len(results) > 1
        else 1.0
    )

    return {
        "spans": [s.to_dict() for s in spans],
        "span_count": len(spans),
        "text": "\n".join(s.text for s in spans),
        "dominant_script": dominant,
        "language": SCRIPT_TO_LANGUAGE.get(dominant, "eng"),
        "mean_confidence": round(
            sum(s.confidence for s in spans) / len(spans), 4
        )
        if spans
        else 0.0,
        "low_confidence_spans": sum(1 for s in spans if s.confidence < 0.7),
        "engine_agreement": round(agreement, 3),
        "engines_used": engines,
    }


def group_into_lines(spans: list[dict], tolerance: int = 12) -> list[list[dict]]:
    """Group word spans into reading lines — the unit field extraction works on."""
    if not spans:
        return []
    ordered = sorted(spans, key=lambda s: (s["bbox"]["y"], s["bbox"]["x"]))
    lines: list[list[dict]] = [[ordered[0]]]

    for span in ordered[1:]:
        last = lines[-1][-1]
        if abs(span["bbox"]["y"] - last["bbox"]["y"]) <= tolerance:
            lines[-1].append(span)
        else:
            lines.append([span])

    for line in lines:
        line.sort(key=lambda s: s["bbox"]["x"])
    return lines


def line_text(line: list[dict]) -> str:
    return " ".join(s["text"] for s in line).strip()


def line_bbox(line: list[dict]) -> dict[str, int]:
    xs = [s["bbox"]["x"] for s in line]
    ys = [s["bbox"]["y"] for s in line]
    x2 = [s["bbox"]["x"] + s["bbox"]["w"] for s in line]
    y2 = [s["bbox"]["y"] + s["bbox"]["h"] for s in line]
    return {"x": min(xs), "y": min(ys), "w": max(x2) - min(xs), "h": max(y2) - min(ys)}


CURRENCY_OR_NOISE = re.compile(r"[^\w\s/.,\-()]", re.UNICODE)


def clean_text(text: str) -> str:
    text = normalize_digits(text)
    text = CURRENCY_OR_NOISE.sub(" ", text)
    return re.sub(r"\s+", " ", text).strip()
