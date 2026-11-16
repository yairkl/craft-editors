# Upstream host integration refactor

The goal is to make the reusable parts of each downstream patch stack easier to review independently, while preserving the VS Code integration and standalone defaults. These patches remain downstream until upstream maintainers agree to their interfaces.

1. Separate optional host command callbacks, snapshots and draft flushing from optional UI chrome. Keep host-specific presentation and multiple-document restrictions, branding and dependency-resolution patches explicitly integration-only.
2. Exercise reusable interfaces with upstream-native tests: host interception and standalone fallback for command hooks, and snapshot restore plus undo/redo for the document model. Keep integration suites for actual VS Code behavior.
3. Apply the ordered patch stacks to clean pinned source checkouts, rebuild the renderers, and run the affected editor, rendering and package tests. Update the recorded patch and build hashes.
4. Before proposing any upstream change, isolate its patch against current upstream, add any missing native and WebAssembly coverage, check its API and persistence/error semantics with maintainers, and prove standalone behavior is unchanged. Do not submit the integration-only policies or branding changes as generic host features.

The split makes individual concerns inspectable; it does not by itself prove an upstream API is complete or suitable for acceptance. In particular, the callback currently reports only whether a command was handled, and the downstream host owns persistence acknowledgement and error reporting. A maintainer-facing design needs to specify those semantics explicitly.

With the pinned sources prepared, run the native seam tests from the repository root:

```sh
cargo +1.95.0 test --manifest-path upstream/checkouts/gridcraft/Cargo.toml -p gridcraft-ui-egui --lib optional_host_dispatch_preserves_the_standalone_fallback
cargo +1.95.0 test --manifest-path upstream/checkouts/wordcraft/Cargo.toml -p wordcraft-engine --lib host_snapshots_restore_document_and_history_repeatedly
cargo +1.95.0 test --manifest-path upstream/checkouts/wordcraft/Cargo.toml -p wordcraft-ui-egui --lib optional_host_dispatch_preserves_the_standalone_fallback
cargo +1.95.0 test --manifest-path upstream/checkouts/deckcraft/Cargo.toml -p deckcraft-ui-egui --lib optional_host_dispatch_preserves_the_standalone_fallback
cargo +1.95.0 test --manifest-path upstream/checkouts/pdfcraft/Cargo.toml -p pdfcraft-ui-egui --lib optional_host_dispatch_preserves_the_standalone_fallback
cargo +1.95.0 test --manifest-path upstream/checkouts/vectorcraft/Cargo.toml -p vectorcraft-ui-egui --lib optional_host_dispatch_preserves_the_standalone_fallback
cargo +1.95.0 test --manifest-path upstream/checkouts/vectorcraft/Cargo.toml -p vectorcraft-mcp --lib headless_render_returns_data_and_writes_png_on_native_hosts
cargo +1.95.0 test --manifest-path upstream/checkouts/wordcraft/Cargo.toml -p wordcraft-ui-egui --lib host_flush_commits_a_comment_draft_and_preserves_undo
cargo +1.95.0 test --manifest-path upstream/checkouts/wordcraft/Cargo.toml -p wordcraft-ui-egui --lib standalone_title_controls_are_omitted_only_when_embedded
cargo +1.95.0 test --manifest-path upstream/checkouts/deckcraft/Cargo.toml -p deckcraft-ui-egui --lib standalone_title_bar_is_omitted_only_when_embedded
cargo +1.95.0 test --manifest-path upstream/checkouts/vectorcraft/Cargo.toml -p vectorcraft-ui-egui --lib embedded_chrome_hides_the_mark_but_standalone_keeps_it
cargo +1.95.0 test --manifest-path upstream/checkouts/pdfcraft/Cargo.toml -p pdfcraft-engine --lib host_snapshots_restore_revisions_repeatedly
cargo +1.95.0 test --manifest-path upstream/checkouts/pdfcraft/Cargo.toml -p pdfcraft-fonts --test host_fallback
cargo +1.95.0 test --manifest-path upstream/checkouts/pdfcraft/Cargo.toml -p pdfcraft-ui-egui --lib host_draft_snapshot_restores_pending_edit
cargo +1.95.0 test --manifest-path upstream/checkouts/pdfcraft/Cargo.toml -p pdfcraft-ui-egui --lib host_commands_do_not_redirect_a_standalone_background_tab_close
cargo +1.95.0 test --manifest-path upstream/checkouts/pdfcraft/Cargo.toml -p pdfcraft-ui-egui --lib single_document_host_only_receives_valid_close_requests
cargo +1.95.0 test --manifest-path upstream/checkouts/pdfcraft/Cargo.toml -p pdfcraft-ui-egui --lib standalone_document_tab_is_omitted_when_embedded
```
