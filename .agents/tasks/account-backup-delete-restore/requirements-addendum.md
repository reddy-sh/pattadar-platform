# Requirements addendum: archive file naming and restore placement

Added by Reddy on 09/10/2026, after the run started. These requirements carry the same weight as R1–R5. Every later step (design, design review, approval gate, plan, build, reviews, validation, report) must apply them, and the design review blocks if any of them is missing or left unspecified.

Reddy's words: "also the files to be downloaded with same names to be identified with unique code 5 chars in the end so that we dont collide with two same file names. when restore, used the json path to upload or smart fix the folder. keep that in mind, have a smart function please."

## R6: every archived file keeps its name plus a unique 5-character code

- Every file entry in the archive gets the code, not only the ones that clash: its original name with a 5-character code at the end, before the extension. The code is also the restore matching key. Recommended form, matching the product's "Aadhaar · <name>" style: `<original name> · <CODE>.<ext>`, for example `Sale deed 2019 · 7K3QD.pdf`. The designer may pick another readable, portable separator and give the reason.
- The code is Crockford Base32, uppercase only (0–9 and A–Z without I, L, O, U). That makes it safe on case-insensitive file systems and easy to read aloud.
- Uniqueness across the whole archive is guaranteed by construction. There are 32^5 ≈ 33.5 million codes: with 1,000 files the chance of at least one clash is about 1.5%, and with 10,000 files it is about 77%.
  - Derive the code deterministically from the file's stable identity, for example SHA-256 of the storage version ID.
  - Process files in a stable order: creation time, then ID. Existing files then keep their codes across re-exports.
  - On a clash, re-derive with a counter until the code is unique.
- If older versions of a file are exported, each version is its own entry with its own code.
- Sanitizing, for Windows, macOS and Linux:
  - Replace `< > : " / \ | ? *` and control characters. Survey numbers like `45/2B` are common, and a `/` in a name must never create a folder.
  - Strip trailing dots and spaces, normalize to Unicode NFC, and avoid Windows reserved names (CON, PRN, AUX, NUL, COM1–9, LPT1–9).
  - Keep each path segment within 255 bytes of UTF-8. Telugu letters take 3 bytes each, so truncate the base name at a code-point or grapheme boundary while always keeping the code and the extension.
  - Fall back to a sensible name when the result would be empty.
  - Keep the real extension. Derive it from the stored MIME type when it is missing.
  - Set the ZIP UTF-8 filename flag.
- Folders mirror the logical tree (My files → feature → …) with sanitized names. A folder gets a code only when siblings would clash after sanitizing and case-folding, so paths stay readable.
- No archive name or JSON name contains a full Aadhaar number (invariant 8). Apply the same guard the upload path uses.
- For every file, the JSON records:
  - `code`, `archive_path` (the exact ZIP entry name) and `original_name` (exact, unsanitized).
  - `folder_path`: an ordered list of segments, each with its original name and its stable folder ID or feature key. The root is the feature folder, for example `aadhaar`.
  - The record it belongs to: type plus archive-local ID.
  - `mime_type`, `size`, `sha256`, and version and date metadata.
- The human-readable summary lists each file's archive name next to its original name.

## R7: restore places files using the JSON path, with a smart folder fix

- Placement never comes from the ZIP entry path or name. It comes from the JSON: the original folder path, the original name and the linked record. The restored file gets its exact `original_name` back. The code and the sanitizing exist only inside the archive. Never rebuild a name by stripping a suffix with a regex.
- Match archive entries to JSON records in this order:
  1. The exact `archive_path`.
  2. The 5-character code at the end of the entry name. This covers files the user renamed or moved after extracting and then re-zipped.
  3. SHA-256 against the manifest.

  However an entry is matched, its content must match the manifest hash: path-tolerant, content-strict. If archives are signed (D9), the signature covers the JSON and the manifest, not the ZIP container, so re-zipping does not break it. Unmatched entries, and JSON records whose file is missing, are listed in the import report.
- Smart folder fix, for when the JSON path cannot be used as it is:
  - Re-create missing folders along the path idempotently. Reuse an existing folder with the same name under the same parent rather than making "Deeds (2)". New folders get new node IDs (invariant 5) and are authorized in SQL.
  - The root must resolve to a known feature folder (invariant 8). If the root is unknown, renamed or missing, infer the feature from the linked record type: an Aadhaar card goes to Aadhaar, a deed to its property, and so on. Never create a loose root file or a per-member top-level folder.
  - If the linked record was not restored, place the file in the closest valid spot under its feature folder and note it in the report.
  - Never overwrite. On re-import, a file that was already restored (same identity/code and SHA-256) is skipped. A different file with the same name at the destination gets a disambiguated name, and the report lists it.
  - JSON names and folder segments are untrusted. They get the same validation as normal uploads and folder creation:
    - length and character rules
    - no `.`, `..`, empty or absolute segments
    - caps on depth and on the number of folders created
    - the Aadhaar-number guard

    Storage keys are never derived from names; they stay `{node}/{version}`.
  - If no valid place can be inferred, reject that file with a clear report entry. A fallback root folder (for example "Restored from backup") would touch invariant 8, so it is a reserved decision for Reddy (D14), not an agent choice.

## R8: one smart, pure module for both directions

- Make one small, deterministic module the single source of truth, for example `archive_entry_name(...)` for export and `resolve_restore_placement(...)` for import. Keep I/O out of its core; database and storage effects belong to the callers. Document the rules in its docstring.
- If the web needs the same logic, for example to preview an archive before import, do not copy it by hand. Call the server, or share generated test vectors between the implementations.
- Unit tests cover at least:
  - Naming:
    - same name in the same folder
    - names differing only in case
    - same name in different folders
    - more than 1,000 files with forced code clashes, proving the codes stay unique and deterministic
  - Hard characters and edge-case names:
    - `/` (`45/2B`), `\`, `:`, `?`, `*`, quotes and control characters
    - trailing dots or spaces
    - Windows reserved names
    - Telugu names (NFC vs NFD) and truncation that keeps the code and the extension
    - no extension, several dots, or a name already ending in something code-like
    - empty or dot-only names
    - Aadhaar-like digits in a name
  - Restore:
    - an entry renamed (matched by code)
    - an entry renamed with the code removed (matched by hash)
    - an entry moved to another folder
    - a missing or unknown feature root
    - a missing linked record
    - an existing same-name file
    - re-import idempotency
    - a hash mismatch, which is rejected
    - traversal-like JSON paths
- The validation gate's round-trip fixture includes at least: two same-named files in one folder, a pair that differs only in case, a Telugu-named file, and a survey-number name with `/`. The gate must prove:
  - The archive extracts with every file side by side and nothing overwritten, using both `unzip` and `ditto -x -k` on this Mac's case-insensitive APFS. Extract into a temporary directory and remove it afterwards.
  - After restore, every file is back in its original folder with its exact original name (no code) and is byte-identical.
  - A re-zipped archive with renamed entries still restores correctly.

## R9: page lead copy (Reddy, 09/10/2026)

- The "Privacy & your data" page (`apps/web/src/pages/AccountDataPage.tsx`) opens its body with the bold line "Your data, your rights.", followed by one plain sentence saying what the page lets the user do. The line is already in the file (added inline on 09/10/2026). Keep it when the page is rebuilt.
- Don't add "full" or any other absolute claim. Reddy first proposed "your data you have full rights". "Full" was dropped because the same page has to list what the law makes us keep and how long backup copies last, and the copy must not contradict itself.
- As features land, update the sentence after the lead so it only names what actually works. For example, mention restore only once import is implemented and verified.
