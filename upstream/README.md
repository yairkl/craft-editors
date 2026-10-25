# Pinned upstream inputs

`manifest.json` records inspected source revisions and candidate tools. `artifact: null` means no validated WASM bundle is available. Source pins alone do not establish reproducible builds: transitive git dependencies, Trunk's downloaded tools, assets and output hashes still need verification.

Fetch exactly the inspected commits (requires Git and network access):

```sh
npm run upstream:fetch
# Or just one:
npm run upstream:fetch -- gridcraft
```

Sources are detached checkouts under ignored `upstream/checkouts/`. The fetch command refuses to change existing dirty or differently pinned checkouts. It never executes upstream build scripts. If an initial fetch fails, move the incomplete directory aside before retrying.

Build preparation and embedding constraints are in [the research notes](../docs/upstream-research.md). Do not bundle upstream assets until the branding and license inventory is complete. Builds are intended for local feasibility work first.
