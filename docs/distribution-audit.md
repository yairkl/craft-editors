# Distribution review for the preview

This is a review checklist and an inventory finding, not a determination that all third-party obligations are satisfied. Re-run the checks for the exact release artifacts before publishing to a marketplace.

## Current evidence

The packager collects each renderer's Cargo dependency inventory and available license, NOTICE and font files into its VSIX. It also records the upstream source revisions, patch hashes and font source hashes. `npm run packages:check` verifies that the expected notice directory and font license exist; it does **not** prove that every dependency's license obligations have been met.

A local audit of the generated dependency inventories found a declared license expression for every listed dependency. However, 10–35 crates per application had no *per-crate* notice file in their inventory entry. Some are workspace crates whose license files may be collected at the repository root; those associations have not been verified individually. In particular, 16 Symphonia packages in the PowerPoint inventory declare `MPL-2.0` and did not ship a per-crate license file. Packaging now includes the [standard MPL-2.0 text](https://spdx.org/licenses/MPL-2.0.html) and an exact-version crates.io source archive link for each MPL registry dependency; this addresses those missing references, but does not complete the source and attribution review. The metadata inventory is a conservative dependency graph and does not itself prove which crates are linked into a given final binary.

## Before a public marketplace release

1. Rebuild the exact release VSIXs and inspect their `notices/dependencies.json` and accompanying files. Resolve every inventory entry without a per-crate notice to an applicable license/notice, documenting the path and selected option for dual-licensed dependencies. Check font and other embedded asset attribution separately.
2. Determine the actual linked components and applicable source-distribution and notice requirements, including for MPL-licensed code. Keep the relevant source revisions and modifications accessible. Obtain qualified review where needed; do not infer compliance from Cargo metadata alone.
3. Review application names and artwork against each upstream project's brand terms. Use an independent publisher and avoid implying endorsement unless agreed with ArtCraft.
4. Confirm publisher identity, ownership, extension IDs, versioning, update and incident response for both registries. Test installed packages and their notices in VS Code and Cursor. Publish the already-verified archives only after all required release checks pass.

Track unresolved publication decisions in [issue #14](https://github.com/yairkl/craft-vscode/issues/14). The project has not yet completed this review or published to a marketplace.
