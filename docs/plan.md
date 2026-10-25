# Initial implementation plan

Status: M0 in progress. Updated: 2026-10-25. No full milestone is complete.

## Current implementation

The TypeScript extension registers an optional read-only XLSX/PDF integration probe. A session-scoped handshake transfers binary data and verifies its SHA-256 digest in the real webview. Unit tests cover invalid/stale/duplicate messages and integrity mismatches; VS Code integration tests cover both fixtures, non-file URI transport, cancellation, size limits and unchanged source files. This is transport validation, not a document viewer or editing prototype.

GridCraft and PdfCraft source revisions are pinned in `upstream/manifest.json`. A source-fetch command checks out those exact revisions without replacing dirty work. Rust 1.95.0 / Trunk 0.21.14 are recorded candidates, but WASM builds, tool-download pins and artifacts are still unverified. See [the source inspection](upstream-research.md) for the bridge and licensing constraints.

## Scope and estimates

Version 1 covers editable XLSX, DOCX, PPTX, and supported PDF modifications through one VS Code extension. Start with GridCraft and PdfCraft. Establish safe save and recovery before expanding the adapters.

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
- [ ] Pin source revisions and toolchains for GridCraft and PdfCraft.
- [ ] Record licensing, required assets/fonts, and restricted branding.
- [x] Collect redistributable or generated document fixtures.
- [x] Scaffold TypeScript extension tooling and meaningful CI checks.

Done when a fresh checkout has documented build inputs and can produce the first WASM artifacts reproducibly enough for the spike. Do not rely on floating branches.

## M1 — Two-app feasibility spike

- [ ] Register optional custom editors for XLSX and PDF.
- [ ] Load both apps without a desktop process or localhost server.
- [ ] Pass document bytes through the VS Code bridge.
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

Finish M0 by validating the pinned WASM builds, recording auxiliary tool versions and artifact hashes, and inventorying compiled assets/licenses. Then implement a small GridCraft direct-host adapter: one document per session, host-triggered serialization and explicit persisted-save acknowledgment. Prove open → edit → export to a separate file → reopen before enabling original-file Save. The public repository and extension/CI foundation now exist.
