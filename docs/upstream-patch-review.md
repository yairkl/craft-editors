# Upstream embedding patch review

This integration keeps pinned upstream source and temporary patches in [the manifest](../upstream/manifest.json). The patches are downstream build inputs, not upstream-approved APIs. Each should be split into focused proposals against its own application, with standalone behavior tested independently. The manifest records revision, hash and removal condition.

| Application | Current downstream changes | Candidate upstream work | Integration-only decisions |
| --- | --- | --- | --- |
| GridCraft | Host command callback for file actions and committed history; route autosave through that callback. | Generic host-owned lifecycle and history callbacks, with standalone defaults and tests. | VS Code commands, adapter-specific wheel zoom and document bridge stay here. The patch does **not** change zoom steps. |
| WordCraft | Host snapshot/restore, flush, file/history callbacks and embedded chrome. | Small snapshot and lifecycle interfaces, then independent embedded UI hooks. | VS Code registration, file persistence and presentation defaults stay here. |
| DeckCraft | File/history callback and embedded UI; prevents unsupported presenter windows. | Generic embedded lifecycle and optional presentation-host capabilities. | Disabling the current in-editor presenter and its user guidance are integration constraints, not a proposed standalone change. |
| PdfCraft | Automation/session access, host snapshots and drafts, lifecycle callbacks, UI changes and a Hebrew font registration hook. | Review automation, snapshots, font registration and host callbacks as separate changes. A general host-supplied font API would be preferable to a Hebrew-specific API. | VS Code file actions, reading default and excluded native chrome stay here. |
| VectorCraft | Embedded lifecycle and UI, branding suppression, and WebAssembly-safe MCP behavior. | Generic callbacks and portable MCP changes can be separate proposals. | Restricted-brand removal and editor UI defaults remain downstream unless agreed otherwise. |

The patches bundle multiple concerns that are not suitable to submit wholesale. Presentation and PDF messages use host-neutral wording, but their policy still needs review as a host capability. Before proposing a patch, isolate one concern against the pinned upstream revision, replace host-specific policy with a generic capability where appropriate, add upstream-native tests, and preserve standalone defaults. Assess each change against current upstream source before sending it; upstream acceptance is not assumed. See [the collaboration draft](collaboration-proposal.md).

To update a pin, inspect upstream changes and licenses, rebase each patch without unrelated edits, update the hash and rationale, run the renderer builds and relevant editor/packaging suites, and review the generated notices. Do not change a source pin merely to make a patch apply.
