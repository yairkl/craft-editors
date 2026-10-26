# Independent extensions

One repository maintains shared host code and separate installable extensions. An XLSX-only user installs Craft Spreadsheets and receives no PdfCraft renderer, PDF editor registration or required PDF extension. The same independence applies to Word, PowerPoint and PDF. There is no mandatory shared-core extension: the small common host implementation is copied into each package from one source.

| Package | Extension ID | Default file type | Renderer |
| --- | --- | --- | --- |
| Craft Spreadsheets | `craft-vscode-dev.craft-spreadsheets` | `.xlsx` | GridCraft only |
| Craft Word | `craft-vscode-dev.craft-word` | `.docx` | WordCraft only |
| Craft PowerPoint | `craft-vscode-dev.craft-powerpoint` | `.pptx` | DeckCraft only |
| Craft PDF | `craft-vscode-dev.craft-pdf` | `.pdf` | PdfCraft only |
| Craft Vector | `craft-vscode-dev.craft-vector` | `.svg`, `.vectorcraft` (opt-in) | VectorCraft only |
| Craft Suite | `craft-vscode-dev.craft-suite` | None | None; optional extension pack |

Word and PowerPoint support modern `.docx` and `.pptx`; legacy `.doc` and `.ppt` are not registered. `craft-vscode-dev` remains a development publisher identifier; nothing has been published to Marketplace.

## Source and build layout

- `src/editing.ts`, `src/rpc.ts`, `src/host.ts`, `src/document.ts`, `src/rendering.ts`, `protocol/` and `media/`: common implementation.
- `src/entrypoints/{spreadsheets,word,powerpoint,pdf,vector}.ts`: small format-specific entry points.
- `packages/{spreadsheets,word,powerpoint,pdf,vector,suite}/`: version-controlled manifests and user documentation.
- `dist/development/`: generated F5/test extensions, with the browser test helper.
- `dist/extensions/`: production staging, with only the selected entry point and renderer.
- `dist/vsix/`: independently installable VSIX archives.

The Rust workspace and its toolchain remain shared build infrastructure. A full source build currently fetches/builds all five adapters. This is a developer requirement, not an installation or runtime dependency between the extensions. Shared VS Code code is compiled once and copied to each package; changes are made once in source.

## Build packages

After [building the renderers](rendering.md):

```sh
npm ci
npm run package
npm run packages:check
```

To package only one already-built renderer, use `npm run package -- spreadsheets` or `npm run package -- word`, `npm run package -- powerpoint`, `npm run package -- pdf`, or `npm run package -- vector`. `npm run package -- suite` needs no Rust toolchain or renderer. Packaging individual renderers requires the pinned Rust toolchain and source checkouts to collect their dependency notices. The workspace's VSIX packager is development tooling and is never included in the installed extensions.

`scripts/stage-extensions.mjs` copies an explicit list of common files and just the selected renderer. Production staging includes neither tests nor the browser test helper. Each manifest also has an explicit package file list. `scripts/collect-notices.mjs` follows each adapter's own Cargo dependency graph and includes available license/NOTICE/font texts plus a dependency inventory. The archived WASM bytes must match the built renderer. Public release still requires reviewing the resulting notices, supported platforms and fidelity limits.

The independent archives are:

```text
dist/vsix/craft-spreadsheets-0.0.4.vsix
dist/vsix/craft-word-0.0.2.vsix
dist/vsix/craft-powerpoint-0.0.2.vsix
dist/vsix/craft-pdf-0.0.1.vsix
dist/vsix/craft-suite-0.0.2.vsix
```

In VS Code, use **Extensions → … → Install from VSIX…** and choose the formats you want. The individual extensions require no companion extension. For the local development Suite, install the five individual archives first, then the Suite archive. Once member IDs are published to Marketplace, the standard extension pack can install its members itself. These commands build local artifacts and do not publish anything.

## Development and verification

Run `npm run compile`, then choose an individual application or **All Craft extensions** from VS Code's Run and Debug dropdown and press F5. Open the matching fixture normally; its extension is the default editor unless an existing user preference overrides it. Each format also has its own optional integration probe.

`npm run test:integration` exercises every extension alone and all five together. `npm run test:rendering` covers spreadsheet/PDF navigation and source preservation. `npm run test:editing` exercises the shared host's save failures, concurrent edits and recovery using spreadsheets. `npm run test:office` exercises DOCX/PPTX native input, rendering, undo/redo, save/reopen, Save As, Revert and recovery, standalone and together. Standalone runs assert sibling extensions are absent.

`npm run packages:check` opens the actual ZIP/VSIX archives to verify renderer, entry point, file association and notice isolation; it verifies the Suite has no runtime code or WASM. `npm run test:installed` installs the real archives into disposable test profiles and checks default opening and actual rendering in production extension mode. The Suite is tested with all five members preinstalled. Headless Linux runs the VS Code commands with `xvfb-run -a`. CI performs all these checks on branch pushes, pull requests and version-tag pushes.

## CI artifact retention

| Artifact | Upload condition | Retention |
| --- | --- | --- |
| `craft-release-vsix-<tag>` | Successful push of a version tag matching `v*`, such as `v0.0.1` | one day |
| `rendering-screenshots` | Failed rendering job, if screenshots exist | 1 day |

Successful branch and pull-request runs upload no artifacts. They still build, package and install-test the extensions; local VSIX output does not consume retained artifact storage. Only `v*` tag pushes retain the VSIX archives. Creating or pushing a tag is a release action, not part of ordinary development merges.

To install on a clean computer, open the successful version-tag run in GitHub Actions and download its `craft-release-vsix-<tag>` artifact, extract it, and install the selected VSIX. For beta tags, use the permanent GitHub Release assets instead of the temporary Actions transfer artifact; public Release downloads do not require an Actions download login. No version-tag artifact exists until a `v*` tag is pushed. Beta tags (`v*-beta.*`) also create a GitHub prerelease after all checks pass; other tags only upload the artifact. Nothing is published to Marketplace, and the package files still use the versions declared in their manifests. Coordinate those versions with the release tag.

Retention is explicitly configured in the workflow and is subject to repository/organization limits. Changes apply to new uploads; they do not shorten existing artifacts' expiry dates. Earlier development artifacts can be deleted without affecting local VSIX files. Action artifacts are temporary downloads; the beta release job attaches permanent VSIX assets and checksums before the transfer artifact expires.

## Migration from the earlier development bundle

The repository root is now a private build workspace rather than a VS Code extension. Restart the F5 development host using one of the new launch configurations. If the old `craft-vscode-dev.craft-vscode` bundle is installed, disable or uninstall it to avoid competing default editors.

The new editor identifiers are `craft.spreadsheets.preview` and `craft.pdf.preview`. Existing preferences referring to `craft.preview` should be changed through **Reopen Editor With… → Configure default editor**. No user settings are overwritten automatically.

The spreadsheet editing suite (`xvfb-run -a npm run test:editing`) additionally checks native cell input, save/reopen, undo/redo, Save As, Revert, write failures, concurrent edits during save and backup recovery. Package versions are recorded in each `packages/*/package.json`; CSV workbook-copy support starts with Spreadsheets 0.1.2.

`npm run test:theme` verifies live native palettes, including high-contrast brightness mapping, in the all-extensions profile. Theme synchronization is included in Spreadsheets 0.0.4 and Word/PowerPoint 0.0.2.


## First beta release

See [v0.1.1-beta.1](releases/v0.1.1-beta.1.md). All VSIX manifests use numeric version `0.1.1` with `preview: true`; the GitHub tag/release carries the beta label. CI creates a prerelease only for a successful beta-tag run. It attaches each independent VSIX and `SHA256SUMS`. No branch build publishes files. A failed release job can be rerun; no automatic retagging or overwriting of published installers is performed.

`npm run test:graphics` checks native PDF/SVG edits, Ctrl+wheel zoom, native keyboard Undo/Redo, saved-file reopening, Save As, Revert and backup recovery, including `.vectorcraft` save/reopen. `npm run test:theme` now covers all five native palettes. Installed-package tests explicitly choose the optional SVG editor.


For Remote SSH, install the desired VSIX into the **SSH host** Extensions section and reload the remote window. Each editor declares `extensionKind: workspace`. The remote host owns reads/writes/recovery; the local webview executes WASM. No Rust or Craft desktop installation is needed on either computer. See [actual SSH verification and reproduction](verification/remote-ssh.md) and [language support](languages.md).

## Cursor / Open VSX publication

Cursor's extension library uses Open VSX. Existing VSIX installers can also be installed manually in Cursor. The Cursor agent-plugin marketplace is a separate distribution system.

Before registry publication, test the native webviews and lifecycle in the current Cursor build, choose a lasting publisher ID (currently `craft-vscode-dev`), create an Eclipse account, sign the Open VSX Publisher Agreement, and create/claim the matching namespace. Store an Open VSX token as a protected CI secret. Publish the five app VSIX files first, then the Suite pack, whose member IDs must match. Upload already verified release archives with `ovsx publish`; do not rebuild independently per store. Publication is not enabled by this change and no token is stored in the repository.

Sources: [Cursor announcement](https://forum.cursor.com/t/extension-marketplace-changes-transition-to-openvsx/109138), [Open VSX publishing guide](https://github.com/eclipse-openvsx/openvsx/wiki/Publishing-Extensions).
