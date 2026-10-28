# Draft collaboration proposal

**Suggested destination:** a comment on the existing [ArtCraft VS Code integration request](https://github.com/storytold/artcraft/issues/2244), which is open. This is a draft for review; nothing has been sent upstream. Link the latest published GitHub prerelease after the release flow succeeds.

---

Following this proposal, we've built [Craft for VS Code](https://github.com/yairkl/craft-vscode), an independent community integration of GridCraft, WordCraft, DeckCraft, PdfCraft and VectorCraft. [Preview installers](https://github.com/yairkl/craft-vscode/releases) are available for testing.

Each editor is an independently installable extension, with an optional suite pack. The existing Rust/egui applications run as WASM inside VS Code editor tabs; a shared host handles VS Code file access, Save/Save As, undo/redo, revert and recovery. Linux Remote SSH lifecycle tests use the remote extension host and workspace filesystem. Each app also exposes a bridge to its existing MCP tools; the project owner has verified discovery in VS Code and Cursor.

This is an early preview, not a claim of full file-format fidelity. CI covers Linux, Apple Silicon macOS and Windows, and a Linux Remote SSH scenario. Content-filled large workbook and PDF fixtures have been tested locally; complex real-world documents, broader remote configurations, accessibility and IME input still need work. Some incomplete drafts cannot yet be recovered after a crash. The integration is independent and has not been published to a marketplace.

We currently maintain pinned source revisions and hash-verified downstream [embedding patch groups](https://github.com/yairkl/craft-vscode/blob/master/docs/upstream-patch-review.md). Some UI groups still combine concerns; we would not propose them upstream wholesale. We would value your guidance on whether it would be useful to propose narrowly scoped changes such as:

1. **Host-owned file lifecycle and history callbacks**, with saved-state acknowledgment only after the host confirms persistence.
2. **Stable document snapshot and restoration interfaces** for host undo/redo and recovery, with standalone behavior unchanged.
3. **Generic embedding capabilities** for optional chrome, host-supplied fonts and presentation surfaces, rather than VS Code-specific UI behavior.

Would you prefer this to remain a community-maintained project linked from the app documentation, or would you be interested in closer collaboration or official ownership? Before marketplace publication, we'd also welcome guidance on project naming, branding and publisher ownership.

If useful, we can share a short demo with original fixtures and prepare small, independently tested pull requests in the relevant app repositories. VS Code packaging and editor-specific behavior can remain in this repository. No upstream acceptance or endorsement is assumed.
