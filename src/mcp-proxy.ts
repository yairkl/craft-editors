import * as net from 'node:net';

const port = Number(process.env.CRAFT_MCP_PORT);
const secret = process.env.CRAFT_MCP_SECRET;
if (!Number.isInteger(port) || port < 1 || port > 65535 || !secret) throw new Error('Craft spreadsheet bridge is unavailable.');
const socket = net.createConnection({ host: '127.0.0.1', port });
let ready = false, buffer = '';
process.stdin.pause();
socket.on('connect', () => socket.write(secret + '\n'));
socket.on('data', chunk => {
  if (ready) { process.stdout.write(chunk); return; }
  buffer += chunk.toString();
  const end = buffer.indexOf('\n');
  if (end < 0) return;
  if (buffer.slice(0, end) !== 'ready') { socket.destroy(); return; }
  ready = true;
  if (buffer.length > end + 1) process.stdout.write(buffer.slice(end + 1));
  process.stdin.pipe(socket); process.stdin.resume();
});
socket.on('error', error => { process.stderr.write(`Craft bridge: ${error.message}\n`); process.exitCode = 1; });
socket.on('close', () => { process.stdin.destroy(); });
