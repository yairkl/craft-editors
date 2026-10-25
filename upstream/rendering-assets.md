# Initial renderer asset inventory

This records sources inspected for the adapters. GridCraft now supplies its native ribbon, formula bar, grid, tabs and dialogs; its title bar and File tab are hidden. PdfCraft and VectorCraft supply their full native interfaces. No upstream icons or splash assets are copied separately. The declared GridCraft service patch is recorded in `manifest.json`. Independent VSIX packaging follows each adapter's Cargo graph and collects available license/NOTICE/font texts plus `notices/dependencies.json`. Review the generated inventory, including entries without packaged license texts, before public release.

| Input | Version/source | License and handling |
| --- | --- | --- |
| GridCraft engine, model, XLSX and grid UI | `manifest.json` GridCraft pin | MIT OR Apache-2.0; preserve upstream license texts with any distributed bundle |
| GridCraft shared UI helpers | `craft-libs` revision `d27646a5f7c8b4fc85d9dd3213b8c88b58e0088d`, adapter lockfile | Preserve that dependency's license texts |
| PdfCraft rendering, COS, filters and font helpers | `manifest.json` PdfCraft pin | MIT OR Apache-2.0; preserve upstream license texts |
| PdfCraft renderer patches | shared `craft-libs` revision `a0916808f7d78bed8c7b90cdf937176015454a7f` (Hayro/Krilla), plus PdfCraft vendored lopdf/vello_common | Preserve each vendored crate's license/NOTICE files; upstream `vendor/README.md` records patches |
| egui/eframe/epaint | 0.36.2 and pinned 0.37 fork, adapter lockfile | MIT OR Apache-2.0; collect package notices |
| egui default fonts | `epaint_default_fonts` 0.36.2 `fonts/` | Ubuntu Light: Ubuntu Font Licence; Hack: bundled Hack license; Noto Emoji: OFL; emoji icon font: bundled MIT notice. Preserve all shipped font license files |
| PdfCraft Latin/signature font helpers | `assets/fonts/Inter-*.ttf`, `DancingScript.ttf` | OFL-1.1; source attribution and OFL files are recorded in pinned PdfCraft `ATTRIBUTION.md` and `assets/fonts/` |
| PDF renderer fallback fonts | PdfCraft vendored Hayro plus resolved dependency packages | Collect their font license files before distribution; baseline PDF smoke output has been visually verified, not exhaustively audited |
| Optional craft-fonts | Not enabled | Build script rejects the unpinned environment input |
| Test documents | `scripts/generate-fixtures.py` | Original synthetic documents under this repository's MIT license; no external corpus or font files embedded |

All additional code dependencies are fixed by `adapters/Cargo.lock`. Source pinning, this inventory and automated notice collection do not replace a release review. Generated binaries and local VSIX files remain ignored build output.


## Beta distribution review (2026-10-25)

The native PDF integration replaces every `docs/brand` logo inclusion with original geometric SVG; VectorCraft replaces its compiled brand image with original code-generated geometry and hides the native brand/home/document tabs in embedded mode. No trademark artwork is copied into package media. Names appear only as upstream attribution; this is an independent community project.

Package notice generation follows each renderer's reachable Cargo graph, retains source-root LICENSE/NOTICE and attribution inventories, and collects font license texts from source-root assets as well as dependency packages. This covers PdfCraft's Inter/JetBrains Mono/Dancing Script fonts, VectorCraft's bundled interface/document fonts and egui 0.36/0.37 default fonts. Optional external `craft-fonts` remains disabled. Registry/git license declarations and package notices are reviewed in `dist/notices/*/dependencies.json`; sibling engines remain excluded by archive checks. Code licenses and font/asset licenses remain separate.

Native PDF snapshots preserve the object graph and working bytes; the only renderer compatibility patch removes a warning variant absent from the newer shared Hayro API. Upstream artwork is not used in beta screenshots: fixtures are original generated geometry/text. The beta is a tested integration preview, not a claim of complete document fidelity or platform coverage.

The reachable dependency declarations contain no undeclared licenses. `self_cell` offers Apache-2.0 OR GPL-2.0-only; this distribution selects Apache-2.0 and retains its license text. Other notices include font licenses, Unicode data, IJG and the unmodified MPL-2.0 dependency used by DeckCraft. Their upstream sources are recorded in each inventory.

All five adapters additionally embed Noto Sans Hebrew from Google Fonts revision `8b0a1d0f5983c89bc2b93f1b5fb55f9e252744b5` under OFL-1.1. `font-assets.json` pins the font/license hashes; source preparation fetches them and builds verify them. Each application independently embeds the fallback and carries its OFL/attribution files; there is no mandatory font/core extension.
