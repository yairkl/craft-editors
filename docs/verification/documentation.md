# Documentation verification

On 2026-10-30, a disposable Linux checkout of the documentation branch was used to check the contributor setup. With Node.js 22 and Python available, `npm ci`, `npm run check`, `npm test`, `npm run fixtures:check`, and `npm run upstream:fetch` passed. The fetch checked out all five declared upstream revisions and applied the declared patch sets. The documented adapter and shared-runtime Rust formatting checks also passed using an existing Rust 1.95.0 installation.

A local check of README, CONTRIBUTING, SECURITY, package READMEs and Markdown files under `docs/` found all 62 relative file targets and heading anchors. This does not validate external URLs, generated links, or GitHub's rendering of every Markdown construct.

This is not a full end-to-end clean-machine release verification. The graphical VS Code suites, full renderer rebuild, installation and update tests, platform-specific commands, SSH setup, and each optional or destructive maintenance command were not rerun in this checkout. Earlier release and large-file results are recorded separately in [platform CI](platform-ci.md), [Remote SSH](remote-ssh.md), and [large files](large-files.md). Those reports do not establish that every documented command works in every environment.
