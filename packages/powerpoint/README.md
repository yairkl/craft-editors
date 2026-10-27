# Craft PowerPoint

## Presentation tools for agents

Craft PowerPoint provides the pinned DeckCraft MCP tools to GitHub Copilot and Cursor. Enable the Craft PowerPoint MCP server and ask the agent to open a PPTX file by path. Open presentations use the live editor model and VS Code undo/save; closed files use a headless session and are written only when the agent calls `save_presentation`. Headless saves detect external changes and cannot overwrite an open editor. If a presentation becomes open while the agent has unsaved headless changes, save those changes to a different path.

Finish an active slide interaction or text composition before using agent tools. Desktop-only UI tools and presentation mode are unavailable in the embedded editor. Use VS Code Save As for a copy of an open presentation. The bridge is tested in a Linux Remote SSH extension host; actual Copilot and Cursor discovery needs end-to-end validation.

Open and edit `.pptx` files with DeckCraft's native interface. Files open in this editor by default unless you have saved another preference. Use VS Code Save, Save As, undo/redo and Revert. No other Craft extension is required; only this program's engine is bundled.

This is an early editing preview. Generated fixtures are tested on Linux; complex format fidelity and other platforms require further validation. Keep copies of important documents. Files stay local to the VS Code session.

The native interface follows VS Code’s light/dark theme on opening and while the theme changes. Theme changes do not modify document formatting or mark the file dirty.

Slideshow, Presenter View and recording launches are unavailable in the embedded editor: its webview cannot supply separate fullscreen audience and presenter displays. Use View > Reading View for an in-editor preview, or save the PPTX and present it with a standalone presentation application. Editing, animations preview, notes and normal saving remain available.

The command ribbon starts collapsed to give the document more space. Its tab row stays visible; click a ribbon tab to show the tools when needed.
