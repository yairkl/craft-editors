# ADR-0001: Independent Craft extensions with a shared host

**Status:** Accepted
**Date:** 2026-10-25
**Deciders:** Project owner, approved in the project conversation

## Context

The prototype used one extension that built both renderers. Loading only the selected WASM saved runtime resources but still left unrelated renderer bytes in an all-format installation. The owner requested independently installable programs after reviewing this tradeoff.

## Decision

Keep one repository, shared host implementation and adapter build infrastructure. Produce a separate extension per application, initially Craft Spreadsheets and Craft PDF. Each owns its editor IDs/default file association and carries only its own WASM. Copy the small common host into each artifact; require no core or sibling extension. Offer Craft Suite as an optional standard VS Code extension pack, containing only member IDs.

## Options considered

| Option | Benefit | Cost |
| --- | --- | --- |
| One bundle, lazy runtime loading | Simplest distribution and one installation | Users download/store unrelated engines; releases and enabled file associations are coupled |
| One host with downloaded engines | Selective storage | Adds downloads, artifact verification, first-open failure modes and offline provisioning |
| Independent extensions, shared source, optional pack | Users choose formats; offline installs; independent enablement | More manifests, package checks and release coordination; small host-code duplication |

Choose independent extensions. Runtime lazy loading remains useful inside each extension, but is not the solution to installation size.

## Consequences

Shared behavior still changes in one source location. Standalone packages can be installed, disabled and uninstalled independently; the Suite is optional. Each package must be tested alone and alongside its siblings, and its archive inspected for unrelated assets. Source builds still use the shared Rust workspace and both upstream checkouts. A future release process must validate the actual publisher IDs and publish member extensions before advertising one-click Suite installation.

## Action items

- [x] Separate manifests, entry points and renderer staging.
- [x] Add a Suite manifest with no runtime dependency or executable code.
- [x] Verify standalone/combined VS Code behavior and actual VSIX contents.
- [ ] Complete public release validation and publish chosen member IDs before Marketplace distribution.

Implementation and local-install details: [packaging](../packaging.md). VS Code's [extension pack specification](https://code.visualstudio.com/api/references/extension-manifest#extension-packs) defines how the Suite installs independently manageable members.
