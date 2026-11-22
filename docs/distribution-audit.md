# Distribution review for the preview

## 0.1.7 candidate review (2026-11-22)

The five application installers use the pinned sources in `upstream/manifest.json` and modified host adapters. The optional Suite contains no renderer. This record describes packaging evidence; it does not certify marketplace approval or complete every publication requirement in [issue #14](https://github.com/yairkl/craft-editors/issues/14).

| Installer | Conservative Cargo inventory | Previously unassociated notices | Resolution |
| --- | ---: | ---: | --- |
| Spreadsheets | 289 | 35 | Repository-root associations and pinned registry supplements |
| Documents | 311 | 37 | Repository-root associations and pinned registry supplements |
| Presentations | 303 | 42 | Repository-root associations and pinned registry supplements |
| PDF | 454 | 78 | Repository-root associations and pinned registry supplements |
| Vector | 352 | 53 | Repository-root associations and pinned registry supplements |
| Suite | 0 | 0 | Original icon, MIT integration license; no engine |

These counts include build dependencies and potentially unused features. They must not be presented as an exact list of linked crates. We retain the conservative graph and its notices rather than removing entries based on unverified linking assumptions.

Local candidate validation on 2026-11-22 found zero inventory entries without notice associations in all five VSIXs. The supplement manifest covers 41 package versions across 17 source revisions with 32 retained notice files. Type checking, 17 npm tests, 22 Python tooling tests, fixture verification, packaging and archive verification passed. Installed-package tests passed for all five applications independently and with the Suite in disposable Linux VS Code 1.102.0 profiles. A direct VSIX upgrade from the published 0.1.6 beta also passed version and rendering checks. This is not a store installation or upgrade test. See [the candidate verification record](verification/publication.md).

## License and source evidence

`collect-notices.mjs` now associates workspace/git crates with the license and attribution files at their own repository roots. Registry crates whose published archives omit license files receive supplements from the exact repository commits recorded in their `.cargo_vcs_info.json`. The checked-in `licenses/registry-supplements/manifest.json` records package versions, immutable revisions, source URLs and content hashes. Supplements are verified locally during packaging; no network lookup of floating license text is needed.

`licenses/choices.json` records the selected option for every known Cargo license expression. MIT is selected for alternatives offering it; compound AND requirements are retained. Apache-2.0 is selected for self_cell rather than GPL-2.0-only. Unknown expressions stop packaging for review. Retaining additional license texts does not change the recorded selection.

Each installer includes `notices/dependencies.json` with these choices and notice paths, exact-version crates.io source archive links for registry dependencies, and `notices/provenance.json` with the upstream revision, adapter lock hash, renderer hashes and modification patch hashes. The actual upstream patches are bundled under `notices/modifications/`. Registry MPL-2.0 dependencies retain their license text and exact-version source links; these registry packages are not patched by this integration. The dependency source revisions remain accessible through the Cargo lockfile and their upstream repositories.

Archive verification requires every dependency to have notices and a recorded license selection, every referenced notice to exist, and packaged renderers and modification patches to match their provenance hashes. This is a mechanical completeness check; it does not prove that every asset or legal obligation has been identified.

## Assets and branding

The applications' pinned `NOTICE` and `ATTRIBUTION.md` files identify embedded font/data inputs, including egui fonts and their MIT, Bitstream Vera, OFL and Ubuntu Font Licence notices. These texts and available asset notices are retained. The additional unmodified Noto Sans Hebrew font has its pinned source and OFL text recorded in `upstream/font-assets.json`, copied to each application's `notices/fonts/`. Optional unpinned external fonts are rejected by the renderer build.

The upstream `docs/brand/LICENSE-brand.txt` terms require modified builds to remove ArtCraft marks. The pinned PDF/vector branding patches replace the embedded mark artwork; the shared host disables upstream title branding. Extension icons are original artwork with editable sources in `assets/icons/`. Listings describe an independent community preview and identify the upstream projects without claiming endorsement. This source inspection is not a trademark clearance for the eventual publisher name.

## Outstanding marketplace acceptance

- Publisher/namespace ownership is undecided, as confirmed by the maintainer on 2026-11-22. Keep `craft-vscode-dev` for GitHub betas until a permanent identity is chosen; do not silently change existing extension IDs.
- Create/claim the chosen identities on both registries, complete the Eclipse publisher agreement, and configure protected publishing credentials or trusted publishing. No repository publishing secrets were configured at review time.
- Test installation and upgrade of the exact archives in current desktop VS Code and Cursor, including all five editor lifecycles, MCP discovery and the Suite. The cross-platform CI runs VS Code and does not establish Cursor compatibility.
- Review the exact candidate notices and listing identity before the first marketplace upload. Store upload and update behavior are still unverified.

Keep issue #14 open until these remaining acceptance criteria have evidence. See [the publication runbook](publication.md) for the maintainer steps.

## Completed release validation

The [tagged 0.1.7 beta release workflow](https://github.com/yairkl/craft-editors/actions/runs/45001299920) passed all required checks, including full Linux editor suites, Remote SSH and the Linux/macOS/Windows matrix. It published [v0.1.7-beta.1](https://github.com/yairkl/craft-editors/releases/tag/v0.1.7-beta.1) with six VSIX files and checksums. This completes GitHub beta release validation; the marketplace requirements above remain open.
