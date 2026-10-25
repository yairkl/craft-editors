# Independent extensions

One repository maintains shared host code and separate installable extensions. An XLSX-only user installs Craft Spreadsheets and receives no PdfCraft renderer, PDF editor registration or required PDF extension. The same independence applies to Craft PDF. There is no mandatory shared-core extension: the small common host implementation is copied into each package from one source.

| Package | Extension ID | Default file type | Renderer |
| --- | --- | --- | --- |
| Craft Spreadsheets | `craft-vscode-dev.craft-spreadsheets` | `.xlsx` | GridCraft only |
| Craft PDF | `craft-vscode-dev.craft-pdf` | `.pdf` | PdfCraft only |
| Craft Suite | `craft-vscode-dev.craft-suite` | None | None; optional extension pack |

WordCraft and DeckCraft are future extensions, not empty packages or required dependencies. `craft-vscode-dev` remains a development publisher identifier; nothing has been published to Marketplace.

## Source and build layout

- `src/host.ts`, `src/document.ts`, `src/rendering.ts`, `protocol/` and `media/`: common implementation.
- `src/entrypoints/{spreadsheets,pdf}.ts`: small format-specific entry points.
- `packages/{spreadsheets,pdf,suite}/`: version-controlled manifests and user documentation.
- `dist/development/`: generated F5/test extensions, with the browser test helper.
- `dist/extensions/`: production staging, with only the selected entry point and renderer.
- `dist/vsix/`: independently installable VSIX archives.

The Rust workspace and its toolchain remain shared build infrastructure. A full source build currently fetches/builds both adapters. This is a developer requirement, not an installation or runtime dependency between the extensions. Shared VS Code code is compiled once and copied to each package; changes are made once in source.

## Build packages

After [building the renderers](rendering.md):

```sh
npm ci
npm run package
npm run packages:check
```

To package only one already-built renderer, use `npm run package -- spreadsheets` or `npm run package -- pdf`. `npm run package -- suite` needs no Rust toolchain or renderer. Packaging individual renderers requires the pinned Rust toolchain and source checkouts to collect their dependency notices. The workspace's VSIX packager is development tooling and is never included in the installed extensions.

`scripts/stage-extensions.mjs` copies an explicit list of common files and just the selected renderer. Production staging includes neither tests nor the browser test helper. Each manifest also has an explicit package file list. `scripts/collect-notices.mjs` follows each adapter's own Cargo dependency graph and includes available license/NOTICE/font texts plus a dependency inventory. The archived WASM bytes must match the built renderer. Public release still requires reviewing the resulting notices, supported platforms and fidelity limits.

The independent archives are:

```text
dist/vsix/craft-spreadsheets-0.0.1.vsix
dist/vsix/craft-pdf-0.0.1.vsix
dist/vsix/craft-suite-0.0.1.vsix
```

In VS Code, use **Extensions → … → Install from VSIX…** and choose the formats you want. The individual extensions require no companion extension. For the local development Suite, install the two individual archives first, then the Suite archive. Once member IDs are published to Marketplace, the standard extension pack can install its members itself. These commands build local artifacts and do not publish anything.

## Development and verification

Run `npm run compile`, then choose **Craft Spreadsheets**, **Craft PDF**, or **Both Craft extensions** from VS Code's Run and Debug dropdown and press F5. Open the matching fixture normally; its extension is the default editor unless an existing user preference overrides it. Each format also has its own optional integration probe.

Both `npm run test:integration` and `npm run test:rendering` run three isolated VS Code sessions: Spreadsheet alone, PDF alone and both together. They assert the other extension and renderer are absent during standalone runs. The rendering checks continue to cover default opening, navigation, read-only input, source preservation and remote-style URIs.

`npm run packages:check` opens the actual ZIP/VSIX archives to verify renderer, entry point, file association and notice isolation; it verifies the Suite has no runtime code or WASM. `npm run test:installed` installs the real archives into disposable test profiles and checks default opening and actual rendering in production extension mode. The Suite is tested with both members preinstalled. Headless Linux runs the VS Code commands with `xvfb-run -a`. CI performs all these checks and retains development VSIX files and fixture screenshots as artifacts.

## Migration from the earlier development bundle

The repository root is now a private build workspace rather than a VS Code extension. Restart the F5 development host using one of the new launch configurations. If the old `craft-vscode-dev.craft-vscode` bundle is installed, disable or uninstall it to avoid competing default editors.

The new editor identifiers are `craft.spreadsheets.preview` and `craft.pdf.preview`. Existing preferences referring to `craft.preview` should be changed through **Reopen Editor With… → Configure default editor**. No user settings are overwritten automatically.
