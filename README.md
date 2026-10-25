# Craft for VS Code

An independent project to bring the Rust-based Crafting Apps into VS Code as document editors.

Open, view, and edit spreadsheets, documents, presentations, and PDFs in editor tabs, using the existing Craft engines and WebAssembly interfaces. Files remain local to the VS Code session; no document processing service is required.

**Status: independent XLSX editing and PDF viewing extensions.** Craft Spreadsheets embeds GridCraft's native ribbon, formula bar, grid and bottom worksheet tabs. Edit cells and worksheets, then use VS Code Save/Save As, undo/redo and Revert. Craft PDF remains read only. Install either independently, or both through the optional Craft Suite pack. Each package includes only its own engine. DOCX and PPTX remain planned. See [editing behavior and limits](docs/editing.md).

Build local installable archives with `npm run package` after building the renderers. See [packaging and installation](docs/packaging.md) for setup, VSIX paths and Suite development-install instructions. Nothing is published to Marketplace yet.

CI uploads VSIX archives only for successful version-tag pushes (`v*`), retained for 90 days. Failure screenshots expire after one day; successful branch/PR runs retain no artifacts. See [artifact retention](docs/packaging.md#ci-artifact-retention).

## Development

Requirements: Node.js 22+, npm, Python 3 for fixtures/package checks, and desktop VS Code 1.102+. The individual extensions have no runtime npm dependencies or required companion extensions.

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

Run `npm run compile`, then choose **Craft Spreadsheets**, **Craft PDF**, or **Both Craft extensions** in Run and Debug and press F5. Open `integration-tests/fixtures/rendering.xlsx` or `rendering.pdf` normally; the corresponding extension is the default editor. Explicit user editor associations take precedence; use **Reopen Editor With… → Configure default editor** to change an existing choice. Files up to 32 MiB are read through VS Code filesystem APIs. Each extension also has an optional integration probe.

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

- A shared TypeScript host provides file access and custom editor behavior behind independent application extensions.
- Existing Rust/WASM builds provide document processing and the application UI.
- Small adapters connect each application to a versioned document-host protocol.
- Embedding improvements belong upstream in each application; temporary patches stay minimal and tracked.
- Each extension contains only its own renderer. An optional Suite extension pack installs all published members together.

The extension will inherit each engine's file-format limitations. It does not promise Microsoft Office feature parity or lossless round trips for every document.

## Project documents

- [Design](docs/design.md): architecture, document lifecycle, ownership, and tradeoffs.
- [Initial implementation plan](docs/plan.md): milestones, acceptance criteria, estimates, and risks.
- [Contributing](CONTRIBUTING.md): project boundaries and development expectations.
- [Upstream research](docs/upstream-research.md): inspected source pins, build entry points and embedding gaps.
- [Read-only rendering](docs/rendering.md): build/run instructions, verification and current limits.
- [Independent packaging](docs/packaging.md): extension structure, installation, archive verification and migration.

## Relationship to upstream

This is an independent integration project, not an official ArtCraft product. Upstream names identify the applications being integrated. Restricted upstream branding will not be redistributed in modified builds.

Related proposal: [Unified VS Code Extension for Crafting Apps, ArtCraft #2244](https://github.com/storytold/artcraft/issues/2244). It describes a CLI-first integration; this project's proposed primary path embeds WASM interfaces for interactive editing. CLI/MCP integration is a later capability.

Other Office viewers already exist, including [cweijan's Office Viewer](https://marketplace.visualstudio.com/items?itemName=cweijan.vscode-office). This project's focus is integration with the Craft editing engines.

## License

This repository is licensed under [MIT](LICENSE). Upstream code and bundled assets retain their own licenses and required notices. Generated VSIX files include their selected renderer and dependency notices; binaries stay out of git. The tracked smoke documents are original generated fixtures.
