"""CLI entry-point for the BHUMI synthetic data generator.

Usage:
    python -m tools.synthgen.generate --count 500 --out-dir data/synth --langs hi kn te
    python -m tools.synthgen.generate --count 100 --split 0.8 --format JPEG
    python -m tools.synthgen.generate --count 50 --no-degrade  # clean renders

Output structure:
    <out-dir>/
      images/   *.png (or .jpg)
      labels/   *.json   (COCO-style bounding boxes + field annotations)
      records/  *.json   (raw field dict — ground truth for extraction model)
      manifest.jsonl     (one line per sample with all metadata)
      split_train.txt
      split_val.txt
"""

from __future__ import annotations

import argparse
import json
import random
import sys
import time
import uuid
from pathlib import Path

from tools.synthgen.data import (
    DOC_TYPES,
    LAND_TYPES,
    SOIL_TYPES,
    IRRIGATION,
    random_name,
    random_location,
    random_survey_number,
    random_area,
    random_date,
    random_mutation_number,
)
from tools.synthgen.renderer import RecordRenderer


# ---------------------------------------------------------------------------
# Record factory
# ---------------------------------------------------------------------------

def make_record(lang: str = "hi") -> dict:
    state, district, tehsil, village = random_location(lang)
    owner_name = random_name(lang)
    father_name = random_name(lang)
    plot_area, area_unit = random_area()
    survey_no = random_survey_number()

    return {
        "id": str(uuid.uuid4()),
        "language": lang,
        "document_type": random.choice(DOC_TYPES),
        "record_year": random.randint(1990, 2025),
        "state": state,
        "district": district,
        "tehsil": tehsil,
        "village": village,
        "owner_name": owner_name,
        "father_name": father_name,
        "survey_number": survey_no,
        "khasra_number": random_survey_number(),
        "khata_number": str(random.randint(1, 9999)),
        "plot_area": plot_area,
        "area_unit": area_unit,
        "land_classification": random.choice(LAND_TYPES),
        "soil_type": random.choice(SOIL_TYPES),
        "irrigation_source": random.choice(IRRIGATION),
        "mutation_number": random_mutation_number(),
        "mutation_date": random_date(),
    }


# ---------------------------------------------------------------------------
# Main generation loop
# ---------------------------------------------------------------------------

def generate(
    count: int,
    out_dir: Path,
    langs: list[str],
    split: float,
    fmt: str,
    degrade: bool,
    seed: int,
) -> None:
    random.seed(seed)

    (out_dir / "images").mkdir(parents=True, exist_ok=True)
    (out_dir / "labels").mkdir(parents=True, exist_ok=True)
    (out_dir / "records").mkdir(parents=True, exist_ok=True)

    renderer = RecordRenderer(degrade=degrade)
    manifest_path = out_dir / "manifest.jsonl"
    ids: list[str] = []

    t0 = time.perf_counter()
    with open(manifest_path, "w", encoding="utf-8") as mf:
        for i in range(count):
            lang = random.choice(langs)
            record = make_record(lang)
            sample_id = record["id"]
            ids.append(sample_id)

            ext = fmt.lower().replace("jpeg", "jpg")
            img_path = out_dir / "images" / f"{sample_id}.{ext}"
            rec_path = out_dir / "records" / f"{sample_id}.json"
            lbl_path = out_dir / "labels" / f"{sample_id}.json"

            # Render image
            img_bytes = renderer.render_to_bytes(record, fmt=fmt)
            img_path.write_bytes(img_bytes)

            # Ground-truth record
            rec_path.write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8")

            # Minimal label (field presence annotations for training classifier)
            label = {
                "id": sample_id,
                "image": str(img_path.name),
                "language": lang,
                "document_type": record["document_type"],
                "fields": {k: v for k, v in record.items() if k not in ("id", "language")},
            }
            lbl_path.write_text(json.dumps(label, ensure_ascii=False, indent=2), encoding="utf-8")

            # Manifest row
            mf.write(json.dumps({
                "id": sample_id,
                "image": f"images/{sample_id}.{ext}",
                "record": f"records/{sample_id}.json",
                "label": f"labels/{sample_id}.json",
                "language": lang,
                "document_type": record["document_type"],
                "state": record["state"],
                "district": record["district"],
            }, ensure_ascii=False) + "\n")

            if (i + 1) % 50 == 0 or i == count - 1:
                elapsed = time.perf_counter() - t0
                rate = (i + 1) / elapsed
                remaining = (count - i - 1) / rate if rate > 0 else 0
                print(f"  {i+1}/{count}  ({rate:.1f}/s  ETA {remaining:.0f}s)", flush=True)

    # Train / val split
    random.shuffle(ids)
    n_train = int(len(ids) * split)
    train_ids, val_ids = ids[:n_train], ids[n_train:]

    (out_dir / "split_train.txt").write_text("\n".join(train_ids), encoding="utf-8")
    (out_dir / "split_val.txt").write_text("\n".join(val_ids), encoding="utf-8")

    elapsed_total = time.perf_counter() - t0
    print(f"\nDone: {count} images in {elapsed_total:.1f}s")
    print(f"  Train: {len(train_ids)}  Val: {len(val_ids)}")
    print(f"  Output: {out_dir.resolve()}")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def _parse() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="BHUMI synthetic land-record image generator",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    p.add_argument("--count", type=int, default=100, help="Number of images to generate")
    p.add_argument("--out-dir", type=Path, default=Path("data/synth"), help="Output directory")
    p.add_argument(
        "--langs", nargs="+",
        default=["hi", "kn", "te", "ta", "pa", "mr"],
        help="Language codes to sample from",
    )
    p.add_argument("--split", type=float, default=0.8, help="Train fraction (remainder = val)")
    p.add_argument("--format", choices=["PNG", "JPEG"], default="PNG", help="Image format")
    p.add_argument("--no-degrade", action="store_true", help="Skip degradation pipeline (clean renders)")
    p.add_argument("--seed", type=int, default=42, help="Random seed")
    return p.parse_args()


if __name__ == "__main__":
    args = _parse()
    print(f"Generating {args.count} synthetic records → {args.out_dir}")
    print(f"  langs={args.langs}  split={args.split}  format={args.format}  degrade={not args.no_degrade}")
    generate(
        count=args.count,
        out_dir=args.out_dir,
        langs=args.langs,
        split=args.split,
        fmt=args.format,
        degrade=not args.no_degrade,
        seed=args.seed,
    )
