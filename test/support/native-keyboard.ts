import { execFileSync } from 'node:child_process';

export function press(key: 'c' | 'v' | 'z' | 'redo'): void {
  if (process.platform === 'linux') {
    execFileSync('xdotool', ['key', '--clearmodifiers', key === 'redo' ? 'ctrl+shift+z' : `ctrl+${key}`], { timeout: 10000 });
  } else if (process.platform === 'darwin') {
    const chord = key === 'redo' ? 'keystroke "z" using {command down, shift down}' : `keystroke "${key}" using command down`;
    execFileSync('osascript', ['-e', `tell application "System Events" to ${chord}`], { timeout: 10000 });
  } else if (process.platform === 'win32') {
    const chord = key === 'redo' ? '^y' : `^${key}`;
    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-STA', '-Command', `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${chord}')`], { timeout: 10000, windowsHide: true });
  } else throw new Error(`Native keyboard testing is unsupported on ${process.platform}`);
}

