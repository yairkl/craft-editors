# Craft Documents

## Document tools for agents

Craft Documents includes a bridge for the pinned WordCraft MCP tools, intended for GitHub Copilot and Cursor. Discovery has been verified in VS Code and Cursor. Enable the Craft Documents MCP server, then ask the agent to open a DOCX document by path. An open document uses the live editor model and VS Code undo/save; a closed document uses a headless session and is written only when the agent calls `save_document`. Headless saves detect external changes and cannot overwrite an open editor. If the document becomes open while the agent has unsaved headless changes, save those changes to a different path.

Agent commands can change the live document's selection. Desktop-only UI tools and password-protected document opening are unavailable. Use VS Code Save As for a copy of an open document. The bridge is tested in a Linux Remote SSH extension host; real-client editing and remote workflows need end-to-end validation.

Open and edit `.docx` files with WordCraft's native interface. Files open in this editor by default unless you have saved another preference. Use VS Code Save, Save As, undo/redo and Revert. No other Craft extension is required; only this program's engine is bundled.

This is an early editing preview. Generated fixtures are tested on Linux, macOS and Windows; complex format fidelity and broader platform configurations require further validation. Keep copies of important documents. Files stay local to the VS Code session.

The native interface follows VS Code’s light/dark theme on opening and while the theme changes. Theme changes do not modify document formatting or mark the file dirty.

Hebrew letters and niqqud are available through a bundled, hash-verified Noto Sans Hebrew fallback (SIL OFL 1.1). Use the native paragraph direction controls for right-to-left paragraphs. This fixes the integration’s missing Hebrew font; it is not a claim that every bidirectional editing case is validated. Undo/Redo preserves document focus so typing can continue without another click.

The command ribbon starts collapsed to give the document more space. Its tab row stays visible; double-click a ribbon tab, or use Ctrl+F1, to show the tools when needed.

When a headless agent saves to a different path, the destination must not already exist. Choose a new filename to avoid replacing another document.

Files up to 256 MiB are supported by default. Set `craft.word.maxFileSizeMiB` (up to 1024 MiB) to change the limit. Large or complex documents can use substantially more memory.

## Markdown

Markdown files open in your usual editor by default. Choose **Reopen Editor With… → Craft Documents**, or use the title-bar buttons to switch between text and Craft Documents.

WordCraft supports a subset of Markdown. The editor saves back to Markdown only when both the original source and the edited document pass conservative round-trip checks. Otherwise it keeps the file unchanged, pauses autosave, and offers **Save as DOCX…**; the source may contain features that WordCraft could not import, so the DOCX copy cannot necessarily preserve those features. Saving can rewrite Markdown syntax even when document content survives. These checks can also block harmless source variations. Use the text editor when exact source fidelity matters. Unsaved edits use DOCX snapshots for backup and recovery. Markdown files are not yet supported by the document agent bridge.
