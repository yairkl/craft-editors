# Contributing

The project has native XLSX/DOCX/PPTX/PDF/SVG/VectorCraft editing and a transport probe. Start with [the design](docs/design.md), [the plan](docs/plan.md), [rendering instructions](docs/rendering.md), and [upstream findings](docs/upstream-research.md). See [editing lifecycle](docs/editing.md) for the implemented host boundary.

## Ownership boundaries

VS Code integration, packaging, adapters, and integration tests belong here. Document parsing, calculation, layout, rendering, and serialization belong in the upstream application repositories. Do not copy those engines into TypeScript.

Propose embedding changes upstream when practical. Record temporary patches with their upstream commit, purpose, and removal condition. Pin dependencies to immutable revisions; do not build releases against floating branches.

## Implementation expectations

- Keep source documents intact on failed operations and surface errors clearly.
- Validate protocol inputs and test document lifecycle failures as well as successful saves.
- Treat files from local, WSL, and remote workspaces through VS Code URI APIs.
- Keep document bytes, paths, and passwords out of routine logs.
- Include applicable license and asset notices when adding dependencies or artifacts.
- Document supported formats and fidelity limits without claiming unsupported compatibility.

Run `npm ci`, `npm run check`, `npm test`, and `npm run fixtures:check` before committing. Changes to the provider, webview, or transport also require `npm run test:integration` (on headless Linux, prefix with `xvfb-run -a`). CI runs these checks against VS Code 1.102.0. The integration suite exercises local and non-file URI transport, cancellation, file-size limits, and unchanged source bytes. Dedicated rendering and editing suites exercise the native engines.

Keep generated output, downloaded test hosts, upstream checkouts and application artifacts out of git. Regenerate original smoke files with `npm run fixtures`. Fetch source pins with `npm run upstream:fetch`; do not replace immutable pins with branch names. Update the manifest and research notes together when upstream inputs change.

The repository root is build tooling; extension manifests live under `packages/`. Common code belongs in `src/host.ts` and its modules. Keep each entry point and manifest limited to its own format; do not introduce required sibling-extension dependencies. `npm run compile` stages separate development extensions under `dist/development`. Both VS Code test suites run standalone and combined profiles. Packaging changes also require `npm run package`, `npm run packages:check`, and `npm run test:installed` (the last prefixed with `xvfb-run -a` on headless Linux). Read [packaging](docs/packaging.md) before changing staged file lists or editor IDs.

For changes to rendering, build the adapters with `npm run renderers:build`, then run `npm run test:rendering` and visually inspect `artifacts/rendering/*.png`. Rust wrappers must pass `cargo +1.95.0 fmt --manifest-path adapters/grid/Cargo.toml -p craft-grid-viewer -p craft-pdf-viewer -p craft-word-viewer -p craft-deck-viewer -p craft-vector-viewer --check` and `cargo +1.95.0 clippy --manifest-path adapters/Cargo.toml --locked --target wasm32-unknown-unknown --no-deps -- -D warnings`. The rendering CI job builds the pinned engines and exercises real WebGL/CPU output in VS Code. Run `npm run test:editing` for spreadsheet lifecycle changes; it covers native input, persistence, history, recovery and failed writes.

Contributions are provided under the repository's MIT license. Third-party material must retain its applicable licensing and attribution.

For shared host changes, run both `npm run test:editing` and `npm run test:office`, then package/archive/install checks. The Office suite tests native WordCraft/DeckCraft input through the real WASM engines, including save/reopen, history and recovery. `CRAFT_TEST_ONLY=word` or `powerpoint` can narrow local debugging; CI runs the full matrix.

For appearance changes, run `npm run test:theme` against the native engines. It exercises actual workbench theme changes, high-contrast brightness mapping, Revert, unchanged file data and active cell entry.

Run `npm run test:graphics` for PDF/vector lifecycle changes and inspect its screenshots. The common `adapters/native/runtime.rs` is included source: check it separately with `rustfmt +1.95.0 --edition 2024 --check adapters/native/runtime.rs adapters/native/fonts.rs`. Avoid `cargo fmt --all`: it also formats patched upstream path dependencies.

Run `npm run test:languages` for font/input changes. For real SSH, use the opt-in Docker runner documented in [the verification report](docs/verification/remote-ssh.md).
