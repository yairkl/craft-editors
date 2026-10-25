# Contributing

The project has read-only XLSX/PDF rendering and a transport probe. Start with [the design](docs/design.md), [the plan](docs/plan.md), [rendering instructions](docs/rendering.md), and [upstream findings](docs/upstream-research.md). Editing is not implemented yet.

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

Run `npm ci`, `npm run check`, `npm test`, and `npm run fixtures:check` before committing. Changes to the provider, webview, or transport also require `npm run test:integration` (on headless Linux, prefix with `xvfb-run -a`). CI runs these checks against VS Code 1.102.0. The integration suite exercises local and non-file URI transport, cancellation, file-size limits, and unchanged source bytes. It does not yet test upstream rendering or editing.

Keep generated output, downloaded test hosts, upstream checkouts and application artifacts out of git. Regenerate original smoke files with `npm run fixtures`. Fetch source pins with `npm run upstream:fetch`; do not replace immutable pins with branch names. Update the manifest and research notes together when upstream inputs change.

For changes to rendering, build the adapters with `npm run renderers:build`, then run `npm run test:rendering` and visually inspect `artifacts/rendering/*.png`. Rust wrappers must pass `cargo +1.95.0 fmt --manifest-path adapters/grid/Cargo.toml -p craft-grid-viewer -p craft-pdf-viewer --check` and `cargo +1.95.0 clippy --manifest-path adapters/Cargo.toml --locked --target wasm32-unknown-unknown --no-deps -- -D warnings`. The rendering CI job builds the pinned engines and exercises real WebGL/CPU output in VS Code. Keep the preview read-only until the editing lifecycle is explicitly implemented and tested.

Contributions are provided under the repository's MIT license. Third-party material must retain its applicable licensing and attribution.
