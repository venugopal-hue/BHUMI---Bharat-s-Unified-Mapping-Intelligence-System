"""Image cleanup before OCR.

Legacy land records arrive skewed, faded, stained, folded and photographed at
an angle. Every percentage point of OCR accuracy on these pages is won here,
before a model sees the image at all.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import cv2
import numpy as np


@dataclass(slots=True)
class PageQuality:
    """A page-level quality verdict that names the actual defect.

    Naming the defect matters: "quality 22 — too dark, heavy noise" tells the
    scanning operator what to fix. A bare number tells them nothing.
    """

    score: int
    blur: float
    contrast: float
    ink_coverage: float
    skew_angle: float
    issues: list[str] = field(default_factory=list)

    @property
    def usable(self) -> bool:
        return self.score >= 35

    @property
    def verdict(self) -> str:
        if self.score >= 80:
            return "Good — should extract cleanly."
        if self.score >= 60:
            return "Fair — expect some low-confidence fields."
        if self.score >= 35:
            return "Poor — most fields will need human review."
        return "Unusable — rescan recommended."


def to_grayscale(image: np.ndarray) -> np.ndarray:
    if image.ndim == 2:
        return image
    return cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)


def estimate_skew(gray: np.ndarray, max_angle: float = 15.0) -> float:
    """Skew from the dominant near-horizontal text lines.

    Land registers are ruled tables, so the strongest lines are the rules
    themselves — which is exactly what we want to level.
    """
    edges = cv2.Canny(gray, 50, 150, apertureSize=3)
    lines = cv2.HoughLinesP(
        edges, 1, np.pi / 360, threshold=120, minLineLength=gray.shape[1] // 4, maxLineGap=20
    )
    if lines is None:
        return 0.0

    angles = []
    for x1, y1, x2, y2 in lines[:, 0]:
        if x2 == x1:
            continue
        angle = np.degrees(np.arctan2(y2 - y1, x2 - x1))
        if abs(angle) <= max_angle:
            angles.append(angle)

    if not angles:
        return 0.0
    return float(np.median(angles))


def deskew(image: np.ndarray, angle: float | None = None) -> tuple[np.ndarray, float]:
    gray = to_grayscale(image)
    angle = estimate_skew(gray) if angle is None else angle
    if abs(angle) < 0.15:
        return image, 0.0

    h, w = image.shape[:2]
    matrix = cv2.getRotationMatrix2D((w / 2, h / 2), angle, 1.0)
    rotated = cv2.warpAffine(
        image, matrix, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE
    )
    return rotated, round(float(angle), 3)


def auto_orient(image: np.ndarray) -> tuple[np.ndarray, int]:
    """Detect 90/180/270 rotation using Tesseract's orientation script detection.

    Registers get scanned sideways constantly; without this, a whole batch can
    come back empty for no visible reason.
    """
    try:
        import pytesseract

        osd = pytesseract.image_to_osd(image, output_type=pytesseract.Output.DICT)
        rotate = int(osd.get("rotate", 0)) % 360
    except Exception:
        return image, 0

    if rotate == 0:
        return image, 0
    code = {90: cv2.ROTATE_90_CLOCKWISE, 180: cv2.ROTATE_180, 270: cv2.ROTATE_90_COUNTERCLOCKWISE}
    if rotate not in code:
        return image, 0
    return cv2.rotate(image, code[rotate]), rotate


def denoise(gray: np.ndarray, strength: int = 7) -> np.ndarray:
    return cv2.fastNlMeansDenoising(gray, None, h=strength, templateWindowSize=7, searchWindowSize=21)


def enhance_contrast(gray: np.ndarray, clip_limit: float = 2.5) -> np.ndarray:
    """CLAHE rather than global equalisation — a faded corner should be lifted
    without blowing out the rest of the page."""
    clahe = cv2.createCLAHE(clipLimit=clip_limit, tileGridSize=(8, 8))
    return clahe.apply(gray)


def binarize(gray: np.ndarray, window: int = 31, k: float = 0.2) -> np.ndarray:
    """Sauvola local thresholding.

    Global (Otsu) thresholding erases faded ink on aged paper; Sauvola adapts to
    local illumination, which is the whole problem with scanned registers.
    """
    try:
        from skimage.filters import threshold_sauvola

        threshold = threshold_sauvola(gray, window_size=window, k=k)
        return ((gray > threshold) * 255).astype(np.uint8)
    except Exception:
        return cv2.adaptiveThreshold(
            gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, window, 10
        )


def remove_borders(image: np.ndarray, margin: int = 6) -> np.ndarray:
    """Trim the black scanner frame that otherwise becomes a giant fake table."""
    gray = to_grayscale(image)
    _, thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return image

    largest = max(contours, key=cv2.contourArea)
    x, y, w, h = cv2.boundingRect(largest)
    page_area = image.shape[0] * image.shape[1]
    if w * h < page_area * 0.5:
        return image

    x, y = max(x + margin, 0), max(y + margin, 0)
    w, h = max(w - 2 * margin, 1), max(h - 2 * margin, 1)
    return image[y : y + h, x : x + w]


def upscale_to_dpi(image: np.ndarray, current_dpi: int, target_dpi: int = 300) -> np.ndarray:
    """OCR accuracy falls off a cliff below ~250 DPI. Upscaling a 150 DPI scan
    is not free accuracy, but it is measurably better than not doing it."""
    if current_dpi >= target_dpi:
        return image
    scale = min(target_dpi / max(current_dpi, 1), 4.0)
    return cv2.resize(image, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)


def assess_quality(image: np.ndarray) -> PageQuality:
    """A 0–100 score plus the specific reasons behind it."""
    gray = to_grayscale(image)
    issues: list[str] = []

    blur = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    contrast = float(gray.std())
    ink = float(np.mean(gray < 128))
    skew = estimate_skew(gray)
    mean_intensity = float(gray.mean())

    score = 100.0

    if blur < 40:
        score -= 30
        issues.append("Image is out of focus or motion-blurred.")
    elif blur < 100:
        score -= 12
        issues.append("Image is slightly soft.")

    if contrast < 30:
        score -= 25
        issues.append("Very low contrast — text may be faded.")
    elif contrast < 45:
        score -= 10
        issues.append("Low contrast.")

    if mean_intensity < 70:
        score -= 15
        issues.append("Page is too dark.")
    elif mean_intensity > 235:
        score -= 12
        issues.append("Page is washed out or over-exposed.")

    if ink < 0.005:
        score -= 30
        issues.append("Almost no text detected — the page may be blank.")
    elif ink > 0.55:
        score -= 18
        issues.append("Heavy dark coverage — staining, shadow or bleed-through.")

    if abs(skew) > 5:
        score -= 15
        issues.append(f"Page is skewed by {skew:.1f}°.")
    elif abs(skew) > 2:
        score -= 6
        issues.append(f"Slight skew of {skew:.1f}°.")

    height, width = gray.shape[:2]
    if min(height, width) < 900:
        score -= 20
        issues.append("Resolution is too low — rescan at 300 DPI.")

    return PageQuality(
        score=max(0, min(100, int(round(score)))),
        blur=round(blur, 2),
        contrast=round(contrast, 2),
        ink_coverage=round(ink, 4),
        skew_angle=round(skew, 3),
        issues=issues,
    )


def detect_handwriting(gray: np.ndarray) -> float:
    """Rough handwritten-content estimate.

    Printed glyphs have consistent stroke widths and sit on a regular baseline;
    handwriting varies on both. This is a heuristic used to *route* a region to
    the handwriting model — it never decides what the text says.
    """
    binary = binarize(gray)
    inverted = 255 - binary

    contours, _ = cv2.findContours(inverted, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    boxes = [cv2.boundingRect(c) for c in contours if cv2.contourArea(c) > 20]
    if len(boxes) < 12:
        return 0.0

    heights = np.array([b[3] for b in boxes], dtype=float)
    aspects = np.array([b[2] / max(b[3], 1) for b in boxes], dtype=float)

    height_variation = float(heights.std() / max(heights.mean(), 1))
    aspect_variation = float(aspects.std() / max(aspects.mean(), 1))

    score = (height_variation + aspect_variation) / 2
    return round(min(max(score, 0.0), 1.0), 3)


def process_page(
    image: np.ndarray, *, source_dpi: int = 200, target_dpi: int = 300
) -> dict:
    """The full Intake cleanup: orient → deskew → crop → upscale → enhance.

    Returns both the cleaned grayscale (best for OCR) and the binarized image,
    plus the quality verdict recorded against the page.
    """
    quality_before = assess_quality(image)

    oriented, rotation = auto_orient(image)
    deskewed, skew = deskew(oriented)
    cropped = remove_borders(deskewed)
    upscaled = upscale_to_dpi(cropped, source_dpi, target_dpi)

    gray = to_grayscale(upscaled)
    if quality_before.score < 70:
        gray = denoise(gray)
    enhanced = enhance_contrast(gray)
    binary = binarize(enhanced)

    quality_after = assess_quality(enhanced)
    handwriting = detect_handwriting(enhanced)

    return {
        "clean": enhanced,
        "binary": binary,
        "rotation_applied": rotation,
        "skew_angle": skew,
        "quality_before": quality_before,
        "quality": quality_after,
        "handwriting_score": handwriting,
        "has_handwriting": handwriting > 0.45,
        "dpi": target_dpi,
        "width": int(enhanced.shape[1]),
        "height": int(enhanced.shape[0]),
    }
