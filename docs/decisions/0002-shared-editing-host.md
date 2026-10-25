# Shared editing host with native document adapters

Status: accepted. Date: 2026-10-25.

The spreadsheet lifecycle was initially implemented in a spreadsheet-specific provider. Adding Word and PowerPoint would duplicate persistence, conflict detection, backup handling and VS Code history, even though the meaningful variation is inside each application’s document model and native UI.

Use one `EditingProvider` and `EditableDocument` implementation. A descriptor supplies the registered format, engine directory, editor ID and file-dialog label. The host owns URI-based reads/writes, Save As dialogs, cancellation, conflict detection, backup storage and VS Code edit callbacks. Per-program WASM adapters own native UI/input, model snapshots, serialization, acknowledged saved state and restoration. The session-scoped RPC protocol is shared. There is no mandatory shared extension; source is compiled and bundled separately in each application package.

The native interface consists of startup with initial bytes and frame/edit/command callbacks, commit, serialize, mark_saved, mark_original, restore_history, replace, blank_document, unit_count and set_theme. GridCraft keeps its established class/inspection methods; the bootstrap adapts that naming without duplicating the host lifecycle. Native WordCraft/DeckCraft runners share Rust implementation, while differences between their pinned egui versions remain inside the adapters.

Each format must prove real native input → dirty state → serialization → filesystem write → exact-revision acknowledgment → reopen, plus history and recovery. A format is not supported merely by registering its suffix. PDF remains read only. Source and dependency pins, minimal embedding patches, generated wrapper modules and notices are verified as build inputs. Native title/File chrome and the extra HTML save header are omitted because VS Code owns file lifecycle.

Consequences: persistence fixes apply to every editable format, installation stays independent, and model/history details stay local to adapters. Program-specific fidelity, advanced clipboard/file-picker services, printing, accessibility, synchronized views and platform coverage still require their own validation. The native engines are early-stage applications; this integration does not promise Microsoft Office parity.
