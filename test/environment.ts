import { strict as assert } from 'node:assert';
import * as path from 'node:path';
import * as vscode from 'vscode';

export const root = process.env.CRAFT_TEST_ROOT;
assert.ok(root, 'Test runner must provide the repository root');
export const descriptors = {
  spreadsheets: { id: 'craft-vscode-dev.craft-spreadsheets', format: 'xlsx' as const,
    preview: 'craft.spreadsheets.preview', probe: 'craft.spreadsheets.integrationProbe' },
  word: { id: 'craft-vscode-dev.craft-word', format: 'docx' as const, preview: 'craft.word.preview', probe: 'craft.word.integrationProbe' },
  powerpoint: { id: 'craft-vscode-dev.craft-powerpoint', format: 'pptx' as const, preview: 'craft.powerpoint.preview', probe: 'craft.powerpoint.integrationProbe' },
  pdf: { id: 'craft-vscode-dev.craft-pdf', format: 'pdf' as const,
    preview: 'craft.pdf.preview', probe: 'craft.pdf.integrationProbe' },
};
export const selected = Object.entries(descriptors).filter(([key]) =>
  process.env.CRAFT_TEST_EXTENSIONS?.split(',').includes(key)).map(([, descriptor]) => descriptor);
assert.ok(selected.length > 0);
export function fixture(name: string): vscode.Uri {
  return vscode.Uri.file(path.join(root!, 'integration-tests', 'fixtures', name));
}
export function forFormat(format: 'xlsx' | 'pdf' | 'docx' | 'pptx') {
  const descriptor = Object.values(descriptors).find(item => item.format === format);
  assert.ok(descriptor); return descriptor;
}

export function assertIsolation(): void {
  for (const descriptor of Object.values(descriptors)) {
    if (!selected.includes(descriptor)) assert.equal(vscode.extensions.getExtension(descriptor.id), undefined,
      `${descriptor.id} must not be installed during the other extension's standalone test`);
  }
}
