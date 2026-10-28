/** Give the webview exactly these bytes, without exposing other bytes in a pooled buffer. */
export function exactArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  if (bytes.buffer instanceof ArrayBuffer && bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength) return bytes.buffer;
  return Uint8Array.from(bytes).buffer;
}
