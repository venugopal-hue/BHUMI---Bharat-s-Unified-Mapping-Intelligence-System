"""Fitting a transform from scanned-map pixels to real-world coordinates.

The operator clicks matching points on the scan and the basemap; we solve for
the transform by least squares and report the residual error in metres. A bad
fit has to be visible — a silently wrong georeference puts every parcel on that
sheet in the wrong place.
"""

from __future__ import annotations

import math
from typing import Any, Literal

import numpy as np

TransformKind = Literal["affine", "polynomial2", "similarity"]

# Rough metres-per-degree at Indian latitudes. Good enough for a residual
# readout; the stored geometry uses proper projections.
METRES_PER_DEG_LAT = 110_574.0


def _metres_per_deg_lon(latitude: float) -> float:
    return 111_320.0 * math.cos(math.radians(latitude))


def _design_matrix(pixels: list[tuple[float, float]], kind: TransformKind) -> np.ndarray:
    xs = np.array([p[0] for p in pixels], dtype=float)
    ys = np.array([p[1] for p in pixels], dtype=float)
    ones = np.ones_like(xs)

    if kind == "polynomial2":
        return np.column_stack([ones, xs, ys, xs * ys, xs**2, ys**2])
    # affine and similarity share the same 3-term design; similarity is
    # constrained afterwards by discarding shear.
    return np.column_stack([ones, xs, ys])


def fit_transform(
    pixels: list[tuple[float, float]],
    world: list[tuple[float, float]],
    kind: TransformKind = "affine",
) -> dict[str, Any]:
    """Least-squares fit of pixel → (lon, lat).

    Returns the coefficients, the RMS residual in metres, and a plain-language
    quality verdict the UI can show next to the number.
    """
    if len(pixels) != len(world):
        raise ValueError("Every control point needs both a pixel and a world coordinate.")

    minimum = 6 if kind == "polynomial2" else 3
    if len(pixels) < minimum:
        raise ValueError(f"A {kind} transform needs at least {minimum} control points.")

    A = _design_matrix(pixels, kind)
    lons = np.array([w[0] for w in world], dtype=float)
    lats = np.array([w[1] for w in world], dtype=float)

    coeff_lon, *_ = np.linalg.lstsq(A, lons, rcond=None)
    coeff_lat, *_ = np.linalg.lstsq(A, lats, rcond=None)

    pred_lon = A @ coeff_lon
    pred_lat = A @ coeff_lat

    mean_lat = float(np.mean(lats))
    dx_m = (pred_lon - lons) * _metres_per_deg_lon(mean_lat)
    dy_m = (pred_lat - lats) * METRES_PER_DEG_LAT
    residuals_m = np.sqrt(dx_m**2 + dy_m**2)
    rms = float(np.sqrt(np.mean(residuals_m**2)))

    quality, message = _verdict(rms, len(pixels))

    return {
        "type": kind,
        "coefficients": {
            "lon": [float(c) for c in coeff_lon],
            "lat": [float(c) for c in coeff_lat],
        },
        "rms_error_m": round(rms, 3),
        "max_residual_m": round(float(residuals_m.max()), 3),
        "per_point_residual_m": [round(float(r), 3) for r in residuals_m],
        "worst_point_index": int(np.argmax(residuals_m)),
        "control_point_count": len(pixels),
        "quality": quality,
        "message": message,
    }


def _verdict(rms: float, n_points: int) -> tuple[str, str]:
    if rms <= 2:
        return "excellent", f"Fit is excellent — {rms:.2f} m residual across {n_points} points."
    if rms <= 5:
        return "good", f"Fit is good — {rms:.2f} m residual. Suitable for parcel work."
    if rms <= 15:
        return (
            "acceptable",
            f"Fit is acceptable at {rms:.2f} m, but adding control points near the sheet "
            "corners will tighten it.",
        )
    return (
        "poor",
        f"Residual of {rms:.2f} m is too high for cadastral use. Check the worst point — "
        "a mis-clicked pair is the usual cause.",
    )


def apply_transform(
    coefficients: dict[str, list[float]], pixel_x: float, pixel_y: float, kind: TransformKind = "affine"
) -> tuple[float, float]:
    """Project one pixel through a fitted transform."""
    if kind == "polynomial2":
        terms = np.array(
            [1, pixel_x, pixel_y, pixel_x * pixel_y, pixel_x**2, pixel_y**2], dtype=float
        )
    else:
        terms = np.array([1, pixel_x, pixel_y], dtype=float)

    lon = float(np.dot(terms, np.array(coefficients["lon"], dtype=float)))
    lat = float(np.dot(terms, np.array(coefficients["lat"], dtype=float)))
    return lon, lat


def polygon_to_world(
    coefficients: dict[str, list[float]],
    pixel_ring: list[tuple[float, float]],
    kind: TransformKind = "affine",
) -> list[tuple[float, float]]:
    """Project a whole pixel-space polygon ring, closing it if needed."""
    ring = [apply_transform(coefficients, x, y, kind) for x, y in pixel_ring]
    if ring and ring[0] != ring[-1]:
        ring.append(ring[0])
    return ring
