# Upstream embedding research

Inspected 2026-10-25. Source inspection only: neither WASM application has been built or run in a VS Code webview here. The machine initially has Node.js 22.17.1 and npm 10.9.2, but no `rustc`. Machine-readable pins and outstanding gates are in [the manifest](../upstream/manifest.json).

## Pinned inputs

| Application | Source revision | Workspace version | Declared minimum Rust |
| --- | --- | --- | --- |
| GridCraft | `17b9f6ff0125209fe707efc919690632ff49cb0b` | 0.11.1 | 1.90 |
| PdfCraft | `418ac6a2af49b7ac2fed44ca2cae8d5d1d2cec0d` | 0.13.0 | 1.95 |

Both workspaces use Rust edition 2024 and declare `MIT OR Apache-2.0`. Their tracked Cargo locks and pinned git dependency revisions must be preserved. See [GridCraft workspace](https://github.com/storytold/gridcraft/blob/17b9f6ff0125209fe707efc919690632ff49cb0b/Cargo.toml), [GridCraft UI dependencies](https://github.com/storytold/gridcraft/blob/17b9f6ff0125209fe707efc919690632ff49cb0b/crates/ui-egui/Cargo.toml), and [PdfCraft workspace](https://github.com/storytold/pdfcraft/blob/418ac6a2af49b7ac2fed44ca2cae8d5d1d2cec0d/Cargo.toml).

Use Rust **1.95.0** as the initial common toolchain candidate and Trunk **0.21.14**. Rust 1.95.0 meets both declared minimums; this is a local choice awaiting an actual build, not an upstream-tested guarantee. Trunk 0.21.14 is the default in the inspected [shared release workflow](https://github.com/storytold/craft-common-actions/blob/2b4eb2c6d94880d926c934ec3736c92cde30086b/.github/workflows/release.yml). The upstream release workflows delegate to a floating workflow and use stable Rust, so copying them would not provide fixed build inputs.

## Build recipe to validate

After installing rustup, install the explicit toolchain and Trunk:

```sh
rustup toolchain install 1.95.0 --profile minimal --target wasm32-unknown-unknown
cargo +1.95.0 install trunk --version 0.21.14 --locked
```

For each repository, clone into a build-input directory, detach at its exact manifest revision, preserve `Cargo.lock`, and build from `apps/<application>-web` with the selected toolchain:

```sh
RUSTUP_TOOLCHAIN=1.95.0 trunk build --release
```

The command is the upstream build entry point, with the toolchain selected explicitly. Both Trunk configurations output into `dist/web`, use relative `./` asset URLs and hashed filenames. `index.html` requests size optimization (`data-wasm-opt="z"`), so record the actual wasm-bindgen and wasm-opt versions/hashes selected by Trunk before treating artifacts as reproducible. Build success, Cargo-lock stability and resulting hashes remain unverified. Sources: [GridCraft Trunk config](https://github.com/storytold/gridcraft/blob/17b9f6ff0125209fe707efc919690632ff49cb0b/apps/gridcraft-web/Trunk.toml), [GridCraft HTML](https://github.com/storytold/gridcraft/blob/17b9f6ff0125209fe707efc919690632ff49cb0b/apps/gridcraft-web/index.html), [PdfCraft Trunk config](https://github.com/storytold/pdfcraft/blob/418ac6a2af49b7ac2fed44ca2cae8d5d1d2cec0d/apps/pdfcraft-web/Trunk.toml), [PdfCraft HTML](https://github.com/storytold/pdfcraft/blob/418ac6a2af49b7ac2fed44ca2cae8d5d1d2cec0d/apps/pdfcraft-web/index.html).

Start without `CRAFT_FONTS_DIR`. This deliberately limits script coverage and avoids an unpinned optional font input. PdfCraft's [font build script](https://github.com/storytold/pdfcraft/blob/418ac6a2af49b7ac2fed44ca2cae8d5d1d2cec0d/crates/fonts/build.rs) supports this omission. Its existing Latin UI fonts include OFL notices. GridCraft's [font discovery](https://github.com/storytold/gridcraft/blob/17b9f6ff0125209fe707efc919690632ff49cb0b/crates/ui-egui/src/fonts.rs) is disabled on WASM, and its web startup deliberately avoids defaulting to CJK interfaces. Additional font builds need their own source pins, hashes and notices.

## Existing host bridges

Both apps have `?host=parent` integration for an iframe embedded by a same-origin browser page. Both receive `*:open` with a name and `ArrayBuffer`/`Uint8Array`, and emit `*:ready`, `*:save`, `*:dirty`, and `*:failed`. Receivers check message origin and parent identity. PdfCraft also explicitly refuses a cross-origin parent when constructing its bridge. Sources: [GridCraft bridge](https://github.com/storytold/gridcraft/blob/17b9f6ff0125209fe707efc919690632ff49cb0b/apps/gridcraft-web/src/host.rs), [PdfCraft web entry and bridge](https://github.com/storytold/pdfcraft/blob/418ac6a2af49b7ac2fed44ca2cae8d5d1d2cec0d/apps/pdfcraft-web/src/main.rs).

The current bridges are useful reference code, but are insufficient for the proposed VS Code document lifecycle:

- There is no `acquireVsCodeApi` transport or direct-host mode. An unmodified app in the webview cannot use its parent bridge as the extension API.
- There is no host-triggered serialize request, revision envelope, persisted-save acknowledgment, or host-driven undo/redo message.
- GridCraft combines workbook saves and exports in `gridcraft:save`, without a Save As discriminator. Its `sync` marks a workbook saved after posting bytes to the parent, before disk persistence is known.
- PdfCraft sends `saveAs`, but the callback completes when `postMessage` succeeds. There is no asynchronous persistence acknowledgment.
- Dirty notifications report a boolean across the app's documents, not a specific VS Code document revision. Both apps can open multiple internal documents, which requires limiting or adapting for one resource per editor.

These are source-derived constraints, not measured runtime failures. The first adapter should implement a direct VS Code transport, one-document session identity and explicit serialize/ack operations in a small tracked upstream patch. Until then, original-file Save must remain unavailable; a proof-of-concept export must use a distinct destination and be described as such.

## Graphics, assets and CSP

GridCraft uses wgpu, with `?webgl` selecting its GL backend; canvas ID is `gridcraft_canvas`. Its bootstrap also handles browser clipboard writes, downloads, popups and PDF-print iframes, which need deliberate host replacements or capability limits. See [web shell](https://github.com/storytold/gridcraft/blob/17b9f6ff0125209fe707efc919690632ff49cb0b/apps/gridcraft-web/src/web.rs).

PdfCraft's pinned web entry explicitly selects `eframe::Renderer::Glow`; canvas ID is `pdfcraft`. Its hosting README describes wgpu and CPU flags, but that description does not match the inspected startup source. Use the source-selected WebGL path as the initial assumption and verify it in VS Code. See [entry point](https://github.com/storytold/pdfcraft/blob/418ac6a2af49b7ac2fed44ca2cae8d5d1d2cec0d/apps/pdfcraft-web/src/main.rs) and [hosting README](https://github.com/storytold/pdfcraft/blob/418ac6a2af49b7ac2fed44ca2cae8d5d1d2cec0d/packaging/web/README.md).

Inference for the VS Code spike: replace the generated HTML bootstrap with extension-owned markup, load generated ES modules and WASM through `asWebviewUri`, restrict local resource roots, and test WASM compilation under an explicit CSP. Test both GPU availability and startup failure reporting. Do not assume ordinary HTTP hosting behavior, same-origin iframe messaging, browser local storage, clipboard permissions, or downloaded saves transfer unchanged to a VS Code webview. No artifact sizes, startup times or remote behavior have been measured yet.

## Licensing and contributor boundaries

The MIT/Apache code license excludes ArtCraft marks. Both brand licenses require removing the marks from distributed modified versions. Inventory compiled UI assets as well as copied static files before redistributing; omitting `docs/brand` from a package alone does not prove embedded marks are absent. Preserve applicable upstream license, NOTICE and font/dependency attributions. Sources: [GridCraft brand terms](https://github.com/storytold/gridcraft/blob/17b9f6ff0125209fe707efc919690632ff49cb0b/docs/brand/LICENSE-brand.txt), [PdfCraft brand terms](https://github.com/storytold/pdfcraft/blob/418ac6a2af49b7ac2fed44ca2cae8d5d1d2cec0d/docs/brand/LICENSE-brand.txt).

For upstream changes, use their Rust-only implementation conventions, original/generated fixtures, attribution inventories and crash-free error handling. Their agent instructions also require quality gates and contributor-credit handling when preparing an upstream PR. These upstream-specific requirements do not prohibit TypeScript in this integration repository. Sources: [GridCraft contributor instructions](https://github.com/storytold/gridcraft/blob/17b9f6ff0125209fe707efc919690632ff49cb0b/AGENTS.md), [PdfCraft contributor instructions](https://github.com/storytold/pdfcraft/blob/418ac6a2af49b7ac2fed44ca2cae8d5d1d2cec0d/AGENTS.md).

## Next acceptance checks

1. Install/build with pinned tools and preserve Cargo locks; record full output, tool versions and artifact hashes.
2. Inventory licenses and embedded branding before bundling artifacts.
3. Load GridCraft's WASM into the extension webview and deliver a generated XLSX through a direct adapter.
4. Change a cell, serialize to a separate output, and reopen it to verify the value.
5. Repeat startup/open with PdfCraft; measure rendering, focus, clipboard, resizing and remote URIs.
6. Resolve save acknowledgment and stable history tokens before enabling VS Code Save, backups or undo/redo.
