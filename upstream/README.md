# Pinned upstream inputs

`manifest.json` records inspected source revisions and tool versions. GridCraft, WordCraft, DeckCraft, PdfCraft and VectorCraft adapters embed their native editable UIs. Declared embedding patches are hash-verified and applied during source preparation and rechecked by the build; unrelated upstream changes are refused. Adapter dependencies are pinned by `adapters/Cargo.lock`. The verified local build's tool versions, sizes and hashes are recorded in `rendering-build.json`.

Fetch exactly the inspected commits (requires Git and network access):

```sh
npm run upstream:fetch
# Or just one:
npm run upstream:fetch -- gridcraft
```

Sources are detached checkouts under ignored `upstream/checkouts/`. The fetch command refuses to change existing dirty or differently pinned checkouts. It never executes upstream build scripts. If an initial fetch fails, move the incomplete directory aside before retrying.

Build/run commands are in [rendering](../docs/rendering.md). The wrappers use Cargo plus wasm-bindgen, not Trunk. Full-app embedding constraints remain in [the research notes](../docs/upstream-research.md). Asset inspection is recorded in [the rendering inventory](rendering-assets.md); renderer-specific notice bundles are generated during packaging and require review before public release.

Patches are listed in application order in `manifest.json`. Each file has its own hash and rationale. The verifier checks all hashes, applies the complete ordered set, and rejects any checkout changes beyond that set. Some UI-host patches still need further separation before proposing them upstream; see [the patch review map](../docs/upstream-patch-review.md).
