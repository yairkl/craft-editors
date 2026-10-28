# Craft Spreadsheets

View and edit XLSX and CSV files inside VS Code using GridCraft. This extension contains only its own renderer and does not require the other Craft extensions.

It opens supported files by default unless you have saved another editor preference. GridCraft's native ribbon, formula bar, grid and bottom worksheet tabs support editing. Use Ctrl/Cmd+S to persist changes in the original format; Save As, undo/redo and Revert integrate with VS Code. Files stay local to the VS Code session.

Use the sheet selector and mouse-wheel scrolling to navigate spreadsheets.

This is a development build. Supports desktop VS Code 1.102+, files up to 32 MiB, and the engine's supported formats/features. Complex document fidelity and full script/font coverage remain under validation.

Code and asset licenses are included under `notices/`.

This is an early editing preview. Verify complex workbooks on copies: charts, images, advanced formatting and broader platform fidelity have not been validated. Failed saves keep edits dirty; external disk changes require Save As or Revert.

Autosave preserves ongoing cell entry. Incomplete formulas defer saving until they are complete; the editor stays active and the file remains dirty.

The native interface follows VS Code’s light/dark theme on opening and while the theme changes. Theme changes do not modify document formatting or mark the file dirty.

Ctrl+wheel over the worksheet uses five-percentage-point steps in the VS Code adapter (10–400%). Native zoom buttons and Ctrl+Alt+plus/minus shortcuts retain GridCraft’s original ten-point behavior. Pinch gestures remain native. The slider and percentage dialog allow an exact zoom.

CSV uses native delimiter detection/writing, quoted fields, multiline text and UTF-8. Value edits and sorting save back to CSV. A format notice offers **Save as XLSX…** only while the current changes require workbook features; the command palette also has **Craft Spreadsheets: Save CSV as Excel Workbook**. Formulas, formatting, charts and multiple sheets remain usable, but CSV cannot retain them. When those features are present, CSV saves/autosave defer and the workbook stays dirty, so closing invokes VS Code's unsaved-changes prompt. Save an XLSX copy to keep the workbook, or explicitly discard the unsaved CSV-session changes. The XLSX copy opens separately and leaves the CSV untouched. Internal snapshots/backups retain workbook features instead of flattening them to CSV. Native CSV value inference can normalize numeric/date fields.

The command ribbon starts collapsed to give the document more space. Its tab row stays visible; click a ribbon tab to show the tools when needed.

## Spreadsheet tools for agents

The extension includes a GridCraft MCP bridge intended for GitHub Copilot in VS Code and Cursor; discovery by those clients has not yet been verified. Enable the Craft Spreadsheets server in the editor's MCP settings; VS Code may offer a refresh action to discover extension-provided servers. Ask the agent to open a workbook by its path before using spreadsheet tools. The server runs locally in the extension host and uses a private loopback connection; agent clients may ask for tool-use approval.

If the workbook is open in Craft Spreadsheets, tools use its live model, including unsaved changes. Edits become normal VS Code document edits and can be undone or saved in the editor. Finish an active cell or text-box draft before using agent tools. If the workbook is closed, the server uses an in-memory session; changes reach the file only when the agent calls `save_workbook`. A headless save refuses to overwrite a file that has changed externally or is open in the editor. If a headless session has unsaved changes when the file is opened in the editor, save those headless changes to a different path to preserve them.

CSV saves are refused when the workbook contains features CSV cannot preserve; ask the agent to save to an XLSX path instead. For an open workbook, use VS Code Save As to save a copy. Screenshot and desktop-only tools are unavailable. The bridge has been exercised in a Linux Remote SSH extension host; actual Copilot and Cursor agent discovery, including remote sessions, requires further end-to-end validation.

When a headless agent saves to a different path, the destination must not already exist. Choose a new filename to avoid replacing another document.
