# Native rendering and editing

All five independently installable applications embed their Rust/egui interfaces in a VS Code webview: GridCraft (XLSX), WordCraft (DOCX), DeckCraft (PPTX), PdfCraft (PDF), and VectorCraft (SVG/native `.vectorcraft`). There is no local processing server or runtime engine download. Each package contains only its own renderer. See [editing](editing.md) and [packaging](packaging.md).

## Build and run

Install Node.js 22+, Git, rustup and desktop VS Code 1.102+. Then:

```sh
npm ci
npm run upstream:fetch
rustup toolchain install 1.95.0 --profile minimal --component rustfmt,clippy --target wasm32-unknown-unknown
cargo +1.95.0 install wasm-bindgen-cli --version 0.2.129 --locked
npm run renderers:build
npm run compile
```

Source preparation applies hash-verified integration patches before Rust checks. The build accepts only exact source revisions and declared patches. `adapters/Cargo.lock` pins dependencies, including shared Hayro/Krilla from `craft-libs` revision `a0916808…`, PdfCraft's remaining vendored patches, and DeckCraft/VectorCraft's egui/winit fork. Patches in dependency workspaces are not inherited, so the adapter workspace repeats them. Optional unpinned `CRAFT_FONTS_DIR` input is rejected. Trunk and wasm-opt are not used.

Generated JavaScript/WASM stays in ignored `media/engines/`. `build.json` records input pins, lock hash, tools, output sizes and SHA-256 hashes. `upstream/rendering-build.json` records a verified local baseline; identical bytes across build hosts are not promised.

Select an individual application or **All Craft extensions** in Run and Debug and press F5. Open the matching original fixture from `integration-tests/fixtures/`. SVG/native drawings use **Reopen Editor With… → Craft Vector**; other formats are default editors unless the user has another association. Configure default editors through VS Code; no settings are overwritten automatically.

## Adapter interfaces

`adapters/grid` drives GridCraft's native ribbon, formula bar, cells, bottom worksheet tabs and dialogs. It preserves active cell drafts during autosave, with incomplete formulas deferred. Ordinary wheel and Shift-wheel scrolling remain native. The integration adapter handles Ctrl+wheel over the worksheet in five-percentage-point steps; native pinch gestures, buttons and keyboard shortcuts retain upstream behavior.

`adapters/{word,deck,pdf,vector}` share `adapters/native/runtime.rs` for startup, frame capture, edit/command events, host-driven serialization, exact-revision acknowledgment, history, replacement and theme changes. Each application owns its document model and snapshot details. PDF snapshots retain the native object graph and text/form drafts; Vector snapshots retain structurally shared model/history data and preserve SVG/native source format. PDF ordinary wheel scrolling navigates the viewport; Ctrl-wheel zooms. Word/slide/PDF page colors and artwork are preserved while native chrome follows VS Code light/dark. High contrast maps to native brightness rather than an exact high-contrast token palette.

VS Code owns file/window chrome and persistence. Restricted logo artwork is removed from modified builds. The shared HTML bootstrap adds no Save/Save As header. Native editing menus and tools remain available; advanced operations outside the beta's validated scope are documented in [the release notes](releases/v0.1.2-beta.4.md).

The host reads through `workspace.fs`, limits source files to 256 MiB by default (`craft.<editor>.maxFileSizeMiB`, configurable up to 1024 MiB) and transfers the selected file's bytes. Files are held in memory and complex or compressed documents can require much more memory than their disk size. The current setting is checked when opening and saving. The CSP permits local modules/WASM and extension media. Startup failures and a 60-second timeout are visible in the editor. Save, cancellation, conflict checks, recovery and Revert are shared across all formats.

## Verification

```sh
npm run check
npm test
npm run fixtures:check
npm run test:integration
npm run test:rendering
npm run test:editing
npm run test:office
npm run test:graphics
npm run test:theme
npm run package
npm run packages:check
npm run test:installed
```

Prefix VS Code suites with `xvfb-run -a` on headless Linux. Tests use actual WASM, software WebGL and disposable profiles; normal windows use the available GPU. The default host is VS Code 1.102.0; `VSCODE_EXECUTABLE_PATH` selects a current installed version.

Coverage includes native worksheet tab clicks/formula values/canvas resize, PDF pages, source preservation, native Office text input, PDF page rotation and text drafts, SVG/native drawing edits, Ctrl-wheel zoom, native keyboard Undo/Redo, Save/reopen, Save As, Revert, recovery, live palettes, remote filesystem transport, failed/cancelled writes and spreadsheet autosave during typing. Each program is exercised independently and together. Archive tests verify entry points, renderer/dependency isolation, generated module imports, notices and source byte equality; installed tests open actual production VSIX files.

Browser helpers and screenshot capture are test-only and excluded from VSIX files. `artifacts/rendering/*.png` contains original generated fixtures for local visual inspection. CI retains failure screenshots and PR build artifacts for one day. A manually dispatched release run publishes installers and checksums after the full suite passes.

## Limits

Linux, macOS and Windows CI cover editor behavior; Linux Remote SSH lifecycle tests pass. Cursor, WSL, macOS-to-Remote SSH and wider network/authentication scenarios still need testing. Browser-hosted VS Code is not supported. Complex document fidelity, large-file memory/startup, accessibility, IME/image clipboard, printing/signing, external pickers, combine/export and synchronized views need further validation. Password-protected files are outside this preview. Unserializable drafts defer autosave/backup and cannot be crash-recovered before they become serializable. Use original copies for beta testing.

## Embedded slide presentation limits

DeckCraft slideshow/Presenter View launches are disabled in VS Code. Desktop child viewports fall back to windows inside the editor webview and cover the audience slide; they do not provide an independent monitor or fullscreen presentation host. The guard applies at native `start_show`, including F5, ribbon/status actions, custom shows and command launches. Reading View remains an in-editor preview without a presenter viewport. A future multi-display mode requires a separate audience surface and host-managed lifecycle, navigation and focus.

Office ribbons start collapsed in the GridCraft, WordCraft and DeckCraft adapters. The native tab row and expand/collapse interactions remain available. This is an embedding default; upstream application defaults are unchanged. Saving does not recreate the app or reset a ribbon the user has expanded.

## Large-file verification

The release flow exercises synthetic XLSX and PDF files just over 33 MiB, including agent open, editor edits, save and reopen. The fixtures are padded small documents, so these checks verify file-size handling and transport, not real-world large-document performance or fidelity. In a local Linux x64 run with 28 logical CPUs and 62 GiB reported RAM, the padded XLSX and PDF each completed open/edit/save/reopen in about 2–3 seconds. `/usr/bin/time` reported maximum resident sets of roughly 380 MiB and 620 MiB for the individual processes observed during those runs, not total VS Code memory. Results vary with content and hardware.

To reproduce these Linux checks after building the renderers, run:

```sh
CRAFT_TEST_LARGE=1 CRAFT_TEST_ONLY=spreadsheets xvfb-run -a npm run test:editing
CRAFT_TEST_LARGE=1 CRAFT_TEST_ONLY=pdf xvfb-run -a npm run test:graphics
```

The 256 MiB default and 1024 MiB ceiling are not performance guarantees. Files are read in full, Office archives can expand substantially, and large or complex documents, remote hosts and multiple open editors can consume far more memory. Benchmark realistic files across apps and platforms before increasing the limit broadly.
