# Design: a shared Craft document host for VS Code

Status: native XLSX/DOCX/PPTX editing lifecycle and read-only PDF rendering implemented; broader format/platform validation remains open. Updated: 2026-10-25.

Spreadsheets, Word and PowerPoint use one `CustomEditorProvider` implementation with per-program native adapters; PDF uses `CustomReadonlyEditorProvider` with PdfCraft's rasterizer. The host owns serialization requests, persisted-save acknowledgments, undo/redo callbacks, backups and Revert. See [the implemented editing lifecycle](editing.md). The design below describes the broader target, including formats and capabilities still planned.

## Goals and boundaries

Provide independently installable application extensions for XLSX, DOCX, PPTX, and PDF documents, maintained in one repository with shared host code. Offer an optional Suite extension pack. Reuse upstream Rust engines and their WASM interfaces. Make document edits behave like native VS Code custom editors, including save, recovery, and external changes. This replaces the initial all-format extension packaging assumption; see [ADR-0001](decisions/0001-independent-extensions.md).

The first release does not include collaboration, Office feature parity, macros, the entire creative suite, or mandatory CLI/MCP services. Browser-hosted VS Code and multiple simultaneous editable views require separate validation. An editor may expose only the modifications its upstream engine supports.

## Architecture

```text
Application extension (Spreadsheets / PDF / future programs)
  Shared VS Code custom editor host (bundled locally in each package)
    Document coordinator + workspace.fs + backups
      Versioned message bridge
        Webview bootstrap + per-app adapter
          Pinned upstream WASM application + engine
```

The extension owns resource URIs, persistence, conflict detection, editor registration, and recovery metadata. The WASM engine owns the live editable document and its history. The adapter translates between the app's services and the common protocol. The extension does not maintain a second independently editable document model.

Use `CustomEditorProvider` for editable binary documents. Each application extension owns unique editor IDs and registers as default for its own formats while respecting explicit user associations. Keep the per-extension integration probes optional. A capability-limited read-only mode may use `CustomReadonlyEditorProvider`; it must also disable mutation in the application UI.

Prefer loading the application directly in the webview with a VS Code bridge. Existing same-origin iframe bridges are useful reference implementations, but cannot be assumed to work unchanged inside VS Code. Avoid a local HTTP server. Test WASM loading, worker requirements, CSP, WebGL/WebGPU fallback, and asset addressing before choosing the bootstrap implementation.

## Document identity and ownership

One coordinator exists per resource URI, with a unique session ID and monotonically increasing revision. Initially allow one editable view per document, using VS Code's provider options where supported. Reopening or splitting must not create competing writable engine sessions. Shared editable views can be added later with explicit synchronization.

The coordinator retains enough serialized state to recover from webview disposal. A retained webview is a performance option, not a correctness mechanism. Initialization must restore either the saved file or a newer backup before enabling edits.

## Protocol proposal

Use a small versioned envelope with protocol version, session ID, request ID where relevant, message type, and document revision. Validate type, size, session, and allowed operation before acting. Unknown operations fail explicitly. Negotiate capabilities rather than assuming every app supports every operation.

| Direction | Operation | Contract |
| --- | --- | --- |
| App → host | `ready` | Protocol/app versions and capabilities |
| Host → app | `open` | Filename, bytes, initial revision, and mode |
| App → host | `changed` | New revision and history availability |
| Host → app | `serialize` | Request document bytes for save or backup |
| App → host | `serialized` | Bytes, format, and the exact serialized revision |
| Host → app | `saved` | Acknowledge the revision successfully persisted |
| Host → app | `undo`, `redo` | Apply engine history and report resulting revision |
| Host → app | `restore` | Restore file/backup bytes and session metadata |
| Either | `error`, `dispose` | Structured failure or lifecycle teardown |

App File > Save requests host persistence; it must not download files or clear dirty state on message delivery. Save As and exports are distinct operations with explicit destination selection. Resource reads for embedded or linked assets are mediated by the host and scoped to the document's allowed resources.

Use the binary transport supported by the selected minimum VS Code version. Measure copying and serialization overhead before introducing chunking. Requests need bounded timeouts, cancellation where possible, and stale-response rejection. Long engine operations may not be interruptible; cancellation must still prevent late results from writing files.

## Save and recovery lifecycle

1. An engine edit increments the revision and emits a custom-document change event.
2. VS Code save requests serialize the current revision. Continue tracking edits made during serialization.
3. Check for external changes and serialize writes through a per-document queue.
4. Persist through VS Code URI APIs. Use atomic replacement only where the filesystem provider supports it; do not assume local rename semantics everywhere.
5. Acknowledge the persisted revision only after the write succeeds. Newer edits remain dirty. A failed write retains dirty state and reports the error.

Backups serialize the current document independently of its original format's normal save workflow when necessary. Record app version, format, session/revision, and recovery payload version. Restore backups on hot exit/reload and reject incompatible recovery data with a useful error. Password-protected documents require explicit handling of decrypted backup content before claiming support.

Save As must not silently convert formats. Revert reloads the saved resource and resets history after VS Code initiates it. Watch external modifications: refresh clean documents; offer conflict resolution for dirty documents. File metadata or content hashes can detect common conflicts, but generic filesystem APIs cannot guarantee compare-and-swap against another writer; document that limit.

## Undo and redo

Keep the engine as history authority and integrate VS Code's undo/redo commands and events. Prototype `CustomDocumentEditEvent` callbacks with stable history tokens. Reject out-of-order operations and prevent independent app keyboard handling from bypassing the coordinator.

If an engine cannot expose stable history operations, use a documented snapshot-based strategy or temporarily limit that capability. This decision must be resolved for GridCraft before duplicating adapters across the suite.

## Remote workspaces and privacy

Use `workspace.fs` and URIs for local, WSL, and Remote-SSH resources. The webview executes on the client; WASM processing therefore receives document bytes on that client even when the workspace is remote. No third-party processing service is involved. This differs from a future CLI mode, which could process documents on the remote host.

Webviews receive no filesystem authority. Apply a restrictive CSP, limit local resource roots, validate bridge messages, and mediate external links. Do not execute macros or document scripts. Keep document contents and secrets out of diagnostic logs. Offline operation requires all runtime resources, including required fonts, to be available locally.

## Repository and upstream boundaries

Planned structure:

```text
src/                 VS Code providers and document coordinator
adapters/            per-app bootstrap and protocol translation
protocol/            schema, types, and contract tests
integration-tests/   lifecycle and format fixtures
upstream/            immutable version pins and temporary patches
docs/                decisions, support matrix, and plans
```

Small embedding hooks belong in each upstream app. Keep the common protocol here first; extract a shared Rust crate only after two adapters demonstrate stable common requirements. Do not assume upstream acceptance or make it a prerequisite for the prototype.

Packaging favors reproducibility, offline use and format selection. Produce a separate VSIX per application, containing shared host code and only that application's renderer; require no sibling or core extension. A Suite extension pack contains member IDs and no executable code or renderers. Shared source and Rust build infrastructure remain in one repository. Stage explicit files, inspect actual VSIX archives for isolation, and test each extension alone and together. Future downloads would require a separate decision covering pinned hashes, licensing, failure recovery and offline provisioning. See [packaging](packaging.md).

MIT covers original integration work. Redistributed upstream code and assets keep their licenses and notices. Remove restricted upstream brand assets from modified builds. Maintain an artifact inventory and license report before release.

## Validation and open decisions

The first spike must resolve graphics/CSP compatibility, font access, clipboard/focus behavior, artifact sizes, and engine history integration. Then choose the minimum VS Code version, package layout, and backup representation.

Release checks cover open/edit/save/reopen, failed writes, edits during save, reload recovery, external changes, disposal, and local/remote URIs. Format tests should include known unsupported features and compare preservation, rather than merely checking that a file opens. Rendering and file compatibility remain upstream responsibilities, with integration regressions tested here.

## References

- [VS Code Custom Editor API](https://code.visualstudio.com/api/extension-guides/custom-editors)
- [VS Code Webview API](https://code.visualstudio.com/api/extension-guides/webview)
- [GridCraft host bridge](https://github.com/storytold/gridcraft/blob/main/apps/gridcraft-web/src/host.rs)
- [PdfCraft web entry and host bridge](https://github.com/storytold/pdfcraft/blob/main/apps/pdfcraft-web/src/main.rs)
- [WordCraft browser services](https://github.com/storytold/wordcraft/blob/main/apps/wordcraft-web/src/web.rs)
- [DeckCraft browser services](https://github.com/storytold/deckcraft/blob/main/apps/deckcraft-web/src/web.rs)
- [Related upstream proposal #2244](https://github.com/storytold/artcraft/issues/2244)

Source observations came from the initial research on 2026-10-15 and must be rechecked against pinned revisions during implementation. Links to upstream main are explanatory references, not dependency pins.
