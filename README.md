# Craft for VS Code

An independent project to bring the Rust-based Crafting Apps into VS Code as document editors.

Open, view, and edit spreadsheets, documents, presentations, and PDFs in editor tabs, using the existing Craft engines and WebAssembly interfaces. Files remain local to the VS Code session; no document processing service is required.

**Status: design and planning.** This repository contains no extension implementation yet. Features below are planned, not currently available. Working repository name: `craft-vscode`.

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

## Relationship to upstream

This is an independent integration project, not an official ArtCraft product. Upstream names identify the applications being integrated. Restricted upstream branding will not be redistributed in modified builds.

Related proposal: [Unified VS Code Extension for Crafting Apps, ArtCraft #2244](https://github.com/storytold/artcraft/issues/2244). It describes a CLI-first integration; this project's proposed primary path embeds WASM interfaces for interactive editing. CLI/MCP integration is a later capability.

Other Office viewers already exist, including [cweijan's Office Viewer](https://marketplace.visualstudio.com/items?itemName=cweijan.vscode-office). This project's focus is integration with the Craft editing engines.

## License

This repository is licensed under [MIT](LICENSE). Upstream code and bundled assets retain their own licenses and required notices. No upstream applications or binary artifacts are included yet.
