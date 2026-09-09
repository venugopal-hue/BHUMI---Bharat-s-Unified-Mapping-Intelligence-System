"""Render synthetic land-record images using Pillow.

Each rendered image is a realistic-looking scanned document:
  - Paper texture with speckle noise
  - Printed tabular layout (header + field rows)
  - Handwritten-style owner name via a random offset + slight skew
  - Government stamp and signature regions
  - Optional degradation (blur, salt-and-pepper, skew)
"""

from __future__ import annotations

import io
import math
import random
from pathlib import Path
from typing import Optional

import numpy as np

try:
    from PIL import Image, ImageDraw, ImageFilter, ImageFont  # type: ignore
    PIL_AVAILABLE = True
except ImportError:
    PIL_AVAILABLE = False


# ---------------------------------------------------------------------------
# Font helpers
# ---------------------------------------------------------------------------

_FONT_CACHE: dict[tuple[str, int], "ImageFont.ImageFont"] = {}

def _font(size: int, bold: bool = False) -> "ImageFont.ImageFont":
    key = (("bold" if bold else "regular"), size)
    if key in _FONT_CACHE:
        return _FONT_CACHE[key]
    try:
        # Prefer a system font that covers Devanagari
        candidates = [
            "/usr/share/fonts/truetype/noto/NotoSansDevanagari-Regular.ttf",
            "/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf",
            "C:/Windows/Fonts/mangal.ttf",   # Hindi — Windows
            "C:/Windows/Fonts/arial.ttf",
        ]
        for path in candidates:
            if Path(path).exists():
                f = ImageFont.truetype(path, size)
                _FONT_CACHE[key] = f
                return f
    except Exception:
        pass
    f = ImageFont.load_default()
    _FONT_CACHE[key] = f
    return f


# ---------------------------------------------------------------------------
# Degradation helpers
# ---------------------------------------------------------------------------

def _add_paper_texture(img: "Image.Image", intensity: float = 0.03) -> "Image.Image":
    arr = np.array(img).astype(np.float32)
    noise = np.random.normal(0, intensity * 255, arr.shape)
    arr = np.clip(arr + noise, 0, 255).astype(np.uint8)
    return Image.fromarray(arr)


def _add_speckle(img: "Image.Image", prob: float = 0.004) -> "Image.Image":
    arr = np.array(img)
    mask = np.random.random(arr.shape[:2]) < prob
    arr[mask] = 0
    return Image.fromarray(arr)


def _blur(img: "Image.Image", radius: float = 0.8) -> "Image.Image":
    return img.filter(ImageFilter.GaussianBlur(radius=radius))


def _skew(img: "Image.Image", angle_deg: float) -> "Image.Image":
    return img.rotate(angle_deg, expand=False, fillcolor=(245, 240, 230))


# ---------------------------------------------------------------------------
# Core renderer
# ---------------------------------------------------------------------------

class RecordRenderer:
    """Render a single land-record document image from a record dict.

    record dict keys (all optional with sensible defaults):
      owner_name, father_name, survey_number, khasra_number, khata_number,
      plot_area, area_unit, land_classification, soil_type, irrigation_source,
      mutation_number, mutation_date, state, district, tehsil, village,
      document_type, record_year, language
    """

    PAGE_W = 2480   # A4 at 300 dpi
    PAGE_H = 3508

    def __init__(
        self,
        degrade: bool = True,
        skew_range: tuple[float, float] = (-1.5, 1.5),
        blur_prob: float = 0.4,
        speckle_prob: float = 0.6,
    ):
        self.degrade = degrade
        self.skew_range = skew_range
        self.blur_prob = blur_prob
        self.speckle_prob = speckle_prob

    def render(self, record: dict) -> "Image.Image":
        if not PIL_AVAILABLE:
            raise RuntimeError("Pillow is required for rendering: pip install Pillow")

        img = Image.new("RGB", (self.PAGE_W, self.PAGE_H), color=(245, 240, 230))
        draw = ImageDraw.Draw(img)

        self._draw_page(draw, record)

        if self.degrade:
            img = _add_paper_texture(img)
            if random.random() < self.speckle_prob:
                img = _add_speckle(img)
            if random.random() < self.blur_prob:
                img = _blur(img, radius=random.uniform(0.4, 1.2))
            angle = random.uniform(*self.skew_range)
            if abs(angle) > 0.2:
                img = _skew(img, angle)

        return img

    def render_to_bytes(self, record: dict, fmt: str = "PNG") -> bytes:
        img = self.render(record)
        buf = io.BytesIO()
        img.save(buf, format=fmt, dpi=(300, 300))
        return buf.getvalue()

    # ------------------------------------------------------------------
    # Internal layout drawing
    # ------------------------------------------------------------------

    def _draw_page(self, draw: "ImageDraw.ImageDraw", rec: dict) -> None:
        W, H = self.PAGE_W, self.PAGE_H
        M = 120  # margin

        # -- Government header strip --
        draw.rectangle([M, M, W - M, M + 140], fill=(220, 230, 245), outline=(80, 100, 140), width=3)
        header_font = _font(52, bold=True)
        gov_text = "भारत सरकार / Government of India"
        draw.text((W // 2, M + 30), gov_text, fill=(30, 50, 100), font=header_font, anchor="mm")
        sub_text = f"भू-अभिलेख विभाग  |  {rec.get('document_type', 'PATTA')}  |  वर्ष {rec.get('record_year', 2024)}"
        draw.text((W // 2, M + 100), sub_text, fill=(50, 70, 120), font=_font(38), anchor="mm")

        # -- Title --
        y = M + 180
        title_map = {
            "PATTA": "पट्टा / Title Deed",
            "KHATAUNI": "खतौनी / Record of Rights",
            "RTC": "RTC / Record of Tenancy & Crops",
            "FARD": "फ़र्द / Land Record Extract",
            "BHU_ABHILEKH": "भू-अभिलेख / Land Record",
            "JAMABANDI": "जमाबंदी / Settlement Register",
        }
        title = title_map.get(rec.get("document_type", "PATTA"), "भू-अभिलेख")
        draw.text((W // 2, y + 40), title, fill=(20, 20, 20), font=_font(64, bold=True), anchor="mm")
        y += 100

        # -- Location block --
        draw.line([(M, y), (W - M, y)], fill=(160, 160, 160), width=2)
        y += 20
        loc_fields = [
            ("राज्य / State", rec.get("state", "—")),
            ("जिला / District", rec.get("district", "—")),
            ("तहसील / Tehsil", rec.get("tehsil", "—")),
            ("ग्राम / Village", rec.get("village", "—")),
        ]
        col_w = (W - 2 * M) // 4
        for i, (lbl, val) in enumerate(loc_fields):
            x = M + i * col_w
            draw.text((x + 10, y + 10), lbl, fill=(100, 100, 100), font=_font(30))
            draw.text((x + 10, y + 50), str(val), fill=(10, 10, 10), font=_font(36, bold=True))
        y += 120

        draw.line([(M, y), (W - M, y)], fill=(160, 160, 160), width=2)
        y += 30

        # -- Main data table --
        y = self._draw_data_table(draw, rec, M, y, W)

        # -- Stamp & signature area --
        y += 60
        self._draw_stamp(draw, W - M - 260, y, 240)
        self._draw_signature(draw, M + 40, y + 60)

        # -- Footer --
        footer_y = H - M - 60
        draw.line([(M, footer_y), (W - M, footer_y)], fill=(160, 160, 160), width=1)
        draw.text(
            (W // 2, footer_y + 30),
            f"BHUMI · {rec.get('district', '')} · Generated · यह एक कम्प्यूटर-जनित प्रति है",
            fill=(150, 150, 150),
            font=_font(28),
            anchor="mm",
        )

    def _draw_data_table(
        self, draw: "ImageDraw.ImageDraw", rec: dict, x: int, y: int, page_w: int
    ) -> int:
        col_label_w = 520
        col_val_w = page_w - x - x - col_label_w - 20
        row_h = 70
        font_lbl = _font(32)
        font_val = _font(38, bold=True)
        alt_fill = (235, 238, 245)

        rows = [
            ("खसरा संख्या / Survey No.", rec.get("survey_number", "—")),
            ("खाता संख्या / Khata No.", rec.get("khata_number", "—")),
            ("खतौनी संख्या / Khasra No.", rec.get("khasra_number", "—")),
            ("स्वामी का नाम / Owner Name", rec.get("owner_name", "—")),
            ("पिता/पति का नाम / Father/Husband", rec.get("father_name", "—")),
            ("क्षेत्रफल / Plot Area", f"{rec.get('plot_area', '—')} {rec.get('area_unit', '')}"),
            ("भूमि वर्गीकरण / Land Classification", rec.get("land_classification", "—")),
            ("मृदा प्रकार / Soil Type", rec.get("soil_type", "—")),
            ("सिंचाई स्रोत / Irrigation", rec.get("irrigation_source", "—")),
            ("म्यूटेशन नंबर / Mutation No.", rec.get("mutation_number", "—")),
            ("म्यूटेशन दिनांक / Mutation Date", rec.get("mutation_date", "—")),
        ]

        table_x = x
        table_right = page_w - x
        for i, (lbl, val) in enumerate(rows):
            row_y = y + i * row_h
            if i % 2 == 0:
                draw.rectangle([table_x, row_y, table_right, row_y + row_h], fill=alt_fill)
            draw.line([(table_x, row_y), (table_right, row_y)], fill=(200, 200, 200), width=1)
            draw.text((table_x + 12, row_y + 16), lbl, fill=(80, 80, 80), font=font_lbl)
            draw.text((table_x + col_label_w + 12, row_y + 10), str(val), fill=(10, 10, 10), font=font_val)

        end_y = y + len(rows) * row_h
        draw.rectangle([table_x, y, table_right, end_y], outline=(120, 120, 140), width=2)
        draw.line([(table_x + col_label_w, y), (table_x + col_label_w, end_y)], fill=(120, 120, 140), width=2)
        return end_y

    def _draw_stamp(self, draw: "ImageDraw.ImageDraw", x: int, y: int, size: int) -> None:
        """Draw a circular government seal placeholder."""
        draw.ellipse([x, y, x + size, y + size], outline=(180, 30, 30), width=4)
        inner = 18
        draw.ellipse([x + inner, y + inner, x + size - inner, y + size - inner], outline=(180, 30, 30), width=2)
        cx, cy = x + size // 2, y + size // 2
        draw.text((cx, cy - 20), "सरकारी", fill=(180, 30, 30), font=_font(28, bold=True), anchor="mm")
        draw.text((cx, cy + 20), "मुहर", fill=(180, 30, 30), font=_font(28, bold=True), anchor="mm")

    def _draw_signature(self, draw: "ImageDraw.ImageDraw", x: int, y: int) -> None:
        """Draw a squiggly line signature placeholder."""
        import math
        pts = []
        for i in range(60):
            px = x + i * 5
            py = y + int(math.sin(i * 0.4) * 12 + math.sin(i * 1.1) * 5)
            pts.append((px, py))
        for i in range(len(pts) - 1):
            draw.line([pts[i], pts[i + 1]], fill=(20, 20, 100), width=3)
        draw.text((x + 150, y + 40), "अधिकृत हस्ताक्षर / Authorised Signatory",
                  fill=(100, 100, 100), font=_font(28), anchor="mm")
