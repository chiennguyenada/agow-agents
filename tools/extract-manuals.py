#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
extract-manuals.py
Batch extract text from B&R X20 PDF manuals.

Output:
  manuals-extracted/text/{MODULE}.txt    ? full text for each module
  manuals-extracted/manual-index.json   ? maps module name ? source PDF info

Handles:
  - Single-module files: X20AI1744-ENG_V4.29.pdf ? X20AI1744.txt
  - Family files: X20CPx48x-ENG.pdf ? X20CP1483.txt ... X20CP3486.txt (shared text)
  - Coated variants: X20cDO9322 recorded as alias only (same text as X20DO9322)
  - Duplicate files (multiple versions): keep latest version by filename sort

Usage:
  python extract-manuals.py                          # default: manual/X20 ? manuals-extracted/text
  python extract-manuals.py --input manual/X20       # explicit input dir
  python extract-manuals.py --dry-run                # scan only, no files written
  python extract-manuals.py --file X20AI1744-ENG.pdf # process single file (test)
"""

import os
import re
import sys
import json
import argparse
from pathlib import Path
from collections import defaultdict

try:
    import fitz  # PyMuPDF
except ImportError:
    print("? PyMuPDF not installed. Run: pip install pymupdf")
    sys.exit(1)

# ?? Config ????????????????????????????????????????????????????????????????????

SCRIPT_DIR   = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent
INPUT_DIR    = PROJECT_ROOT / "manual" / "X20"
OUTPUT_DIR   = PROJECT_ROOT / "manuals-extracted" / "text"
INDEX_FILE   = PROJECT_ROOT / "manuals-extracted" / "manual-index.json"

# Module number pattern: X20 + letters + digits, handles:
# X20AI1744, X20CP3485, X20BC0083, X20IF10D3-1, X20TB06, X20SM1426, X20IF10E3-1
MODULE_PATTERN = re.compile(r'\bX20[A-Z]{1,4}\d{1,2}[A-Z]?\d{1,4}(?:-\d)?\b')

# Coated variant: X20c + same suffix (e.g. X20cDO9322 = coated X20DO9322)
COATED_PATTERN = re.compile(r'\bX20c([A-Z]{1,4}\d{1,2}[A-Z]?\d{1,4}(?:-\d)?)\b')

# Family file pattern: filename contains lowercase x as wildcard (e.g. X20CPx48x)
# After normalizing, collect actual model numbers from PDF text
FAMILY_INDICATOR = re.compile(r'X20[A-Z]{1,4}[x\d]{1,2}[A-Z\d]{1,3}[x\d]', re.IGNORECASE)

# ?? Utilities ?????????????????????????????????????????????????????????????????

def normalize_filename_to_module(filename: str) -> str | None:
    """
    Extract base module name from PDF filename.
    Examples:
      X20AI1744-ENG_V4.29.pdf    ? X20AI1744
      X20AI1744-3-ENG_V4.15.pdf ? X20AI1744-3
      X20CPx48x-ENG.pdf         ? None (family file ? needs text scan)
      X20TB06__X20TB12-ENG.pdf  ? None (multi-module file ? needs text scan)
      X20CM1941-ENG_V3.10.pdf   ? X20CM1941
    """
    stem = Path(filename).stem  # remove .pdf
    # Remove version suffix: _V1.23, _V4.29, -ENG, -en, _en, _ENG, _Eng
    stem = re.sub(r'[-_](ENG|en|Eng|v\d).*$', '', stem, flags=re.IGNORECASE)
    stem = re.sub(r'[-_][Vv]\d+\.\d+.*$', '', stem)

    # Check if result looks like a valid single module name
    if MODULE_PATTERN.fullmatch(stem):
        return stem

    # Some files have suffix like -3: X20AI1744-3
    m = re.match(r'^(X20[A-Z]{1,4}\d{3,5}-\d)$', stem)
    if m:
        return m.group(1)

    # Filename contains lowercase x (family) or double module (TB06__TB12)
    return None


def extract_all_modules_from_text(text: str) -> set[str]:
    """Find all X20 module numbers mentioned in extracted text."""
    found = set(MODULE_PATTERN.findall(text))
    # Remove overly generic hits like X20CP1483-1 (variant suffix) ? keep base
    cleaned = set()
    for m in found:
        cleaned.add(m)
    return cleaned


def extract_coated_aliases(text: str) -> dict[str, str]:
    """
    Find coated variants (X20cXXXX) and map them to base module.
    Returns: {coated_name: base_module_name}
    """
    aliases = {}
    for m in COATED_PATTERN.finditer(text):
        coated_name = "X20c" + m.group(1)
        base_name   = "X20"  + m.group(1)
        aliases[coated_name] = base_name
    return aliases


def extract_text_from_pdf(pdf_path: Path) -> str:
    """Extract all text from a PDF. Returns empty string on failure."""
    try:
        doc  = fitz.open(str(pdf_path))
        pages = []
        for page in doc:
            pages.append(page.get_text())
        doc.close()
        return "\n".join(pages)
    except Exception as e:
        print(f"  [WARN]  Failed to read {pdf_path.name}: {e}")
        return ""


def pick_best_version(pdf_files: list[Path]) -> Path:
    """
    When multiple PDFs map to the same module (different versions),
    pick the latest by filename (version number is usually last segment).
    E.g.: X20CM1941.pdf vs X20CM1941-ENG_V3.10.pdf ? keep -ENG_V3.10
    """
    # Sort by version: extract version number if present
    def version_key(p: Path) -> tuple:
        m = re.search(r'[Vv](\d+)\.(\d+)', p.stem)
        if m:
            return (int(m.group(1)), int(m.group(2)))
        return (0, 0)

    return sorted(pdf_files, key=version_key, reverse=True)[0]


# ?? Main processing ???????????????????????????????????????????????????????????

def process_all(input_dir: Path, output_dir: Path, index_file: Path,
                dry_run: bool = False, single_file: str = None) -> None:

    # Collect PDFs
    all_pdfs = sorted(input_dir.glob("*.pdf"))
    if single_file:
        all_pdfs = [p for p in all_pdfs if p.name == single_file]
        if not all_pdfs:
            print(f"? File not found: {single_file}")
            sys.exit(1)

    print(f"[DIR] Input:  {input_dir}")
    print(f"[OUT] Output: {output_dir}")
    print(f"[PDF] PDFs found: {len(all_pdfs)}")
    print()

    if not dry_run:
        output_dir.mkdir(parents=True, exist_ok=True)
        index_file.parent.mkdir(parents=True, exist_ok=True)

    # ?? Pass 1: categorize files ??????????????????????????????????????????????
    # module_name ? [list of pdf paths] (may have duplicates from diff versions)
    module_to_pdfs: dict[str, list[Path]] = defaultdict(list)
    family_files: list[Path] = []  # needs text scan to find models

    for pdf in all_pdfs:
        module = normalize_filename_to_module(pdf.name)
        if module:
            module_to_pdfs[module].append(pdf)
        else:
            family_files.append(pdf)

    print(f"[OK] Single-module files: {sum(len(v) for v in module_to_pdfs.values())}")
    print(f"[SCAN] Family/multi-module files: {len(family_files)}")
    print()

    # Index structure
    index = {}   # module_name ? {file, source_pdf, is_family, coated_alias_of}
    stats = {"extracted": 0, "skipped": 0, "family_modules": 0, "coated_aliases": 0}

    # ?? Pass 2: single-module files ???????????????????????????????????????????
    print("=== Single-module files ===")
    for module, pdfs in sorted(module_to_pdfs.items()):
        best_pdf = pick_best_version(pdfs)
        if len(pdfs) > 1:
            skipped = [p.name for p in pdfs if p != best_pdf]
            print(f"  [dup]  {module}: multiple versions ? using {best_pdf.name} (skip: {', '.join(skipped)})")

        text = extract_text_from_pdf(best_pdf)
        if not text.strip():
            print(f"  [WARN]  {module}: empty text, skipping")
            stats["skipped"] += 1
            continue

        # Find coated aliases mentioned in this file's text
        coated = extract_coated_aliases(text)

        out_path = output_dir / f"{module}.txt"
        if not dry_run:
            out_path.write_text(text, encoding="utf-8")

        index[module] = {
            "source_pdf":   best_pdf.name,
            "is_family":    False,
            "family_covers": [],
            "coated_alias_of": None,
        }
        stats["extracted"] += 1

        # Register coated variants as alias entries
        for coated_name, base in coated.items():
            if base == module and coated_name not in index:
                index[coated_name] = {
                    "source_pdf":   best_pdf.name,
                    "is_family":    False,
                    "family_covers": [],
                    "coated_alias_of": module,
                    "note": f"Coated variant of {module} ? identical specs, no separate .txt"
                }
                stats["coated_aliases"] += 1
                print(f"  [alias]  Coated alias: {coated_name} ? {module}")

        print(f"  [OK] {module} ({len(text):,} chars) ? {best_pdf.name}")

    # ?? Pass 3: family / multi-module files ???????????????????????????????????
    print()
    print("=== Family / multi-module files ===")
    for pdf in family_files:
        print(f"\n  [read] Scanning: {pdf.name}")
        text = extract_text_from_pdf(pdf)
        if not text.strip():
            print(f"  [WARN]  Empty text, skipping")
            stats["skipped"] += 1
            continue

        found_modules = extract_all_modules_from_text(text)
        coated = extract_coated_aliases(text)

        if not found_modules:
            print(f"  [WARN]  No module numbers found in text ? saving as {pdf.stem}.txt")
            module_name = re.sub(r'[-_](ENG|en|Eng).*$', '', pdf.stem, flags=re.IGNORECASE)
            module_name = re.sub(r'[-_][Vv]\d+.*$', '', module_name)
            out_path = output_dir / f"{module_name}.txt"
            if not dry_run:
                out_path.write_text(text, encoding="utf-8")
            index[module_name] = {
                "source_pdf":   pdf.name,
                "is_family":    True,
                "family_covers": [],
                "coated_alias_of": None,
            }
            stats["extracted"] += 1
            continue

        print(f"  [found] Found {len(found_modules)} modules: {', '.join(sorted(found_modules))}")

        # Save SHARED text for each module found (all point to same content)
        for module in sorted(found_modules):
            # Skip if already extracted from a dedicated single-module file
            if module in index and not index[module]["is_family"]:
                print(f"     [skip]  {module}: already extracted from dedicated file, skipping")
                continue

            out_path = output_dir / f"{module}.txt"
            if not dry_run:
                out_path.write_text(text, encoding="utf-8")

            index[module] = {
                "source_pdf":    pdf.name,
                "is_family":     True,
                "family_covers": sorted(found_modules),
                "coated_alias_of": None,
            }
            stats["extracted"] += 1
            stats["family_modules"] += 1
            print(f"     [OK] {module}.txt")

        # Coated aliases from family file
        for coated_name, base in coated.items():
            if base in found_modules and coated_name not in index:
                index[coated_name] = {
                    "source_pdf":   pdf.name,
                    "is_family":    True,
                    "family_covers": sorted(found_modules),
                    "coated_alias_of": base,
                    "note": f"Coated variant of {base} ? identical specs, no separate .txt"
                }
                stats["coated_aliases"] += 1
                print(f"     [alias]  Coated alias: {coated_name} ? {base}")

    # ?? Write index ???????????????????????????????????????????????????????????
    if not dry_run:
        index_file.write_text(
            json.dumps(index, indent=2, ensure_ascii=False),
            encoding="utf-8"
        )
        print(f"\n[idx] Index written: {index_file} ({len(index)} entries)")

    # ?? Summary ???????????????????????????????????????????????????????????????
    print()
    print("=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print(f"  .txt files written  : {stats['extracted']}")
    print(f"    of which family   : {stats['family_modules']}")
    print(f"  Coated aliases      : {stats['coated_aliases']} (in index only, no .txt)")
    print(f"  Skipped (empty)     : {stats['skipped']}")
    print(f"  Total index entries : {len(index)}")
    if dry_run:
        print()
        print("  [WARN]  DRY-RUN: no files written")
    print()
    print(f"Output directory: {output_dir}")
    print(f"Index file:       {index_file}")


# ?? Entry point ???????????????????????????????????????????????????????????????

def main():
    parser = argparse.ArgumentParser(
        description="Extract text from B&R X20 PDF manuals"
    )
    parser.add_argument("--input",    default=str(INPUT_DIR),
                        help=f"PDF input directory (default: {INPUT_DIR})")
    parser.add_argument("--output",   default=str(OUTPUT_DIR),
                        help=f"Text output directory (default: {OUTPUT_DIR})")
    parser.add_argument("--dry-run",  action="store_true",
                        help="Scan and report only, do not write files")
    parser.add_argument("--file",     default=None,
                        help="Process a single PDF file (for testing)")
    args = parser.parse_args()

    process_all(
        input_dir  = Path(args.input),
        output_dir = Path(args.output),
        index_file = Path(args.output).parent / "manual-index.json",
        dry_run    = args.dry_run,
        single_file= args.file,
    )


if __name__ == "__main__":
    main()
