# Initial implementation plan

Status: native XLSX/DOCX/PPTX editing and read-only PDF rendering implemented; broader release gates remain open. Updated: 2026-10-25.

See [editing lifecycle](editing.md) for native UI, Save/Save As, undo/redo, Revert and recovery, and [rendering](rendering.md) for independent engines.


## Current implementation

Independent Craft Spreadsheets, Craft Word, Craft PowerPoint and Craft PDF extensions register default editors (editable XLSX/DOCX/PPTX, read-only PDF) and optional per-format transport probes. Their common host is maintained once and bundled into each package; neither requires the other. Actual GridCraft grid rendering and PdfCraft page rasterization run as WASM inside VS Code. Generated styled/multi-sheet and multi-page fixtures pass navigation, zoom/resize, source-preservation, malformed-input and non-file URI tests. Native spreadsheet input/persistence are covered by the editing suite; DOCX/PPTX round trips and recovery are covered by the Office suite. Captured output was visually inspected. See [rendering validation](rendering.md) and [independent packaging](packaging.md).

GridCraft and PdfCraft source revisions are pinned in `upstream/manifest.json`. Rust 1.95.0, wasm-bindgen 0.2.129 and the adapter Cargo lockfile are verified for the adapters. These use direct Cargo builds, not Trunk or full upstream app builds. Output sizes/hashes are recorded in `upstream/rendering-build.json`; transitive redistribution notices and wider-platform validation remain open.

## Scope and estimates

Version 1 covers editable XLSX, DOCX, PPTX, and supported PDF modifications through independently installable extensions sharing the same host implementation. An optional Suite pack groups all published members. Start with GridCraft and PdfCraft. Establish safe save and recovery before expanding the adapters.

Planning estimates assume an experienced TypeScript/VS Code and Rust engineer, reuse of upstream WASM UIs, and limited upstream patches. These are cumulative ranges, not commitments:

| Deliverable | Cumulative engineer-days |
| --- | --- |
| Two-app technical prototype | 5–10 |
| Four-format viewer beta | 20–35 |
| Editable Office beta | 45–70 |
| Dependable public release | 60–100 |

Budget approximately 3–5 months for one full-time engineer, including integration contingency. Major upstream compatibility repairs, collaboration, browser-hosted VS Code, and the wider creative suite are excluded. Re-estimate after M1 using measured results.

## M0 — Establish reproducible inputs

- [x] Recheck upstream embedding APIs and contributor requirements.
- [x] Pin source revisions and toolchains for GridCraft and PdfCraft rendering adapters.
- [ ] Record licensing, required assets/fonts, and restricted branding.
- [x] Collect redistributable or generated document fixtures.
- [x] Scaffold TypeScript extension tooling and meaningful CI checks.

Done when a fresh checkout has documented build inputs and can produce the first WASM artifacts reproducibly enough for the spike. Do not rely on floating branches.

## M1 — Two-app feasibility spike

- [x] Register default custom editors for XLSX and PDF.
- [x] Load both rendering adapters without a desktop process or localhost server.
- [x] Pass document bytes through the VS Code bridge.
- [ ] Validate graphics, fonts, CSP, keyboard focus, clipboard, and resizing.
- [ ] Exercise a remote-workspace document.
- [ ] Measure artifact size, startup latency, and memory on recorded hardware.
- [ ] Demonstrate a GridCraft edit and serialize it to a separate output file.

Done when both apps open representative real documents, a GridCraft change survives export/reopen, and blocking compatibility issues are documented. Choose bootstrap, minimum VS Code version, and packaging direction. Re-estimate remaining effort before expanding scope.

## M2 — Shared host and first editable adapter

- [ ] Specify versioned protocol and capability negotiation.
- [ ] Implement document identity, revision tracking, and write queue.
- [ ] Connect Save, Save As, app save commands, and persisted-revision acknowledgments.
- [ ] Integrate engine history with VS Code undo/redo.
- [ ] Implement revert, backups, restore, and webview disposal recovery.
- [ ] Detect external changes and prevent silent known-conflict overwrites.
- [ ] Test stale replies, edits during save, failed writes, and cancelled requests.

Done when GridCraft supports the complete edit lifecycle, including failed saves retaining dirty state and recovery restoring unsaved content. Resolve history strategy here rather than deferring it to release.

## M3 — Complete Office adapters

- [ ] Add WordCraft and DeckCraft with pinned inputs.
- [ ] Bring PdfCraft modification/save behavior onto the shared protocol.
- [ ] Connect embedded assets, font requirements, and exports.
- [ ] Implement capability-limited modes where engines cannot support an operation.
- [ ] Maintain per-format fidelity and support notes.
- [ ] Submit focused upstream embedding patches where useful; track temporary patches locally.

Done when each supported format passes open → edit → save → reopen and recovery checks on the fixture collection. The viewer beta may ship before all editing capabilities pass, with limitations stated explicitly.

## M4 — Release hardening

- [ ] Validate Windows, macOS, Linux, WSL, and Remote-SSH.
- [ ] Test large/malformed files, read-only destinations, resource limits, and app crashes.
- [ ] Verify package installs, offline resources, lazy loading, and reproducible version inventory.
- [ ] Complete upstream and asset notices; remove restricted branding.
- [ ] Document installation, support matrix, recovery, fidelity limits, and troubleshooting.
- [ ] Produce a versioned VSIX and release notes.

Done when the documented support matrix passes lifecycle checks and release artifacts can be traced to pinned source. Publishing destinations and publisher identity are decisions to make before public distribution.

## Risks and controls

| Risk | Response |
| --- | --- |
| Webview graphics or CSP incompatibility | Resolve with two different apps in M1 |
| Divergent save/history models | Prove one complete lifecycle before multiplying adapters |
| File features lost on save | Record engine limits, test fixtures, and offer explicit Save As |
| Large WASM bundles and memory usage | Measure first; lazy-load and choose packaging from data |
| Fast-moving upstream changes | Pin revisions and maintain adapter contract tests |
| Remote filesystem semantics differ | Use URI APIs, exercise failures, and document atomicity limits |
| Recovery stores decrypted content | Define policy before supporting encrypted-document editing |

## Later work

CLI/MCP integration, multiple synchronized editable views, browser-hosted VS Code, and PhotoCraft/VectorCraft/DesignCraft adapters can follow the Office release. Media, audio, CAD, and library-oriented applications require independent feasibility work; they are not assumed to be small adapters.

## Immediate next task

Broaden representative-document and platform coverage, measure memory/startup behavior and validate complex workbook fidelity before public release. Editing lifecycle acceptance now covers generated fixtures; actual WSL/SSH, Windows/macOS and larger corpora remain incomplete.
