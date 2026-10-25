# Initial renderer asset inventory

This records the source paths inspected for the read-only wrappers. The wrappers do not copy upstream application icons, splash screens, About dialogs or ArtCraft marks. Their viewports use GridCraft's grid and PdfCraft's rasterizer, not the full upstream application shells. No upstream code is modified. A complete transitive license/NOTICE report remains a prerequisite for a distributed VSIX.

| Input | Version/source | License and handling |
| --- | --- | --- |
| GridCraft engine, model, XLSX and grid UI | `manifest.json` GridCraft pin | MIT OR Apache-2.0; preserve upstream license texts with any distributed bundle |
| GridCraft shared UI helpers | `craft-libs` revision `d27646a5f7c8b4fc85d9dd3213b8c88b58e0088d`, adapter lockfile | Preserve that dependency's license texts |
| PdfCraft rendering, COS, filters and font helpers | `manifest.json` PdfCraft pin | MIT OR Apache-2.0; preserve upstream license texts |
| PdfCraft renderer patches | `vendor/{hayro,hayro-interpret,hayro-syntax,hayro-cmap,hayro-postscript,hayro-jbig2,lopdf,vello_common}` | Preserve each vendored crate's license/NOTICE files; upstream `vendor/README.md` records patches |
| egui/eframe/epaint | 0.36.2, adapter lockfile | MIT OR Apache-2.0; collect package notices |
| egui default fonts | `epaint_default_fonts` 0.36.2 `fonts/` | Ubuntu Light: Ubuntu Font Licence; Hack: bundled Hack license; Noto Emoji: OFL; emoji icon font: bundled MIT notice. Preserve all shipped font license files |
| PdfCraft Latin/signature font helpers | `assets/fonts/Inter-*.ttf`, `DancingScript.ttf` | OFL-1.1; source attribution and OFL files are recorded in pinned PdfCraft `ATTRIBUTION.md` and `assets/fonts/` |
| PDF renderer fallback fonts | PdfCraft vendored Hayro plus resolved dependency packages | Collect their font license files before distribution; baseline PDF smoke output has been visually verified, not exhaustively audited |
| Optional craft-fonts | Not enabled | Build script rejects the unpinned environment input |
| Test documents | `scripts/generate-fixtures.py` | Original synthetic documents under this repository's MIT license; no external corpus or font files embedded |

All additional code dependencies are fixed by `adapters/Cargo.lock`. Source pinning and the above inventory are not a full transitive redistribution notice bundle. Generated binaries remain ignored local build output.
