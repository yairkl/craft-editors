# Content-filled large-file verification

This local Linux x64 test uses generated, disposable fixtures; it does not establish full fidelity or performance for arbitrary real-world documents. Generate them with `python3 scripts/generate-large-fixtures.py <output-directory>`. They contain no private data and are not checked into git.

- **Workbook:** approximately 36.7 MiB XLSX with 30,000 data rows, two 800-character text cells per row, numeric values and formulas. The test opens it in the closed-file agent, changes a cell, saves a copy and reopens that copy; it also opens the original in the editor, checks formula calculation, edits and saves, then verifies the last data row and a formula after reopening.
- **PDF:** approximately 34 MiB with one embedded 3600×3300 RGB image. The test opens it in the closed-file agent and the editor, rotates and saves the page, verifies the image dimensions with `pdfimages`, and reopens it.

Both standalone and combined-extension profiles passed in local VS Code 1.102.0. The workbook open/agent/edit/save/reopen sequence took approximately 11 seconds in each profile; the complete test command's maximum resident set reported by `/usr/bin/time` was 885,124 KiB. The PDF sequence took approximately 3 seconds in each profile. These are single-run measurements of individual process peaks, not aggregate multi-process memory; they depend on hardware and test fixture structure. See [rendering](../rendering.md) for the host's reported hardware and earlier padded-file measurements.

Reproduce on Linux with the development dependencies, built renderers, `python3`, Poppler's `pdfimages`, desktop VS Code and `xvfb-run`:

```sh
python3 scripts/generate-large-fixtures.py /tmp/craft-content-large
CRAFT_TEST_ONLY=spreadsheets CRAFT_TEST_LARGE=1 CRAFT_REAL_XLSX=/tmp/craft-content-large/content-large.xlsx xvfb-run -a npm run test:editing
CRAFT_TEST_ONLY=pdf CRAFT_TEST_LARGE=1 CRAFT_REAL_PDF=/tmp/craft-content-large/content-large.pdf xvfb-run -a npm run test:graphics
```

The 256 MiB default and 1 GiB maximum remain engineering guardrails, not measured compatibility limits. This is not a test of a genuinely complex document at those sizes, nor of Windows, macOS, Cursor, WAN/SSH latency, long edit sessions or aggregate memory. The release workflow runs smaller padded large-file tests; the content-filled tests above are currently manual.
