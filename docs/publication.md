# Publication runbook

GitHub beta distribution and marketplace publication have separate prerequisites. The current supported channel is GitHub prereleases. All extensions remain previews; users should test with copies of valuable documents. The repository maintainer owns integration releases and security reports; upstream projects are not implied to endorse or support these packages.

## Prepare and validate a GitHub beta

1. Update affected package versions and the workspace lockfile. The Suite may retain its version when unchanged; bump it when releasing a coordinated set.
2. Add `docs/releases/<tag>.md` with exact installer names, changes, compatibility limits and installation instructions. Refresh the README links.
3. Build pinned renderers, run the contributing checks, package, and run `npm run packages:check`. Inspect each archive's `notices/dependencies.json`, `notices/provenance.json` and font attribution. See [the distribution review](distribution-audit.md).
4. Push the verified release commit and a new immutable `v*` tag. Dispatch `gh workflow run ci.yml --repo yairkl/craft-editors --ref <tag>`. The workflow builds the release engines and installers, runs the full required suites, and publishes a GitHub release only after successful jobs. A hyphen in the tag marks a prerelease.
5. Check every job and verify the published `SHA256SUMS`. Record the release run URL and tag. Do not reuse a published version for changed bytes or move a release tag; fixes receive a new package version and tag.

## First marketplace publication

Publisher ownership is an explicit maintainer decision and remains unresolved. Choose the same durable namespace on Visual Studio Marketplace and Open VSX where possible. Changing `publisher` changes extension IDs and requires updating the Suite members and documenting manual migration; it is not an automatic update for existing installations.

Create the Marketplace publisher using its management portal. Register the Eclipse account, link GitHub, accept the Open VSX publisher agreement and create/claim the namespace. Account agreements and ownership cannot be established by a successful build. Prefer trusted publishing where supported; otherwise store scoped credentials as protected CI secrets, never in source or chat. Configure registry workflows only after identity and authentication are established.

Use the already verified release VSIX files for both registries. With appropriate authentication configured, the CLI forms are `vsce publish --packagePath <file.vsix>` and `ovsx publish <file.vsix>`; check the installed CLI's current authentication options before use. Publish the five apps first and the Suite only after its member IDs resolve. Keep the first launch explicitly marked preview.

Before uploading, record a clean installation and an upgrade from the previous beta in VS Code and Cursor: default file associations, each editor's render/edit/save/reopen, undo/redo, backup recovery, Markdown/CSV/TSV conversions, MCP discovery, and Suite installation. Use disposable profiles and document editor/OS versions, artifact hashes and results. CI currently verifies VS Code rather than Cursor.

Authoritative setup references: [Visual Studio Marketplace publishing](https://code.visualstudio.com/api/working-with-extensions/publishing-extension) and [Open VSX publishing](https://github.com/eclipse-openvsx/openvsx/wiki/Publishing-Extensions). Verify their current account and authentication requirements during setup.

## Updates and incident response

Maintain the latest preview and publish fixes under increasing versions. GitHub VSIX installations require manual updates; registry updates follow the installed extension ID. Keep support at the repository issue tracker and vulnerabilities in [private reporting](../SECURITY.md).

If opening or saving corrupts files, recovery loses serialized edits, or a security flaw is confirmed, stop further distribution, reproduce using a disposable copy, and prepare a corrected version. Mark the affected release prominently and remove affected downloads where needed; do not replace published bytes silently. Test reinstalling the previous known-good VSIX in a disposable profile before recommending a downgrade, and document any incompatible document or backup changes. Notify affected users through release notes or a security advisory as appropriate; never publish private reproduction documents.
