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

CSV uses the native delimiter detector and writer, including quoted fields, multiline text and UTF-8. CSV stores one sheet of values only: formatting and formulas are not retained as workbook features. Saves with additional sheets are rejected to avoid dropping them. Save As keeps the source extension; XLSX/CSV conversion is not offered by the host. Native CSV value inference can normalize numeric/date fields.

The command ribbon starts collapsed to give the document more space. Its tab row stays visible; click a ribbon tab to show the tools when needed.
