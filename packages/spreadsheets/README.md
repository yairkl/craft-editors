# Craft Spreadsheets

Read XLSX files inside VS Code using GridCraft. This extension contains only its own renderer and does not require the other Craft extensions.

It opens supported files by default unless you have saved another editor preference. GridCraft's native ribbon, formula bar, grid and bottom worksheet tabs support editing. Use Ctrl/Cmd+S to persist XLSX changes; Save As, undo/redo and Revert integrate with VS Code. Files stay local to the VS Code session.

Use the sheet selector and mouse-wheel scrolling to navigate spreadsheets.

This is a development build. Supports desktop VS Code 1.102+, files up to 32 MiB, and the engine's supported formats/features. Complex document fidelity and full script/font coverage remain under validation.

Code and asset licenses are included under `notices/`.

This is an early editing preview. Verify complex workbooks on copies: charts, images, advanced formatting and broader platform fidelity have not been validated. Failed saves keep edits dirty; external disk changes require Save As or Revert.

Autosave preserves ongoing cell entry. Incomplete formulas defer saving until they are complete; the editor stays active and the file remains dirty.
