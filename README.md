# Craft for VS Code

An independent project to bring the Rust-based Crafting Apps into VS Code as document editors.

Open, view, and edit spreadsheets, documents, presentations, and PDFs in editor tabs, using the existing Craft engines and WebAssembly interfaces. Files remain local to the VS Code session; no document processing service is required.

**Status: read-only XLSX/PDF rendering.** Craft Preview renders spreadsheets with GridCraft's grid and PDFs with PdfCraft's page renderer inside VS Code. Sheet switching, PDF page navigation and PDF zoom are available. Editing, DOCX and PPTX remain planned. Working repository name: `craft-vscode`.

## Development

Requirements: Node.js 22+, npm, Python 3 for fixture generation, and desktop VS Code 1.102+. The extension has no runtime npm dependencies.

```sh
npm ci
npm run check
npm test
npm run fixtures:check
npm run test:integration
```

Integration tests download VS Code 1.102.0 and run in its Extension Development Host. Linux headless environments need `xvfb-run -a npm run test:integration`. Set `VSCODE_EXECUTABLE_PATH` to test a separately installed VS Code executable instead.

Build the WASM renderers before launching the preview:

```sh
npm run upstream:fetch
rustup toolchain install 1.95.0 --profile minimal --target wasm32-unknown-unknown
cargo +1.95.0 install wasm-bindgen-cli --version 0.2.129 --locked
npm run renderers:build
npm run test:rendering
```

Open this repository in VS Code and press F5 to launch the development extension. In the new window, open `integration-tests/fixtures/rendering.xlsx` or `rendering.pdf`, run **Reopen Editor With…**, and choose **Craft Preview (read only)**. Files up to 32 MiB are read through VS Code filesystem APIs. **Craft Integration Probe (development)** remains available as a separate transport diagnostic.

See [rendering setup and verification](docs/rendering.md) for the adapter boundaries, tested behavior and remaining limits. Generated binaries stay out of git and are built locally or in CI; they are not downloaded at extension runtime.

## Initial scope

| Application | Initial format | Intended experience |
| --- | --- | --- |
| [GridCraft](https://github.com/storytold/gridcraft) | `.xlsx` | Spreadsheet viewing and editing |
| [WordCraft](https://github.com/storytold/wordcraft) | `.docx` | Document viewing and editing |
| [DeckCraft](https://github.com/storytold/deckcraft) | `.pptx` | Presentation viewing and editing |
| [PdfCraft](https://github.com/storytold/pdfcraft) | `.pdf` | Reading and supported PDF modifications |

The first implementation milestone targets GridCraft and PdfCraft to validate the shared host. WordCraft and DeckCraft follow. Editing is part of the initial architecture, including Save, Save As, undo/redo, recovery, and external-change handling.

Desktop VS Code on Windows, macOS, and Linux is the first release target. WSL and Remote-SSH are planned validation targets. Browser-hosted VS Code support remains subject to a separate compatibility check.

## Approach

- One TypeScript extension provides VS Code custom editors and owns file access.
- Existing Rust/WASM builds provide document processing and the application UI.
- Small adapters connect each application to a versioned document-host protocol.
- Embedding improvements belong upstream in each application; temporary patches stay minimal and tracked.
- Application resources load on demand. Initial packaging and download strategy will be chosen after measuring artifact sizes.

The extension will inherit each engine's file-format limitations. It does not promise Microsoft Office feature parity or lossless round trips for every document.

## Project documents

- [Design](docs/design.md): architecture, document lifecycle, ownership, and tradeoffs.
- [Initial implementation plan](docs/plan.md): milestones, acceptance criteria, estimates, and risks.
- [Contributing](CONTRIBUTING.md): project boundaries and development expectations.
- [Upstream research](docs/upstream-research.md): inspected source pins, build entry points and embedding gaps.
- [Read-only rendering](docs/rendering.md): build/run instructions, verification and current limits.

## Relationship to upstream

This is an independent integration project, not an official ArtCraft product. Upstream names identify the applications being integrated. Restricted upstream branding will not be redistributed in modified builds.

Related proposal: [Unified VS Code Extension for Crafting Apps, ArtCraft #2244](https://github.com/storytold/artcraft/issues/2244). It describes a CLI-first integration; this project's proposed primary path embeds WASM interfaces for interactive editing. CLI/MCP integration is a later capability.

Other Office viewers already exist, including [cweijan's Office Viewer](https://marketplace.visualstudio.com/items?itemName=cweijan.vscode-office). This project's focus is integration with the Craft editing engines.

## License

This repository is licensed under [MIT](LICENSE). Upstream code and bundled assets retain their own licenses and required notices. No upstream application binaries are bundled; the tracked smoke documents are original generated fixtures.
