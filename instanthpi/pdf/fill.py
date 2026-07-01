#!/usr/bin/env python3
"""
instanthpi/pdf/fill.py

Fill an existing blank PDF's AcroForm fields using PyMuPDF (fitz), given a
field-name-to-value mapping. Meant for forms a physician receives from a
third party (insurer forms, requisition templates, referral forms) that
already have fillable fields -- as opposed to pdf/generate.cjs, which builds
a brand-new fillable PDF from scratch.

No real signature image ships with this project. `fill_pdf_fields()` accepts
an optional `signature_image_path` + `signature_field_name`; if you don't
pass them (or the file doesn't exist), the matching field/area is left blank
and signing remains an explicit manual step, same as generate.cjs. Never
commit a real signature image to this repository -- point
SIGNATURE_IMAGE_PATH at a private, local, un-tracked file only.

Usage:
    python fill.py list-fields <input.pdf>
    python fill.py fill <input.pdf> <output.pdf> <field_values.json> \
        [--signature-image PATH] [--signature-field FIELD_NAME]

Where field_values.json is a plain JSON object mapping AcroForm field names
to the values to write, e.g.:

    {
      "patientName": "Jane Example",
      "reasonForReferral": "Sample referral text",
      "dateOfBirth": {"__comb_date__": "1990-01-01"}
    }

Wrap a value as {"__comb_date__": "<any recognizable date>"} to have this
script normalize it into the 8-digit YYYYMMDD string a comb-style date field
expects (one character per cell) via format_comb_date().
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

try:
    import fitz  # PyMuPDF
except ImportError as exc:  # pragma: no cover - environment check, not logic
    raise SystemExit(
        "PyMuPDF is required for instanthpi/pdf/fill.py. Install it with:\n"
        "    pip install pymupdf\n"
        "(see instanthpi/pdf/requirements.txt)"
    ) from exc


def format_comb_date(value: str) -> str:
    """Normalize a date into the fixed-width digit string a PDF comb field
    expects: 8 characters, 'YYYYMMDD', no separators -- one digit per comb
    cell.

    Accepts common separated formats ('1990-01-01', '1990/01/01',
    '01-01-1990' is NOT auto-detected as day-first; always pass ISO
    year-first strings to avoid ambiguity) as well as an already-bare
    8-digit string.

    Raises ValueError if the result isn't exactly 8 digits, since a comb
    field with the wrong length will render incorrectly (cells left over or
    digits overflowing the last cell).
    """
    if value is None:
        raise ValueError("format_comb_date() received None")
    digits = re.sub(r"\D", "", str(value))
    if len(digits) != 8:
        raise ValueError(
            f"format_comb_date(): expected a date that normalizes to 8 digits "
            f"(YYYYMMDD), got {value!r} -> {digits!r} ({len(digits)} digits). "
            "Pass an ISO 'YYYY-MM-DD' string to avoid ambiguity."
        )
    return digits


def _resolve_field_values(raw_values: dict) -> dict:
    """Apply the {"__comb_date__": ...} convention documented above."""
    resolved = {}
    for key, val in raw_values.items():
        if isinstance(val, dict) and "__comb_date__" in val:
            resolved[key] = format_comb_date(val["__comb_date__"])
        else:
            resolved[key] = val
    return resolved


def list_fields(input_path: str) -> None:
    """Print every AcroForm field name/type/rect found in a PDF, so a
    self-hoster can discover the exact field names to use in a field_values
    mapping before calling fill_pdf_fields()."""
    doc = fitz.open(input_path)
    try:
        found_any = False
        for page_index, page in enumerate(doc):
            for widget in page.widgets() or []:
                found_any = True
                print(
                    f"page {page_index}: name={widget.field_name!r} "
                    f"type={widget.field_type_string} rect={tuple(widget.rect)}"
                )
        if not found_any:
            print("No AcroForm fields found in this PDF.", file=sys.stderr)
    finally:
        doc.close()


def fill_pdf_fields(
    input_path: str,
    output_path: str,
    field_values: dict,
    signature_image_path: str | None = None,
    signature_field_name: str | None = None,
) -> dict:
    """Fill AcroForm text/choice fields on input_path and write output_path.

    field_values: mapping of AcroForm field name -> value to write. Values
    are converted to strings for text fields. Use the {"__comb_date__": ...}
    convention (resolved by the CLI, or call format_comb_date() yourself) for
    comb-style date fields.

    signature_image_path / signature_field_name: if both are given and the
    image file exists, the image is stamped into the rectangle of the widget
    named signature_field_name. If the file is missing, that field is left
    blank and a note is printed -- signing remains a manual step, this
    function never fabricates a signature.

    Returns {"filled": [...], "skipped": [...]} -- field names in
    field_values that had (or didn't have) a matching widget on the form,
    so a caller can detect a typo'd field name.
    """
    doc = fitz.open(input_path)
    filled = set()
    try:
        for page in doc:
            for widget in page.widgets() or []:
                name = widget.field_name
                if name in field_values:
                    value = field_values[name]
                    widget.field_value = "" if value is None else str(value)
                    widget.update()
                    filled.add(name)
                if (
                    signature_field_name
                    and name == signature_field_name
                    and signature_image_path
                ):
                    if Path(signature_image_path).exists():
                        page.insert_image(widget.rect, filename=signature_image_path)
                    else:
                        print(
                            f"NOTE: signature_image_path {signature_image_path!r} not "
                            f"found; leaving field {name!r} blank for manual signature.",
                            file=sys.stderr,
                        )
        skipped = sorted(set(field_values) - filled)
        if skipped:
            print(
                f"WARNING: these field_values had no matching AcroForm field "
                f"and were skipped: {skipped}",
                file=sys.stderr,
            )
        doc.save(output_path)
    finally:
        doc.close()
    return {"filled": sorted(filled), "skipped": skipped}


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Fill an existing PDF's AcroForm fields (PyMuPDF/fitz)."
    )
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_list = sub.add_parser("list-fields", help="Print AcroForm field names in a PDF")
    p_list.add_argument("input_pdf")

    p_fill = sub.add_parser("fill", help="Fill fields from a JSON mapping and save a new PDF")
    p_fill.add_argument("input_pdf")
    p_fill.add_argument("output_pdf")
    p_fill.add_argument(
        "field_values_json",
        help='Path to a JSON file: {"fieldName": "value", ...}',
    )
    p_fill.add_argument(
        "--signature-image",
        default=None,
        help=(
            "Path to the physician's own signature image (never checked into "
            "git -- see .gitignore). Leave unset to sign the printed/exported "
            "PDF by hand instead."
        ),
    )
    p_fill.add_argument(
        "--signature-field",
        default=None,
        help="AcroForm field/widget name marking where the signature image should be placed.",
    )

    args = parser.parse_args()

    if args.cmd == "list-fields":
        list_fields(args.input_pdf)
    elif args.cmd == "fill":
        with open(args.field_values_json, "r", encoding="utf-8") as fh:
            raw_values = json.load(fh)
        field_values = _resolve_field_values(raw_values)
        result = fill_pdf_fields(
            args.input_pdf,
            args.output_pdf,
            field_values,
            signature_image_path=args.signature_image,
            signature_field_name=args.signature_field,
        )
        print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
