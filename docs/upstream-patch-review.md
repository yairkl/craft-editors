# Upstream embedding patch review

This integration keeps pinned upstream source and temporary patches in [the manifest](../upstream/manifest.json). The patches are downstream build inputs, not upstream-approved APIs. Patches are ordered and grouped by subsystem; upstream proposals should be further separated by behavior where a file group still contains several concerns, with standalone behavior tested independently. The manifest records revision, hash and removal condition.

| Application | Current downstream changes | Candidate upstream work | Integration-only decisions |
| --- | --- | --- | --- |
| GridCraft | Host command callback for file actions and committed history; route autosave through that callback. | Generic host-owned lifecycle and history callbacks, with standalone defaults and tests. | VS Code commands, adapter-specific wheel zoom and document bridge stay here. The patch does **not** change zoom steps. |
| WordCraft | Host snapshot/restore, flush, file/history callbacks and embedded chrome. | Small snapshot and lifecycle interfaces, then independent embedded UI hooks. | VS Code registration, file persistence and presentation defaults stay here. |
| DeckCraft | File/history callback and embedded UI; prevents unsupported presenter windows. | Generic embedded lifecycle and optional presentation-host capabilities. | Disabling the current in-editor presenter and its user guidance are integration constraints, not a proposed standalone change. |
| PdfCraft | Automation/session access, host snapshots and drafts, lifecycle callbacks, UI changes and a host font registration hook. | Review automation, snapshots, font registration and host callbacks as separate changes. The font hook accepts general font metadata; only Hebrew selection is currently connected to the host fonts. | VS Code file actions, reading default and excluded native chrome stay here. |
| VectorCraft | Embedded lifecycle and UI, branding suppression, and WebAssembly-safe MCP behavior. | Generic callbacks and portable MCP changes can be separate proposals. | Restricted-brand removal and editor UI defaults remain downstream unless agreed otherwise. |

Some UI-host patches still bundle multiple concerns and are not suitable to submit wholesale. Presentation and PDF messages use host-neutral wording, but their policy still needs review as a host capability. Before proposing a patch, isolate one concern against the pinned upstream revision, replace host-specific policy with a generic capability where appropriate, add upstream-native tests, and preserve standalone defaults. Assess each change against current upstream source before sending it; upstream acceptance is not assumed. See [the collaboration draft](collaboration-proposal.md).

## Patch-by-patch review

The [manifest](../upstream/manifest.json) is the source of truth for each repository, exact revision, patch hash, application order and removal condition. The checks below are integration coverage, not proof that standalone upstream behavior is unchanged. Run `npm run upstream:fetch` and `npm run renderers:build` before the listed suites; use a disposable graphical session for VS Code tests. `npm test` also checks the patch application mechanism.

| Patch | Effect and review boundary | Relevant integration checks |
| --- | --- | --- |
| `gridcraft-host-commands.patch` | Delegates file actions and committed undo/redo to the host. Extract a general host callback with standalone defaults. Zoom-step changes live in the adapter, not this patch. | `npm run test:editing`, `npm run test:rendering` |
| `wordcraft-snapshots.patch` | Exposes document snapshots for host history and recovery. Propose snapshot and restore separately from UI policy. | `npm run test:office` |
| `wordcraft-ui-host.patch` | Adds host lifecycle and chrome hooks. Split lifecycle, history and UI concerns before proposing. | `npm run test:office` |
| `deckcraft-host.patch` | Adds host file/history handling and presentation behavior. Separate lifecycle callbacks from presentation-host capabilities. | `npm run test:office` |
| `deckcraft-ui.patch` | Adjusts ribbon and status chrome for embedding. An optional chrome capability needs independent review. | `npm run test:office`, `npm run test:theme` |
| `pdfcraft-automation.patch` | Exposes the automation session used by the MCP bridge. Review its public API independently of VS Code. | `npm run test:graphics` |
| `pdfcraft-snapshots.patch` | Exposes document snapshots for history and recovery. Review snapshot ownership and restoration independently. | `npm run test:graphics` |
| `pdfcraft-fonts.patch` | Registers host fonts, currently consumed only by Hebrew selection. Generalize coverage and preserve existing fallback behavior before an upstream proposal. | `npm run test:languages` |
| `pdfcraft-rendering.patch` | Removes a warning match arm for the pinned rendering dependency. This is a dependency compatibility adjustment, not an embedding feature; reassess it against current upstream and dependency versions before proposing it. | `npm run renderers:build`, `npm run test:graphics` |
| `pdfcraft-ui-host.patch` | Combines host lifecycle, drafts and UI changes. Split these by behavior and review unsupported host actions as capabilities. | `npm run test:graphics`, `npm run test:theme` |
| `vectorcraft-mcp-wasm.patch` | Rejects writing rendered images to a path on WebAssembly while allowing image data to be returned. A portable MCP change should preserve native behavior. | `npm run renderers:build`, `npm run test:graphics` |
| `vectorcraft-branding.patch` | Removes restricted branding from modified builds. This is a downstream distribution decision, not an assumed upstream proposal. | `npm run test:graphics`, package and notice review |
| `vectorcraft-ui-host.patch` | Adds embedded lifecycle and UI hooks. Separate host callbacks from chrome and other UI policy. | `npm run test:graphics`, `npm run test:theme` |

Patches are applied in manifest order; a later patch must be checked against all earlier patches for the same app. In particular, shared-file changes and adapter calls may require a staged API change before UI changes can be reviewed independently. The suites above exercise the integration as a whole; add focused upstream-native tests for each extracted change before submitting it.

To update a pin, inspect upstream changes and licenses, rebase each patch in manifest order without unrelated edits, update its hash and rationale, run the renderer builds and relevant editor/packaging suites, and review the generated notices. Do not change a source pin merely to make a patch apply.
