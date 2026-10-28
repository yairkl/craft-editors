import { randomBytes } from 'node:crypto';
import * as net from 'node:net';
import * as path from 'node:path';
import * as vscode from 'vscode';

interface AgentSession { handle(line: string): Promise<string | undefined>; dispose(): void }
interface CursorApi { mcp?: { registerServer(config: { name: string; server: { command: string; args: string[]; env: Record<string, string> } }): void; unregisterServer(name: string): void } }

/** Shared stdio bridge and host discovery. Each client receives an isolated app session. */
export async function registerAgentServer(context: vscode.ExtensionContext, options: { id: string; name: string; createSession(): AgentSession }): Promise<{ command: string; args: string[]; env: Record<string, string> }> {
  const secret = randomBytes(32).toString('hex');
  const sockets = new Set<net.Socket>();
  const server = net.createServer(socket => {
    sockets.add(socket); socket.setEncoding('utf8');
    let buffer = '', authenticated = false, session: AgentSession | undefined;
    let queue: Promise<void> = Promise.resolve();
    socket.on('data', chunk => {
      buffer += chunk;
      if (buffer.length > 1024 * 1024) { socket.destroy(); return; }
      let newline: number;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
        if (!authenticated) {
          if (line !== secret) { socket.destroy(); return; }
          try { session = options.createSession(); } catch { socket.destroy(); return; }
          authenticated = true; socket.write('ready\n'); continue;
        }
        const current = session;
        queue = queue.then(async () => { const reply = await current?.handle(line); if (reply && !socket.destroyed) socket.write(reply + '\n'); }).catch(() => { socket.destroy(); });
      }
    });
    socket.on('error', () => {});
    socket.on('close', () => { sockets.delete(socket); void queue.finally(() => session?.dispose()); });
  });
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => { server.off('error', reject); resolve(); }); });
  const address = server.address();
  if (!address || typeof address === 'string') { server.close(); throw new Error('Could not start the agent bridge.'); }
  const command = process.execPath;
  const args = [path.join(context.extensionPath, 'out/src/mcp-proxy.js')];
  const env = { ELECTRON_RUN_AS_NODE: '1', CRAFT_MCP_PORT: String(address.port), CRAFT_MCP_SECRET: secret };
  context.subscriptions.push(new vscode.Disposable(() => { for (const socket of sockets) socket.destroy(); server.close(); }));
  if (vscode.lm?.registerMcpServerDefinitionProvider) context.subscriptions.push(vscode.lm.registerMcpServerDefinitionProvider(options.id, { provideMcpServerDefinitions: () => [new vscode.McpStdioServerDefinition(options.name, command, args, env)] }));
  const cursor = (vscode as typeof vscode & { cursor?: CursorApi }).cursor?.mcp;
  if (cursor) { cursor.registerServer({ name: options.name, server: { command, args, env } }); context.subscriptions.push(new vscode.Disposable(() => cursor.unregisterServer(options.name))); }
  return { command, args, env };
}
