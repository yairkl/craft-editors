# Draft collaboration proposal

Recommended destination: a beta/demo comment on the existing open VS Code integration proposal, https://github.com/storytold/artcraft/issues/2244. The repository has Issues enabled and no Discussions section. Cross-link accepted implementation work from small PRs in the relevant app repositories. This file is a draft; nothing has been sent upstream.

Suggested comment heading: **[Proposal] Native Craft editors inside VS Code — beta integration and upstream embedding hooks**

---

Following this proposal, we've built an independent VS Code integration for GridCraft, WordCraft, DeckCraft, PdfCraft and VectorCraft:

- Source: https://github.com/yairkl/craft-vscode
- Installation beta: https://github.com/yairkl/craft-vscode/releases/tag/v0.1.2-beta.4
- Each app is independently installable, with an optional extension pack.
- Native Rust/egui UIs run as WASM inside VS Code editor tabs. Files stay local to the VS Code session, with no processing service or external app dependency.
- A shared host handles Save/Save As, cancellation, disk-conflict checks, exact-revision acknowledgments, VS Code Undo/Redo, Revert and recovery. Native app chrome is adapted for embedding, and light/dark follows VS Code.

This explores interactive WASM editing alongside the CLI/MCP direction proposed here; it includes MCP bridges tested with a test client; real Copilot and Cursor discovery and every Remote SSH configuration remain unverified.

The beta includes integration tests for native edits, scroll zoom, save/reopen, history, recovery, package isolation and installed VSIX behavior. It is not a complete fidelity/platform claim: generated fixtures, Linux/macOS/Windows CI and actual Linux Remote SSH lifecycle tests are covered; complex documents, WSL, Cursor and wider SSH network/authentication cases need more testing. Unserializable drafts defer autosave/backup rather than interrupt typing.

We maintain small hash-verified patches against immutable upstream revisions. We'd like to discuss upstream support for:

1. Optional host callbacks for file lifecycle and history, with no saved-state acknowledgment before the host confirms persistence.
2. An embedded mode that omits standalone file/window chrome and trademark artwork while keeping native editing tools.
3. Stable document snapshot/restore and serialization interfaces, so hosts can implement Undo/Redo and recovery without reaching into private engine state.

Would you prefer this to remain a community-maintained integration linked from the app docs, or consider official maintenance/organization ownership? Before Marketplace publication, we'd also like to agree on naming, publisher ownership and how the integration should describe its relationship to Storytold.

We can submit the generic embedding changes as separate focused PRs, following each app's contribution and test requirements. The VS Code-specific packaging and lifecycle code can remain in the integration repository. A short original-fixture demo can accompany the proposal.
