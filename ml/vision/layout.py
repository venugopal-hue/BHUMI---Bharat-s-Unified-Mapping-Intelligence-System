"""Layout detection — wraps YOLOv8 (primary) with Detectron2 fallback.

Detects regions on a scanned land-record page:
  TABLE, TEXT_BLOCK, HEADER, STAMP, SIGNATURE, MAP, CHECKBOX, FIELD_LABEL, FIELD_VALUE

Usage:
    detector = LayoutDetector.from_config()
    regions  = detector.detect(image_bgr)          # List[RegionResult]
    overlay  = detector.draw(image_bgr, regions)   # annotated BGR ndarray
"""

from __future__ import annotations

import logging
import os
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

import numpy as np

log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

REGION_TYPES = {
    0: "TABLE",
    1: "TEXT_BLOCK",
    2: "HEADER",
    3: "STAMP",
    4: "SIGNATURE",
    5: "MAP",
    6: "CHECKBOX",
    7: "FIELD_LABEL",
    8: "FIELD_VALUE",
}

COLORS = {
    "TABLE":       (255, 128,   0),
    "TEXT_BLOCK":  ( 30, 144, 255),
    "HEADER":      ( 50, 205,  50),
    "STAMP":       (220,  20,  60),
    "SIGNATURE":   (148,   0, 211),
    "MAP":         (255, 215,   0),
    "CHECKBOX":    (  0, 206, 209),
    "FIELD_LABEL": (255, 140,   0),
    "FIELD_VALUE": (  0, 128, 128),
}


@dataclass
class BBox:
    x1: float
    y1: float
    x2: float
    y2: float

    @property
    def width(self) -> float:
        return self.x2 - self.x1

    @property
    def height(self) -> float:
        return self.y2 - self.y1

    @property
    def area(self) -> float:
        return self.width * self.height

    def as_xywh(self) -> tuple[float, float, float, float]:
        return self.x1, self.y1, self.width, self.height

    def as_xyxy(self) -> tuple[float, float, float, float]:
        return self.x1, self.y1, self.x2, self.y2

    def iou(self, other: "BBox") -> float:
        ix1 = max(self.x1, other.x1)
        iy1 = max(self.y1, other.y1)
        ix2 = min(self.x2, other.x2)
        iy2 = min(self.y2, other.y2)
        inter = max(0.0, ix2 - ix1) * max(0.0, iy2 - iy1)
        union = self.area + other.area - inter
        return inter / union if union > 0 else 0.0

    def to_dict(self) -> dict:
        return {"x1": self.x1, "y1": self.y1, "x2": self.x2, "y2": self.y2}


@dataclass
class RegionResult:
    region_type: str
    bbox: BBox
    confidence: float
    row_index: Optional[int] = None
    col_index: Optional[int] = None
    reading_order: Optional[int] = None
    metadata: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "region_type": self.region_type,
            "bbox": self.bbox.to_dict(),
            "confidence": round(self.confidence, 4),
            "row_index": self.row_index,
            "col_index": self.col_index,
            "reading_order": self.reading_order,
        }


# ---------------------------------------------------------------------------
# Backend base class
# ---------------------------------------------------------------------------

class _Backend:
    def detect_raw(self, image: np.ndarray) -> list[RegionResult]:
        raise NotImplementedError


# ---------------------------------------------------------------------------
# YOLOv8 backend
# ---------------------------------------------------------------------------

class _YoloBackend(_Backend):
    def __init__(self, weights: str, conf_threshold: float, iou_threshold: float, device: str):
        from ultralytics import YOLO  # type: ignore
        self._model = YOLO(weights)
        self._conf = conf_threshold
        self._iou = iou_threshold
        self._device = device
        log.info("YOLOv8 layout model loaded: %s on %s", weights, device)

    def detect_raw(self, image: np.ndarray) -> list[RegionResult]:
        results = self._model.predict(
            source=image,
            conf=self._conf,
            iou=self._iou,
            device=self._device,
            verbose=False,
        )
        out: list[RegionResult] = []
        for r in results:
            if r.boxes is None:
                continue
            for box in r.boxes:
                cls_id = int(box.cls[0].item())
                region_type = REGION_TYPES.get(cls_id, "TEXT_BLOCK")
                conf = float(box.conf[0].item())
                x1, y1, x2, y2 = box.xyxy[0].tolist()
                out.append(RegionResult(
                    region_type=region_type,
                    bbox=BBox(x1, y1, x2, y2),
                    confidence=conf,
                ))
        return out


# ---------------------------------------------------------------------------
# Detectron2 fallback backend
# ---------------------------------------------------------------------------

class _Detectron2Backend(_Backend):
    def __init__(self, config_path: str, weights: str, conf_threshold: float, device: str):
        from detectron2.config import get_cfg  # type: ignore
        from detectron2.engine import DefaultPredictor  # type: ignore
        from detectron2 import model_zoo  # type: ignore

        cfg = get_cfg()
        if config_path and Path(config_path).exists():
            cfg.merge_from_file(config_path)
        else:
            cfg.merge_from_file(model_zoo.get_config_file(
                "COCO-Detection/faster_rcnn_R_50_FPN_3x.yaml"
            ))

        cfg.MODEL.WEIGHTS = weights if weights else model_zoo.get_checkpoint_url(
            "COCO-Detection/faster_rcnn_R_50_FPN_3x.yaml"
        )
        cfg.MODEL.ROI_HEADS.SCORE_THRESH_TEST = conf_threshold
        cfg.MODEL.ROI_HEADS.NUM_CLASSES = len(REGION_TYPES)
        cfg.MODEL.DEVICE = device
        self._predictor = DefaultPredictor(cfg)
        log.info("Detectron2 layout model loaded on %s", device)

    def detect_raw(self, image: np.ndarray) -> list[RegionResult]:
        outputs = self._predictor(image)
        instances = outputs["instances"].to("cpu")
        out: list[RegionResult] = []
        for i in range(len(instances)):
            cls_id = int(instances.pred_classes[i].item())
            region_type = REGION_TYPES.get(cls_id, "TEXT_BLOCK")
            score = float(instances.scores[i].item())
            x1, y1, x2, y2 = instances.pred_boxes.tensor[i].tolist()
            out.append(RegionResult(
                region_type=region_type,
                bbox=BBox(x1, y1, x2, y2),
                confidence=score,
            ))
        return out


# ---------------------------------------------------------------------------
# Heuristic fallback (no ML dependency — used in unit tests / CI)
# ---------------------------------------------------------------------------

class _HeuristicBackend(_Backend):
    """Rule-based layout detection using connected-components + projection profiles.

    Not production-quality but good enough for smoke-tests without GPU/weights.
    """

    def detect_raw(self, image: np.ndarray) -> list[RegionResult]:
        try:
            import cv2  # type: ignore
        except ImportError:
            return []

        h, w = image.shape[:2]
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if image.ndim == 3 else image
        _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)

        # Horizontal projection — find dense ink rows (table rows / text blocks)
        hproj = binary.sum(axis=1).astype(float)
        threshold = hproj.max() * 0.05
        in_block = False
        regions: list[RegionResult] = []
        block_start = 0

        for row_idx, val in enumerate(hproj):
            if not in_block and val > threshold:
                in_block = True
                block_start = row_idx
            elif in_block and val <= threshold:
                in_block = False
                block_h = row_idx - block_start
                if block_h < 5:
                    continue
                # Use vertical projection within the strip to guess region type
                strip = binary[block_start:row_idx, :]
                vproj = strip.sum(axis=0).astype(float)
                col_density = (vproj > 0).mean()
                region_type = "TABLE" if col_density > 0.4 else "TEXT_BLOCK"
                if block_start < h * 0.12:
                    region_type = "HEADER"
                regions.append(RegionResult(
                    region_type=region_type,
                    bbox=BBox(0.0, float(block_start), float(w), float(row_idx)),
                    confidence=0.55,
                ))

        return regions


# ---------------------------------------------------------------------------
# Post-processing helpers
# ---------------------------------------------------------------------------

def _nms(regions: list[RegionResult], iou_threshold: float = 0.5) -> list[RegionResult]:
    """Class-agnostic NMS."""
    regions = sorted(regions, key=lambda r: r.confidence, reverse=True)
    keep: list[RegionResult] = []
    for r in regions:
        if all(r.bbox.iou(k.bbox) < iou_threshold for k in keep):
            keep.append(r)
    return keep


def _assign_reading_order(regions: list[RegionResult]) -> list[RegionResult]:
    """Left-to-right, top-to-bottom reading order using a 3-column grid."""
    if not regions:
        return regions
    xs = [r.bbox.x1 for r in regions]
    x_min, x_max = min(xs), max(xs)
    col_width = (x_max - x_min + 1) / 3

    def sort_key(r: RegionResult) -> tuple:
        col = min(2, int((r.bbox.x1 - x_min) / col_width))
        return (col, r.bbox.y1)

    for order, r in enumerate(sorted(regions, key=sort_key)):
        r.reading_order = order
    return regions


def _tag_table_cells(regions: list[RegionResult]) -> list[RegionResult]:
    """Assign row_index / col_index to FIELD_LABEL + FIELD_VALUE pairs."""
    labels = [r for r in regions if r.region_type == "FIELD_LABEL"]
    values = [r for r in regions if r.region_type == "FIELD_VALUE"]

    if not labels:
        return regions

    labels.sort(key=lambda r: (round(r.bbox.y1 / 20), r.bbox.x1))
    row_groups: list[list[RegionResult]] = []
    current_row: list[RegionResult] = []
    prev_y = None
    for lbl in labels:
        if prev_y is None or abs(lbl.bbox.y1 - prev_y) < 25:
            current_row.append(lbl)
        else:
            row_groups.append(current_row)
            current_row = [lbl]
        prev_y = lbl.bbox.y1
    if current_row:
        row_groups.append(current_row)

    for row_idx, row in enumerate(row_groups):
        for col_idx, lbl in enumerate(sorted(row, key=lambda r: r.bbox.x1)):
            lbl.row_index = row_idx
            lbl.col_index = col_idx
            # Match nearest value to the right on the same row
            for val in values:
                if (
                    abs(val.bbox.y1 - lbl.bbox.y1) < 30
                    and val.bbox.x1 >= lbl.bbox.x2
                    and val.row_index is None
                ):
                    val.row_index = row_idx
                    val.col_index = col_idx
                    break

    return regions


# ---------------------------------------------------------------------------
# Main detector
# ---------------------------------------------------------------------------

class LayoutDetector:
    """Detect document layout regions from a BGR ndarray.

    Args:
        backend:        One of "yolo", "detectron2", "heuristic".
        yolo_weights:   Path to .pt weights file.
        d2_config:      Path to Detectron2 config YAML.
        d2_weights:     Path to Detectron2 model weights.
        conf_threshold: Minimum detection confidence.
        iou_threshold:  NMS IoU threshold.
        device:         "cuda" or "cpu".
    """

    def __init__(
        self,
        backend: str = "heuristic",
        yolo_weights: str = "weights/bhumi_layout_yolov8n.pt",
        d2_config: str = "",
        d2_weights: str = "",
        conf_threshold: float = 0.35,
        iou_threshold: float = 0.45,
        device: str = "cpu",
    ):
        self._conf = conf_threshold
        self._iou = iou_threshold
        self._backend_name = backend
        self._backend = self._load_backend(
            backend, yolo_weights, d2_config, d2_weights,
            conf_threshold, iou_threshold, device,
        )

    @classmethod
    def from_config(cls) -> "LayoutDetector":
        """Build from environment variables."""
        return cls(
            backend=os.getenv("LAYOUT_BACKEND", "heuristic"),
            yolo_weights=os.getenv("LAYOUT_YOLO_WEIGHTS", "weights/bhumi_layout_yolov8n.pt"),
            d2_config=os.getenv("LAYOUT_D2_CONFIG", ""),
            d2_weights=os.getenv("LAYOUT_D2_WEIGHTS", ""),
            conf_threshold=float(os.getenv("LAYOUT_CONF", "0.35")),
            iou_threshold=float(os.getenv("LAYOUT_IOU", "0.45")),
            device=os.getenv("LAYOUT_DEVICE", "cpu"),
        )

    @staticmethod
    def _load_backend(
        name: str,
        yolo_weights: str,
        d2_config: str,
        d2_weights: str,
        conf: float,
        iou: float,
        device: str,
    ) -> _Backend:
        if name == "yolo":
            try:
                return _YoloBackend(yolo_weights, conf, iou, device)
            except Exception as exc:
                log.warning("YOLOv8 backend failed (%s), falling back to heuristic", exc)
        elif name == "detectron2":
            try:
                return _Detectron2Backend(d2_config, d2_weights, conf, device)
            except Exception as exc:
                log.warning("Detectron2 backend failed (%s), falling back to heuristic", exc)
        return _HeuristicBackend()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def detect(
        self,
        image: np.ndarray,
        *,
        apply_nms: bool = True,
        assign_order: bool = True,
        tag_cells: bool = True,
    ) -> list[RegionResult]:
        """Detect layout regions in a BGR image.

        Returns list of RegionResult sorted by reading order.
        """
        t0 = time.perf_counter()

        if image is None or image.size == 0:
            return []

        regions = self._backend.detect_raw(image)

        if apply_nms:
            regions = _nms(regions, iou_threshold=self._iou)
        if tag_cells:
            regions = _tag_table_cells(regions)
        if assign_order:
            regions = _assign_reading_order(regions)

        elapsed_ms = (time.perf_counter() - t0) * 1000
        log.debug(
            "Layout detection: %d regions in %.1f ms (backend=%s)",
            len(regions), elapsed_ms, self._backend_name,
        )
        return sorted(regions, key=lambda r: (r.reading_order or 0))

    def detect_batch(self, images: list[np.ndarray]) -> list[list[RegionResult]]:
        """Detect layout regions for a list of images (one page per element)."""
        return [self.detect(img) for img in images]

    def draw(
        self,
        image: np.ndarray,
        regions: list[RegionResult],
        *,
        thickness: int = 2,
        alpha: float = 0.12,
    ) -> np.ndarray:
        """Return a copy of image with region overlays drawn."""
        try:
            import cv2  # type: ignore
        except ImportError:
            return image

        overlay = image.copy()
        out = image.copy()

        for r in regions:
            color = COLORS.get(r.region_type, (128, 128, 128))
            x1, y1, x2, y2 = (int(v) for v in r.bbox.as_xyxy())

            cv2.rectangle(overlay, (x1, y1), (x2, y2), color, -1)
            cv2.rectangle(out, (x1, y1), (x2, y2), color, thickness)

            label = f"{r.region_type} {r.confidence:.2f}"
            (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.45, 1)
            cv2.rectangle(out, (x1, y1 - th - 6), (x1 + tw + 4, y1), color, -1)
            cv2.putText(
                out, label, (x1 + 2, y1 - 4),
                cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1, cv2.LINE_AA,
            )
            if r.reading_order is not None:
                cv2.putText(
                    out, str(r.reading_order),
                    (x1 + 4, y1 + th + 8),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, color, 2, cv2.LINE_AA,
                )

        cv2.addWeighted(overlay, alpha, out, 1 - alpha, 0, out)
        return out

    # ------------------------------------------------------------------
    # Convenience: crop regions from image
    # ------------------------------------------------------------------

    def crop_regions(
        self,
        image: np.ndarray,
        regions: list[RegionResult],
        region_type: Optional[str] = None,
    ) -> list[tuple[RegionResult, np.ndarray]]:
        """Return (region, cropped_image) for each detected region.

        Pass region_type to filter (e.g. "TABLE").
        """
        h, w = image.shape[:2]
        crops: list[tuple[RegionResult, np.ndarray]] = []
        for r in regions:
            if region_type and r.region_type != region_type:
                continue
            x1 = max(0, int(r.bbox.x1))
            y1 = max(0, int(r.bbox.y1))
            x2 = min(w, int(r.bbox.x2))
            y2 = min(h, int(r.bbox.y2))
            crop = image[y1:y2, x1:x2]
            if crop.size > 0:
                crops.append((r, crop))
        return crops
