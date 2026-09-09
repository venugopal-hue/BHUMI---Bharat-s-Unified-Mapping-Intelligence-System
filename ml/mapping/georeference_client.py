"""Applying a fitted georeference transform, available to worker code.

The fitting itself lives in the API (`bhumi.modules.mapping.georeference`),
because that is where operators submit control points. This module holds only
the projection side, so the worker can vectorize a sheet without importing the
web layer.
"""

from __future__ import annotations

from typing import Literal

import numpy as np

TransformKind = Literal["affine", "polynomial2", "similarity"]


def _terms(pixel_x: float, pixel_y: float, kind: TransformKind) -> np.ndarray:
    if kind == "polynomial2":
        return np.array(
            [1, pixel_x, pixel_y, pixel_x * pixel_y, pixel_x**2, pixel_y**2], dtype=float
        )
    return np.array([1, pixel_x, pixel_y], dtype=float)


def apply_transform(
    coefficients: dict[str, list[float]],
    pixel_x: float,
    pixel_y: float,
    kind: TransformKind = "affine",
) -> tuple[float, float]:
    terms = _terms(pixel_x, pixel_y, kind)
    lon = float(np.dot(terms, np.array(coefficients["lon"], dtype=float)))
    lat = float(np.dot(terms, np.array(coefficients["lat"], dtype=float)))
    return lon, lat


def polygon_to_world(
    coefficients: dict[str, list[float]],
    pixel_ring: list[tuple[float, float]],
    kind: TransformKind = "affine",
) -> list[tuple[float, float]]:
    """Project a pixel-space ring to WGS84, closing it if the tracer did not."""
    ring = [apply_transform(coefficients, x, y, kind) for x, y in pixel_ring]
    if ring and ring[0] != ring[-1]:
        ring.append(ring[0])
    return ring
