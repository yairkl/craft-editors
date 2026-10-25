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

`adapters/grid` drives GridCraft's native ribbon, formula bar, cells, bottom worksheet tabs and dialogs. It preserves active cell drafts during autosave, with incomplete formulas deferred. Wheel scrolling, Shift-wheel horizontal scrolling and Ctrl-wheel zoom use the native grid; zoom steps are five percentage points.

`adapters/{word,deck,pdf,vector}` share `adapters/native/runtime.rs` for startup, frame capture, edit/command events, host-driven serialization, exact-revision acknowledgment, history, replacement and theme changes. Each application owns its document model and snapshot details. PDF snapshots retain the native object graph and text/form drafts; Vector snapshots retain structurally shared model/history data and preserve SVG/native source format. PDF ordinary wheel scrolling navigates the viewport; Ctrl-wheel zooms. Word/slide/PDF page colors and artwork are preserved while native chrome follows VS Code light/dark. High contrast maps to native brightness rather than an exact high-contrast token palette.

VS Code owns file/window chrome and persistence. Restricted logo artwork is removed from modified builds. The shared HTML bootstrap adds no Save/Save As header. Native editing menus and tools remain available; advanced operations outside the beta's validated scope are documented in [the release notes](releases/v0.1.0-beta.1.md).

The host reads through `workspace.fs`, caps source files at 32 MiB and transfers only the selected file's bytes. The CSP permits local modules/WASM and extension media. Startup failures and a 60-second timeout are visible in the editor. Save, cancellation, conflict checks, recovery and Revert are shared across all formats.

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

Browser helpers and screenshot capture are test-only and excluded from VSIX files. `artifacts/rendering/*.png` contains original generated fixtures for local visual inspection. CI retains failure screenshots for one day and no successful branch artifacts. Beta tags publish installers/checksums after the full suite passes.

## Limits

Linux and simulated remote filesystems are covered; Actual Linux Remote SSH lifecycle tests pass; Windows/macOS, WSL and wider network/authentication scenarios still need beta testing. Browser-hosted VS Code is not supported. Complex document fidelity, large-file memory/startup, accessibility, IME/image clipboard, printing/signing, external pickers, combine/export and synchronized views need further validation. Password-protected files are outside this preview. Unserializable drafts defer autosave/backup and cannot be crash-recovered before they become serializable. Use original copies for beta testing.
