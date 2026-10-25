# Contributing

The project is currently in the design stage. Start with [the design](docs/design.md) and [the plan](docs/plan.md).

## Ownership boundaries

VS Code integration, packaging, adapters, and integration tests belong here. Document parsing, calculation, layout, rendering, and serialization belong in the upstream application repositories. Do not copy those engines into TypeScript.

Propose embedding changes upstream when practical. Record temporary patches with their upstream commit, purpose, and removal condition. Pin dependencies to immutable revisions; do not build releases against floating branches.

## Implementation expectations

- Keep source documents intact on failed operations and surface errors clearly.
- Validate protocol inputs and test document lifecycle failures as well as successful saves.
- Treat files from local, WSL, and remote workspaces through VS Code URI APIs.
- Keep document bytes, paths, and passwords out of routine logs.
- Include applicable license and asset notices when adding dependencies or artifacts.
- Document supported formats and fidelity limits without claiming unsupported compatibility.

Build and test commands will be documented when the extension scaffold lands. There are no runtime checks to run in this documentation-only revision.

Contributions are provided under the repository's MIT license. Third-party material must retain its applicable licensing and attribution.
