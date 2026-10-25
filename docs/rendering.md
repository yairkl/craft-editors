# Rendering and native spreadsheet UI

**Craft Spreadsheets** embeds GridCraft's native editable UI for XLSX; **Craft PDF** provides read-only PDF rendering. Both use pinned WASM engines inside the VS Code webview, with no local server. Each package contains only its own engine. See [editing lifecycle](editing.md) and [packaging](packaging.md).

## Build and run

Install Node.js 22+, Git, rustup and VS Code 1.102+. Then:

```sh
npm ci
npm run upstream:fetch
rustup toolchain install 1.95.0 --profile minimal --target wasm32-unknown-unknown
cargo +1.95.0 install wasm-bindgen-cli --version 0.2.129 --locked
npm run renderers:build
npm run compile
```

Source preparation applies the declared patches before Rust checks; the renderer build rechecks source revisions and accepts only clean upstream checkouts or the exact hash-verified patches declared in `upstream/manifest.json`. It uses `adapters/Cargo.lock`, including PdfCraft's vendored renderer patches and GridCraft's pinned `craft-libs` dependency. Optional `CRAFT_FONTS_DIR` input is deliberately rejected until it has its own source pin and audit. Trunk and wasm-opt are not used by these wrappers.

Generated JavaScript/WASM stays in ignored `media/engines/`. `media/engines/build.json` records tool versions, input pins, lock hash, output sizes and SHA-256 hashes. The tracked `upstream/rendering-build.json` is the baseline from the verified local build, not a promise of identical bytes on every host. Binaries are not committed or downloaded at extension runtime.

Run `npm run compile`, then select **Craft Spreadsheets**, **Craft PDF**, or **Both Craft extensions** in Run and Debug and press F5. In the development window, open the matching `integration-tests/fixtures/rendering.xlsx` or `rendering.pdf` normally. Each extension is the default for its own file type. Existing user editor associations take precedence; use **Reopen Editor With… → Configure default editor** to change a saved preference. The spreadsheet supports wheel scrolling, Shift-wheel horizontal scrolling and sheet selection. The PDF supports Previous/Next and 75–200% zoom.

## Adapter boundaries

`adapters/grid` loads XLSX into a single-document GridCraft session and drives its native `SheetApp` logic, input and UI using eframe Glow/WebGL. Ribbon, formula bar, cell editor, bottom worksheet tabs, context menus and editing dialogs remain interactive. VS Code owns file/window chrome. A minimal tracked upstream service hook routes file lifecycle and undo/redo commands to the host. No custom HTML worksheet tabs or dropdown are maintained. Immutable workbook snapshots bridge committed native edits to VS Code history; the adapter exposes explicit serialize, acknowledge, restore and replace operations.

`adapters/pdf` uses PdfCraft's `PageRenderer` directly. It returns opaque RGBA pixels, which the webview paints into a 2D canvas. It exposes page rasterization only. The adapter workspace repeats the relevant PdfCraft Cargo patches because patches in a dependency workspace are not inherited.

The extension reads through `workspace.fs`, limits source files to 32 MiB and transfers only the selected document's bytes. Its CSP permits local modules and WASM compilation, while local resource roots are limited to extension media. Rendering errors and a 60-second startup timeout are visible in the preview. Spreadsheet writes go through the host lifecycle described in [editing](editing.md); PDF has no write handler.

## Verification

```sh
npm run check
npm test
npm run fixtures:check
npm run test:integration
npm run test:rendering
npm run test:editing
```

On headless Linux, prefix each VS Code suite with `xvfb-run -a`. The rendering suite uses Chromium's software WebGL backend for headless testing; normal launches use the available GPU backend. Both suites target VS Code 1.102.0. `VSCODE_EXECUTABLE_PATH` selects a different installed test host.

Rendering tests run the actual WASM engines and capture GPU/CPU output pixels. They verify:

- Basic cells and formula results; styled numbers/percentages, a merged heading and two worksheets.
- Single-page and two-page PDFs with text and vector graphics.
- Sheet/page navigation, PDF zoom and grid canvas resize.
- Actual native bottom worksheet tab clicks and restoration of the saved active worksheet.
- Cell/formula save round trips, history, recovery, cancellation and write failures in the editing suite.
- Unchanged source bytes, a non-file filesystem provider with zero writes, and explicit errors for malformed XLSX/PDF input.

Test-only browser checks and screenshot capture run only in `ExtensionMode.Test`. `artifacts/rendering/*.png` contains the captured documents; these are inspected locally. CI uploads screenshots only when the rendering job fails and retains them for one day. They are generated fixtures, not user documents. Screenshots from the initial four fixture renders were visually inspected on Linux.

The transport/rendering suites run each extension alone and then together, asserting that standalone extensions contain no sibling renderer. The separate installed-package suite exercises actual VSIX installations in production mode without the browser test helper; it verifies default opening and rendered pixels. The archive check also verifies that the Suite contains no runtime code. See [packaging verification](packaging.md).

## Current limits

Validation covers the generated fixtures on Linux and a simulated non-file provider. Windows, macOS, actual WSL/SSH sessions, startup/memory benchmarks, large/malformed corpora, full font/script coverage and format fidelity remain release work. Embedded images/charts and complex documents have not been assessed. GridCraft may recalculate formulas while opening, as its native engine does. Rendering inherits upstream behavior and supported formats.

PDF rendering runs synchronously in the webview, so expensive pages can temporarily delay its UI. Password entry is not implemented. Oversized rasters are rejected. No DOCX/PPTX renderer has been integrated yet.

Spreadsheet file/window chrome belongs to VS Code; PDF uses its own small viewing toolbar. Packaging now collects renderer-specific dependency inventories and available license/font notices. Reviewing that output and the remaining platform/fidelity limits is still required before public release; see [the asset inventory](../upstream/rendering-assets.md). Building local VSIX files does not publish an extension release.
