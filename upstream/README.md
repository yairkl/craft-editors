# Pinned upstream inputs

`manifest.json` records inspected source revisions and tool versions. The read-only wrappers now have validated WASM builds; the full upstream apps and editing bridges have not been embedded. Adapter dependencies are pinned by `adapters/Cargo.lock`. The verified local build's tool versions, sizes and hashes are recorded in `rendering-build.json`.

Fetch exactly the inspected commits (requires Git and network access):

```sh
npm run upstream:fetch
# Or just one:
npm run upstream:fetch -- gridcraft
```

Sources are detached checkouts under ignored `upstream/checkouts/`. The fetch command refuses to change existing dirty or differently pinned checkouts. It never executes upstream build scripts. If an initial fetch fails, move the incomplete directory aside before retrying.

Build/run commands are in [read-only rendering](../docs/rendering.md). The wrappers use Cargo plus wasm-bindgen, not Trunk. Full-app embedding constraints remain in [the research notes](../docs/upstream-research.md). Asset inspection is recorded in [the rendering inventory](rendering-assets.md); a complete transitive notice bundle is still required before publishing a VSIX.
