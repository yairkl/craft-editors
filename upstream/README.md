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

## Checking upstream releases

The **Check upstream releases** workflow checks the latest stable GitHub release for each app every Monday at 04:17 UTC. It can also be started manually from Actions on the default branch. Scheduled checks run from the default branch and may be delayed by GitHub. They do not run on ordinary pushes or publish a release.

Each app is checked independently. If its latest stable version is newer than the pinned workspace version, the job resolves the release tag to a commit and requires it to descend from the current source pin. It then updates that one source pin and extension patch version, applies the existing downstream patches, refreshes the Cargo lockfile and build baseline, and builds and tests the integration on Linux. If these checks pass, it proposes a separate pull request; the PR must still be reviewed and pass the normal platform checks. The update does not merge or publish itself. Releases at or below the pinned version are skipped, including a new tag for the same version. Prereleases are not selected.

If a patch no longer applies, the Rust toolchain or dependencies are incompatible, or a test fails, that app's check fails without creating a PR. Inspect the failed Actions job, then rebase or remove the affected patch and adapt the integration manually as needed. A failed app does not block proposals for other apps. Candidate patches are temporary Actions artifacts retained for one day; successful PRs use the existing short-lived PR installer artifacts. Existing open or closed PRs for the same app and release are left unchanged. If the default branch moves during validation, rerun the job on the new base.

Creating the PR requires enabling **Settings → Actions → General → Workflow permissions → Allow GitHub Actions to create and approve pull requests**. The workflow requests write permissions only in its separate proposal job; it runs upstream code and compatibility checks in a read-only job. With GitHub's built-in token, PR-triggered checks can require a repository member to approve them. See [GitHub's workflow permission settings](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository) and [workflow triggering rules](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow). A GitHub App can be used later if unattended PR checks are desired.

The updater changes the individual extension's numeric patch version, not the Suite pack version or release tag. A compatible update still needs a reviewed merge and the normal manually dispatched release flow before users receive new installers. It does not attempt to rebase patches, upgrade the Rust toolchain, or resolve shared dependency incompatibilities automatically.

Separate app PRs share the Cargo/npm lockfiles and build baseline, so later PRs may need rebasing and fresh checks after an earlier one merges.
