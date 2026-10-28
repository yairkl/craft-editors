# Draft collaboration proposal

**Suggested destination:** a comment on the existing [ArtCraft VS Code integration request](https://github.com/storytold/artcraft/issues/2244), which is open. This is a draft for review; nothing has been sent upstream. Link the latest published GitHub prerelease after the release flow succeeds.

---

Hi @echelon, following this proposal, I built [Craft for VS Code](https://github.com/yairkl/craft-vscode), an independent community integration of GridCraft, WordCraft, DeckCraft, PdfCraft and VectorCraft. [Preview installers](https://github.com/yairkl/craft-vscode/releases) are available.

Each editor is an independently installable extension, with an optional suite pack. The existing Rust/egui applications run as WASM inside VS Code editor tabs; a shared host handles VS Code file access, Save/Save As, undo/redo, revert and recovery. The integration supports Remote SSH and exposes a bridge to each app's existing MCP tools.

This is an early preview, and full file-format fidelity is not guaranteed. Accessibility, IME input and crash recovery for some incomplete drafts still need work. The integration is independent and has not been published to a marketplace.

I currently maintain pinned source revisions and hash-verified downstream [embedding patch groups](https://github.com/yairkl/craft-vscode/blob/master/docs/upstream-patch-review.md). Some UI groups still combine concerns, so I would propose focused changes rather than submit those patches wholesale. I would value your guidance on whether changes such as these would be useful upstream:

1. **Host-owned file lifecycle and history callbacks**, with saved-state acknowledgment only after the host confirms persistence.
2. **Stable document snapshot and restoration interfaces** for host undo/redo and recovery, with standalone behavior unchanged.
3. **Generic embedding capabilities** for optional chrome, host-supplied fonts and presentation surfaces, rather than VS Code-specific UI behavior.

Would you prefer this to remain a community-maintained project linked from the app documentation, or would you be interested in closer collaboration or official ownership? Before marketplace publication, I would also welcome guidance on project naming, branding and publisher ownership.

If useful, I can share a short demo and prepare small, focused pull requests in the relevant app repositories. VS Code packaging and editor-specific behavior can remain in this repository. No upstream acceptance or endorsement is assumed.
