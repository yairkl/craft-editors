# Remote SSH verification — 2026-10-26

Actual Microsoft Remote SSH 0.128.0 connection from desktop VS Code 1.143.0 on Linux to a separate Ubuntu 24.04 Docker filesystem, using an ephemeral key and loopback-published SSH port. This is not the virtual filesystem mock. The extension host reported `remoteName: ssh-remote` and the container hostname. Its workspace APIs correctly expose remote files as `file:` URIs inside the remote host; webview assets and editing callbacks cross the SSH connection.

| Program | Native render | Edit/save/reopen | Undo/Redo | Save As preserves source | Revert | Backup write/delete |
| --- | --- | --- | --- | --- | --- | --- |
| Spreadsheets | Pass | Pass | Pass | Pass | Pass | Pass |
| Word | Pass | Pass | Pass | Pass | Pass | Pass |
| PowerPoint | Pass | Pass | Pass | Pass | Pass | Pass |
| PDF | Pass | Pass | Pass | Pass | Pass | Pass |
| Vector | Pass | Pass | Pass | Pass | Pass | Pass |

Tests use original synthetic documents in paths containing spaces and Hebrew. Office/vector text and spreadsheet cells include Hebrew; PDF edits rotate a page. Each application runs as a workspace extension in the actual remote extension host. The installed VSIX archives also receive separate local production-mode installation tests. No personal SSH hosts, credentials or documents are used.

The spreadsheet, Word, PowerPoint and Vector MCP bridges were additionally exercised with VS Code 1.102.0 and Remote SSH 0.120.0: a test MCP client edited and undid each live remote document, then edited and saved a closed remote document. This checks the proxy and remote extension host, not actual Copilot or Cursor discovery.

Reproduce with Docker, OpenSSH client tools and an installed desktop VS Code:

```sh
npm ci
npm run upstream:fetch
npm run renderers:build
VSCODE_EXECUTABLE_PATH=/path/to/code xvfb-run -a npm run test:remote
```

The opt-in runner builds a disposable SSH container, installs Remote SSH into an isolated profile, copies only development extensions/generated fixtures, runs `test/remote/index.ts`, writes `artifacts/remote/results.json`, then removes its container/image tag and test key. Set `CRAFT_REMOTE_SSH_VERSION=0.120.0` when testing with VS Code 1.102. It never changes normal VS Code or SSH configuration. It downloads Microsoft's matching server on first connection. Ordinary CI continues using virtual-FS coverage; the real SSH runner requires a Docker-capable Linux host and network access.

Scope: Linux client/server over actual SSH to a container. WAN latency, jump hosts, enterprise authentication/proxies, reconnect after transport failure, Windows/macOS clients, ARM hosts and WSL are not established by this result. VSIX files should be installed into the SSH host's Extensions section; reload the remote window after installation. Rendering remains in the local webview while the workspace host owns file access/save/recovery.
