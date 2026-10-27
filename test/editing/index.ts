import { execFileSync, spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { strict as assert } from 'node:assert';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { EditableDocument, EditingProvider } from '../../src/editing';
import type { RenderResult } from '../../src/rendering';
import { assertIsolation, fixture, root } from '../environment';
interface EditorApi { editing: EditingProvider; onDidRender: vscode.Event<RenderResult>; mcp: { command: string; args: string[]; env: Record<string, string> } }
export async function run(): Promise<void> {
  assertIsolation();
  const extension = vscode.extensions.getExtension<EditorApi>('craft-vscode-dev.craft-spreadsheets');
  assert.ok(extension);
  const { McpHeadless } = require(path.join(extension.extensionPath, 'media/engines/grid/node/viewer.js')) as { McpHeadless: new () => { message(input: string): string | undefined; free(): void } };
  const headless = new McpHeadless();
  const headlessCall = (name: string, args: object): { content: { text: string }[]; isError: boolean } => {
    const result = headless.message(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }));
    assert.ok(result);
    return JSON.parse(result).result;
  };
  const headlessBytes = Buffer.from(await vscode.workspace.fs.readFile(fixture('minimal.xlsx'))).toString('base64');
  assert.equal(headlessCall('execute_command', { command: 'file.open', params: { name: 'minimal.xlsx', base64: headlessBytes } }).isError, false);
  assert.equal(headlessCall('set_cell', { cell: 'A6', input: 'headless edit' }).isError, false);
  const saved = JSON.parse(headlessCall('execute_command', { command: 'file.saveBytes', params: { format: 'xlsx' } }).content[0]!.text) as { base64: string };
  headless.free();
  const reopened = new McpHeadless();
  const reopen = (name: string, args: object) => JSON.parse(reopened.message(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }))!).result as { content: { text: string }[]; isError: boolean };
  assert.equal(reopen('execute_command', { command: 'file.open', params: { name: 'reopened.xlsx', base64: saved.base64 } }).isError, false);
  assert.equal((JSON.parse(reopen('get_cell', { cell: 'A6' }).content[0]!.text) as { input: string }).input, 'headless edit');
  reopened.free();
  const api = await extension.activate();
  assert.ok(api.editing);
  const directory = vscode.Uri.file(path.join(root!, 'artifacts/editing'));
  await vscode.workspace.fs.createDirectory(directory);
  const original = await vscode.workspace.fs.readFile(fixture('minimal.xlsx'));
  const closedUri = vscode.Uri.joinPath(directory, 'agent-closed.xlsx');
  await vscode.workspace.fs.writeFile(closedUri, original);
  const client = createAgent(api.mcp);
  const init = await client.call('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } });
  assert.ok(init.result);
  const listing = await client.call('tools/list', {});
  assert.ok((listing.result as { tools?: { name: string }[] } | undefined)?.tools?.some(tool => tool.name === 'set_cell'), 'GridCraft tools are discoverable over the proxy');
  const callTool = (name: string, args: object) => client.call('tools/call', { name, arguments: args });
  assert.equal((await callTool('open_workbook', { path: closedUri.fsPath })).result?.isError, false);
  assert.equal((await callTool('set_cell', { cell: 'A6', input: 'closed agent' })).result?.isError, false);
  assert.deepEqual(await vscode.workspace.fs.readFile(closedUri), original, 'Headless changes stay in memory until saved');
  await vscode.workspace.fs.writeFile(closedUri, new TextEncoder().encode('external change'));
  assert.equal((await callTool('save_workbook', {})).result?.isError, true, 'Headless save must detect external changes');
  assert.equal(new TextDecoder().decode(await vscode.workspace.fs.readFile(closedUri)), 'external change');
  await vscode.workspace.fs.writeFile(closedUri, original);
  assert.equal((await callTool('save_workbook', {})).result?.isError, false);
  assert.notDeepEqual(await vscode.workspace.fs.readFile(closedUri), original);
  const savedWorkbook = await callTool('inspect_workbook', {});
  assert.equal((JSON.parse(savedWorkbook.result?.content?.[0]?.text ?? '{}') as { dirty: boolean }).dirty, false, 'Headless workbook is marked saved only after the write succeeds');
  client.close();
  const dirtyCsvUri = vscode.Uri.joinPath(directory, 'agent-text-dirty.csv');
  await vscode.workspace.fs.writeFile(dirtyCsvUri, Buffer.from('Name,Value\nOne,1\n'));
  const dirtyCsv = await vscode.workspace.openTextDocument(dirtyCsvUri);
  await vscode.window.showTextDocument(dirtyCsv);
  const textEdit = new vscode.WorkspaceEdit(); textEdit.insert(dirtyCsvUri, new vscode.Position(0, 0), 'unsaved,');
  assert.ok(await vscode.workspace.applyEdit(textEdit)); assert.equal(dirtyCsv.isDirty, true);
  const guardedClient = createAgent(api.mcp);
  assert.equal((await guardedClient.call('tools/call', { name: 'open_workbook', arguments: { path: dirtyCsvUri.fsPath } })).result?.isError, true, 'Agent must not ignore unsaved text-editor changes');
  guardedClient.close();
  await vscode.commands.executeCommand('workbench.action.files.revert');
  await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  const overlapUri = vscode.Uri.joinPath(directory, 'agent-overlap.xlsx');
  await vscode.workspace.fs.writeFile(overlapUri, original);
  const overlapClient = createAgent(api.mcp);
  const overlapTool = (name: string, args: object) => overlapClient.call('tools/call', { name, arguments: args });
  assert.equal((await overlapTool('open_workbook', { path: overlapUri.fsPath })).result?.isError, false);
  assert.equal((await overlapTool('set_cell', { cell: 'A6', input: 'unsaved agent' })).result?.isError, false);
  const overlapDoc = await open(api, overlapUri);
  assert.equal((await overlapTool('save_workbook', {})).result?.isError, true, 'A headless session must not overwrite a newly opened editor');
  assert.deepEqual(await vscode.workspace.fs.readFile(overlapUri), original);
  assert.equal(overlapDoc.dirty, false);
  const recoveryCopy = vscode.Uri.joinPath(directory, 'agent-overlap-copy.xlsx');
  assert.equal((await overlapTool('save_workbook', { path: recoveryCopy.fsPath })).result?.isError, false, 'Unsaved headless edits can be recovered to a copy');
  overlapClient.close();
  await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  const agentCsv = vscode.Uri.joinPath(directory, 'agent.csv');
  const csvOriginal = new TextEncoder().encode('Name,Value\nOne,1\n');
  await vscode.workspace.fs.writeFile(agentCsv, csvOriginal);
  const csvClient = createAgent(api.mcp);
  const csvTool = (name: string, args: object) => csvClient.call('tools/call', { name, arguments: args });
  assert.equal((await csvTool('open_workbook', { path: agentCsv.fsPath })).result?.isError, false);
  assert.equal((await csvTool('set_cell', { cell: 'B2', input: '=1+2' })).result?.isError, false);
  assert.equal((await csvTool('save_workbook', {})).result?.isError, true, 'Headless CSV save must reject formulas');
  assert.deepEqual(await vscode.workspace.fs.readFile(agentCsv), Buffer.from(csvOriginal));
  const agentXlsx = vscode.Uri.joinPath(directory, 'agent-converted.xlsx');
  assert.equal((await csvTool('save_workbook', { path: agentXlsx.fsPath })).result?.isError, false);
  csvClient.close();
  const liveSaveUri = vscode.Uri.joinPath(directory, 'agent-live-save.xlsx');
  await vscode.workspace.fs.writeFile(liveSaveUri, original);
  const liveSaveDoc = await open(api, liveSaveUri);
  const liveSaveClient = createAgent(api.mcp);
  const liveSaveTool = (name: string, args: object) => liveSaveClient.call('tools/call', { name, arguments: args });
  assert.equal((await liveSaveTool('open_workbook', { path: liveSaveUri.fsPath })).result?.isError, false);
  assert.equal((await liveSaveTool('set_cell', { cell: 'A6', input: 'saved live' })).result?.isError, false);
  await waitFor(() => liveSaveDoc.dirty);
  assert.equal((await liveSaveTool('save_workbook', {})).result?.isError, false);
  assert.equal(liveSaveDoc.dirty, false);
  liveSaveClient.close();
  await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  const reopenedLive = await open(api, liveSaveUri);
  assert.equal(await reopenedLive.request('test:cell', { sheet: 0, row: 5, col: 0 }), 'saved live');
  await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  const revertClosedUri = vscode.Uri.joinPath(directory, 'revert-without-panel.xlsx');
  await vscode.workspace.fs.writeFile(revertClosedUri, original);
  const closedToken = new vscode.CancellationTokenSource();
  const closedDocument = await api.editing.openCustomDocument(revertClosedUri, { backupId: undefined, untitledDocumentData: undefined }, closedToken.token);
  await api.editing.revertCustomDocument(closedDocument, closedToken.token);
  assert.deepEqual(closedDocument.cache, original, 'Revert without a live panel still reloads the source');
  assert.equal(closedDocument.dirty, false);
  closedDocument.dispose(); closedToken.dispose();

  const uri = vscode.Uri.joinPath(directory, 'roundtrip.xlsx');
  await vscode.workspace.fs.writeFile(uri, original);
  let doc = await open(api, uri);
  assert.equal(await cell(doc), '42');
  const liveClient = createAgent(api.mcp);
  const liveTool = (name: string, args: object) => liveClient.call('tools/call', { name, arguments: args });
  assert.equal((await liveTool('open_workbook', { path: uri.fsPath })).result?.isError, false);
  assert.equal((await liveTool('set_cell', { cell: 'A7', input: 'live agent' })).result?.isError, false);
  assert.equal(await doc.request('test:cell', { sheet: 0, row: 6, col: 0 }), 'live agent');
  await waitFor(() => doc.dirty);
  assert.equal((await liveTool('undo', {})).result?.isError, false);
  assert.equal(await doc.request('test:cell', { sheet: 0, row: 6, col: 0 }), '');
  assert.equal((await liveTool('redo', {})).result?.isError, false);
  assert.equal(await doc.request('test:cell', { sheet: 0, row: 6, col: 0 }), 'live agent');
  assert.equal((await liveTool('undo', {})).result?.isError, false);
  await doc.request('test:draft', { row: 1, col: 1, text: 'agent history draft' });
  assert.equal((await liveTool('undo', {})).result?.isError, true, 'Agent history must not discard an active cell draft');
  assert.equal(await doc.request('test:draft-text'), 'agent history draft');
  const draftCancellation = new vscode.CancellationTokenSource();
  await api.editing.revertCustomDocument(doc, draftCancellation.token);
  draftCancellation.dispose();
  liveClient.close();
  const mcp = async (id: number, method: string, params: object) => {
    const reply = await doc.request('agent:mcp', { message: JSON.stringify({ jsonrpc: '2.0', id, method, params }) });
    assert.equal(typeof reply, 'string');
    return JSON.parse(reply as string) as { result?: { isError?: boolean }; error?: object };
  };
  assert.ok((await mcp(1, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } })).result);
  assert.equal((await mcp(2, 'tools/call', { name: 'set_cell', arguments: { cell: 'A6', input: 'agent' } })).result?.isError, false);
  assert.equal(await doc.request('test:cell', { sheet: 0, row: 5, col: 0 }), 'agent');
  await waitFor(() => doc.dirty);
  await vscode.commands.executeCommand('undo');
  assert.equal(await doc.request('test:cell', { sheet: 0, row: 5, col: 0 }), '');
  await doc.request('test:draft', { row: 1, col: 1 });
  assert.equal(await edit(doc, '21'), '21', 'Cell replacement must replace even when an earlier native draft is active');
  assert.equal(await cell(doc, 2), '42', 'The native calculation engine recalculates formulas');
  assert.equal(doc.dirty, true);
  assert.deepEqual(await vscode.workspace.fs.readFile(uri), original, 'Editing alone cannot write the original');
  assert.ok(await vscode.workspace.save(uri), 'VS Code Save must succeed');
  assert.equal(doc.dirty, false);
  await vscode.commands.executeCommand('undo');
  assert.equal(await cell(doc), '42');
  assert.equal(doc.dirty, true);
  await vscode.commands.executeCommand('redo');
  assert.equal(await cell(doc), '21');
  assert.equal(doc.dirty, false);
  await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  doc = await open(api, uri);
  assert.equal(await cell(doc), '21', 'Saved cell value must survive close and reopen');
  assert.equal(await cell(doc, 2), '42');
  await edit(doc, '30');
  await revert(doc);
  assert.equal(await cell(doc), '21');
  assert.equal(doc.dirty, false);

  console.log('Editing round trip and revert passed');
  await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  const datesUri = vscode.Uri.joinPath(directory, 'dates.csv');
  await vscode.workspace.fs.writeFile(datesUri, new TextEncoder().encode('Date,Amount\n2026-10-26,12\n'));
  const dates = await open(api, datesUri);
  assert.deepEqual((await dates.request('test:csv-status') as { features: string[] }).features, [], 'CSV-inferred date formats do not require conversion');
  await dates.request('test:edit', { row: 1, col: 1, text: '13' });
  assert.ok(await vscode.workspace.save(datesUri));
  await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  const csvUri = vscode.Uri.joinPath(directory, 'roundtrip.csv');
  const csvSource = new TextEncoder().encode('Craft smoke fixture;Value\r\n"Craft, quoted";42\r\n"two\nlines";7\r\n');
  await vscode.workspace.fs.writeFile(csvUri, csvSource);
  let csv = await open(api, csvUri);
  assert.equal(await csv.request('test:cell', { sheet: 0, row: 1, col: 0 }), 'Craft, quoted');
  await csv.request('test:edit', { row: 1, col: 1, text: 'שלום, "CSV"' });
  await vscode.commands.executeCommand('undo');
  assert.equal(await csv.request('test:cell', { sheet: 0, row: 1, col: 1 }), '42');
  await vscode.commands.executeCommand('redo');
  assert.ok(await vscode.workspace.save(csvUri));
  const csvBytes = await vscode.workspace.fs.readFile(csvUri);
  assert.ok(new TextDecoder().decode(csvBytes).startsWith('Craft smoke fixture;Value'), 'CSV stays text and preserves semicolon delimiter');
  await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  csv = await open(api, csvUri);
  assert.equal(await csv.request('test:cell', { sheet: 0, row: 1, col: 1 }), 'שלום, "CSV"');
  assert.equal(await csv.request('test:cell', { sheet: 0, row: 2, col: 0 }), 'two\nlines');
  await csv.request('test:edit', { row: 1, col: 1, text: 'changed' });
  const csvCopy = vscode.Uri.joinPath(directory, 'copy.csv');
  const csvToken = new vscode.CancellationTokenSource();
  await api.editing.saveCustomDocumentAs(csv, csvCopy, csvToken.token);
  assert.deepEqual(await vscode.workspace.fs.readFile(csvUri), csvBytes, 'CSV Save As leaves source unchanged');
  assert.ok(new TextDecoder().decode(await vscode.workspace.fs.readFile(csvCopy)).includes('changed'));
  await api.editing.revertCustomDocument(csv, csvToken.token);
  assert.equal(await csv.request('test:cell', { sheet: 0, row: 1, col: 1 }), 'שלום, "CSV"');
  // Sorting remains a value-only CSV operation.
  await csv.request('test:edit', { row: 1, col: 1, text: '21' });
  await csv.request('test:command', { command: 'data.sort', params: { range: 'A2:B3', header: false, keys: [{ column: 'B', order: 'asc' }] } });
  assert.equal(await csv.request('test:cell', { sheet: 0, row: 1, col: 1 }), '7');
  assert.ok(await vscode.workspace.save(csvUri), 'Sorted values can still be saved as CSV');
  const sortedCsvBytes = await vscode.workspace.fs.readFile(csvUri);
  // Rich edits must survive caching and recovery, never silently flatten to CSV.
  await csv.request('test:edit', { row: 1, col: 1, text: '21' });
  await csv.request('test:edit', { row: 2, col: 1, text: '=B2*2' });
  await csv.request('test:command', { command: 'home.bold', params: { range: 'B2', on: true } });
  const rich = await csv.request('test:csv-status') as { features: string[]; message: string };
  assert.ok(rich.features.includes('formulas') && rich.features.includes('formatting'));
  assert.match(rich.message, /closing without saving will discard/);
  await assert.rejects(api.editing.saveCustomDocument(csv, csvToken.token), vscode.CancellationError);
  assert.deepEqual(await vscode.workspace.fs.readFile(csvUri), sortedCsvBytes, 'CSV save cannot silently flatten formulas');
  assert.equal(csv.dirty, true, 'Unsaved rich features keep the standard close warning active');
  await waitFor(() => vscode.window.tabGroups.all.some(group => group.tabs.some(tab => tab.input instanceof vscode.TabInputCustom && tab.input.uri.toString() === csvUri.toString() && tab.isDirty)));
  const cancelledCopy = new vscode.CancellationTokenSource(); cancelledCopy.cancel();
  const cancelledTarget = vscode.Uri.joinPath(directory, 'cancelled.xlsx');
  await assert.rejects(api.editing.saveWorkbookCopy(csv, cancelledTarget, cancelledCopy.token), vscode.CancellationError);
  cancelledCopy.dispose();
  await assert.rejects(api.editing.saveWorkbookCopy(csv, csvUri, csvToken.token), /xlsx/);
  const csvBackup = await api.editing.backupCustomDocument(csv, { destination: vscode.Uri.joinPath(directory, 'rich-csv.backup') }, csvToken.token);
  const recoveryToken = new vscode.CancellationTokenSource();
  const csvRecoveryUri = vscode.Uri.joinPath(directory, 'rich-recovered.csv');
  await vscode.workspace.fs.writeFile(csvRecoveryUri, sortedCsvBytes);
  const recoveredCsv = await api.editing.openCustomDocument(csvRecoveryUri, { backupId: csvBackup.id, untitledDocumentData: undefined }, recoveryToken.token);
  const recoveryPanel = api.editing.createRecoveryTestPanel();
  const recoveryFrame = renderedPromise(api);
  await api.editing.resolveCustomEditor(recoveredCsv, recoveryPanel, recoveryToken.token);
  assert.equal((await recoveryFrame).rendered, true);
  assert.equal(await recoveredCsv.request('test:cell-input', { sheet: 0, row: 2, col: 1 }), '=B2*2', 'Recovery keeps the formula, not just its value');
  assert.equal(recoveredCsv.dirty, true);
  assert.ok((await recoveredCsv.request('test:csv-status') as { features: string[] }).features.includes('formatting'));
  const workbookCopy = vscode.Uri.joinPath(directory, 'converted.xlsx');
  const savedBeforeCopy = csv.savedToken;
  await assert.rejects(api.editing.saveWorkbookCopy(csv, vscode.Uri.parse('craft-no-provider:/failed.xlsx'), csvToken.token));
  assert.equal(csv.savedToken, savedBeforeCopy);
  assert.equal(csv.dirty, true);
  await api.editing.saveCustomDocumentAs(csv, workbookCopy, csvToken.token);
  assert.equal(csv.savedToken, savedBeforeCopy, 'Saving an XLSX copy does not acknowledge the CSV source');
  assert.equal(csv.dirty, true);
  assert.deepEqual(await vscode.workspace.fs.readFile(csvUri), sortedCsvBytes);
  assert.equal(Buffer.from(await vscode.workspace.fs.readFile(workbookCopy)).subarray(0, 2).toString(), 'PK');
  await csv.request('test:command', { command: 'home.insertSheet', params: { name: 'Extra' } });
  assert.ok((await csv.request('test:csv-status') as { features: string[] }).features.includes('multiple worksheets'));
  const multiCopy = vscode.Uri.joinPath(directory, 'multiple.xlsx');
  await api.editing.saveWorkbookCopy(csv, multiCopy, csvToken.token);
  const xmlSummary = JSON.parse(execFileSync('python3', [path.join(root!, 'test/editing/workbook-summary.py')], { input: await vscode.workspace.fs.readFile(multiCopy), encoding: 'utf8' })) as { sheets: number; formulas: string[]; bold: boolean };
  assert.equal(xmlSummary.sheets, 2, 'XLSX copy keeps every worksheet');
  assert.ok(xmlSummary.formulas.includes('B2*2'));
  assert.equal(xmlSummary.bold, true, 'XLSX copy retains bold formatting');
  recoveryPanel.dispose(); recoveredCsv.dispose(); recoveryToken.dispose(); csvBackup.delete();
  await api.editing.revertCustomDocument(csv, csvToken.token);
  await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  const workbook = await open(api, workbookCopy);
  assert.equal(await workbook.request('test:cell-input', { sheet: 0, row: 2, col: 1 }), '=B2*2');
  assert.equal(await workbook.request('test:cell', { sheet: 0, row: 2, col: 1 }), '42');
  csvToken.dispose();
  await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  doc = await open(api, uri);
  console.log('CSV delimiter, quoting, multiline Unicode, native edit, Undo/Redo and save/reopen passed');
  // External modifications are never silently overwritten.
  await edit(doc, '30');
  await vscode.workspace.fs.writeFile(uri, original);
  const cancellation = new vscode.CancellationTokenSource();
  await assert.rejects(api.editing.saveCustomDocument(doc, cancellation.token), /changed on disk/);
  assert.equal(doc.dirty, true);
  assert.deepEqual(await vscode.workspace.fs.readFile(uri), original);
  const copy = vscode.Uri.joinPath(directory, 'save-as.xlsx');
  await api.editing.saveCustomDocumentAs(doc, copy, cancellation.token);
  assert.deepEqual(await vscode.workspace.fs.readFile(uri), original, 'Save As must leave original bytes intact');
  await assert.rejects(api.editing.saveCustomDocumentAs(doc, vscode.Uri.joinPath(directory, 'wrong.pdf'), cancellation.token), /XLSX/);
  await revert(doc);
  await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  const copied = await open(api, copy);
  assert.equal(await cell(copied), '30', 'Save As copy contains the edited value');
  await vscode.commands.executeCommand('workbench.action.closeActiveEditor');

  console.log('Save As passed');
  let memory = original;
  let denyWrites = true;
  let blockedWrite: (() => void) | undefined;
  let enteredWrite: (() => void) | undefined;
  const changes = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
  const registration = vscode.workspace.registerFileSystemProvider('craft-edit-test', {
    onDidChangeFile: changes.event, watch: () => new vscode.Disposable(() => {}),
    stat: uri => ({ type: uri.path.endsWith('.xlsx') ? vscode.FileType.File : vscode.FileType.Directory, ctime: 0, mtime: 0, size: memory.byteLength }),
    readDirectory: () => [], readFile: () => memory,
    writeFile: async (_uri, data) => {
      if (denyWrites) throw vscode.FileSystemError.NoPermissions('Test destination is read only');
      if (enteredWrite) {
        const callback = enteredWrite; enteredWrite = undefined; callback();
        await new Promise<void>(resolve => { blockedWrite = resolve; });
      }
      memory = Uint8Array.from(data);
    },
    createDirectory: () => {}, delete: () => {}, rename: () => {},
  });
  const remote = vscode.Uri.parse('craft-edit-test:/remote/book.xlsx');
  try {
    const remoteDoc = await open(api, remote);
    await edit(remoteDoc, '35');
    await assert.rejects(api.editing.saveCustomDocument(remoteDoc, cancellation.token), /read only|permissions/i);
    assert.equal(remoteDoc.dirty, true, 'Failed writes must keep edits dirty');
    assert.deepEqual(memory, original);
    const cancelled = new vscode.CancellationTokenSource(); cancelled.cancel();
    await assert.rejects(api.editing.saveCustomDocument(remoteDoc, cancelled.token), vscode.CancellationError);
    cancelled.dispose();
    console.log('Failed/cancelled saves passed');
    denyWrites = false;
    assert.ok(await vscode.workspace.save(remote));
    console.log('Remote Save passed');
    await edit(remoteDoc, '40');
    const started = new Promise<void>(resolve => { enteredWrite = resolve; });
    const saving = vscode.workspace.save(remote);
    await Promise.race([started, new Promise((_, reject) => setTimeout(() => reject(new Error('Save never entered write')), 10000))]);
    await edit(remoteDoc, '45');
    assert.ok(blockedWrite); blockedWrite(); blockedWrite = undefined;
    assert.ok(await saving);
    assert.equal(await cell(remoteDoc), '45');
    assert.equal(remoteDoc.dirty, true, 'Edits made during a write must stay dirty');
    assert.notEqual(remoteDoc.token, remoteDoc.savedToken);
    assert.ok(await vscode.workspace.save(remote));
    assert.equal(remoteDoc.dirty, false);

    console.log('Concurrent save passed');
    await edit(remoteDoc, '50');
    const backupUri = vscode.Uri.joinPath(directory, 'recovery.backup');
    const backup = await api.editing.backupCustomDocument(remoteDoc, { destination: backupUri }, cancellation.token);
    const recoveredUri = vscode.Uri.joinPath(directory, 'recovered.xlsx');
    await vscode.workspace.fs.writeFile(recoveredUri, memory);
    const recovered = await api.editing.openCustomDocument(recoveredUri, { backupId: backup.id, untitledDocumentData: undefined }, cancellation.token);
    const panel = api.editing.createRecoveryTestPanel();
    const rendered = renderedPromise(api);
    await api.editing.resolveCustomEditor(recovered, panel, cancellation.token);
    assert.equal((await rendered).rendered, true);
    assert.equal(await cell(recovered), '50', 'Backup restores unsaved edits');
    assert.equal(recovered.dirty, true);
    await api.editing.saveCustomDocument(recovered, cancellation.token);
    assert.equal(recovered.dirty, false);
    panel.dispose(); recovered.dispose(); backup.delete();
    await vscode.commands.executeCommand('vscode.openWith', remote, 'craft.spreadsheets.preview');
    await revert(remoteDoc);
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  } finally { registration.dispose(); changes.dispose(); cancellation.dispose(); }
  const draftUri = vscode.Uri.joinPath(directory, 'draft.xlsx');
  await vscode.workspace.fs.writeFile(draftUri, original);
  const draft = await open(api, draftUri);
  assert.equal(draft.dirty, false);
  await draft.request('test:draft', { row: 1, col: 1 });
  await waitFor(() => draft.dirty);
  assert.equal(await cell(draft), '42', 'Typing keeps the native draft open until commit');
  assert.ok(await vscode.workspace.save(draftUri));
  assert.equal(await cell(draft), '7', 'Save serializes the pending native cell draft');
  assert.equal(await draft.request('test:draft-text'), '7', 'Saving must preserve the active native cell draft');
  assert.equal(draft.dirty, false);
  await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  const reopenedDraft = await open(api, draftUri);
  assert.equal(await cell(reopenedDraft), '7');
  await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  // Real VS Code afterDelay autosave must leave cell entry and the text agent intact.
  const files = vscode.workspace.getConfiguration('files');
  const oldAutoSave = files.inspect<string>('autoSave')?.globalValue;
  const oldDelay = files.inspect<number>('autoSaveDelay')?.globalValue;
  const autoUri = vscode.Uri.joinPath(directory, 'autosave.xlsx');
  await vscode.workspace.fs.writeFile(autoUri, original);
  let auto = await open(api, autoUri);
  let finalUri = autoUri;
  try {
    await files.update('autoSaveDelay', 300, vscode.ConfigurationTarget.Global);
    await files.update('autoSave', 'afterDelay', vscode.ConfigurationTarget.Global);
    await auto.request('test:draft', { row: 1, col: 1 });
    await waitFor(() => !auto.dirty);
    assert.equal(await auto.request('test:draft-text'), '7');
    assert.equal(await auto.request('test:continue-draft', { text: '8' }), '78', 'Typing continues in the same cell after autosave');
    await waitFor(() => !auto.dirty);
    assert.equal(await cell(auto), '78');
    await auto.request('test:editor-key', { key: 'Enter' });
    await waitFor(() => !auto.dirty);
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    finalUri = vscode.Uri.joinPath(directory, 'autosave-formula.xlsx');
    await vscode.workspace.fs.writeFile(finalUri, original);
    auto = await open(api, finalUri);
    const savedText = original;
    await auto.request('test:draft', { row: 1, col: 1, text: '=' });
    assert.equal(await auto.request('test:continue-draft', { text: '1+' }), '=1+');
    await new Promise(resolve => setTimeout(resolve, 1000));
    assert.equal(auto.dirty, true, 'Incomplete formula stays unsaved');
    assert.equal(await auto.request('test:draft-text'), '=1+');
    assert.deepEqual(await vscode.workspace.fs.readFile(finalUri), savedText, 'Autosave cannot overwrite the file with an unfinished formula');
    assert.equal(await auto.request('test:continue-draft', { text: '2' }), '=1+2');
    await waitFor(() => !auto.dirty);
    assert.equal(await cell(auto), '3');
    assert.equal(await auto.request('test:draft-text'), '=1+2');
    await auto.request('test:editor-key', { key: 'Enter' });
    await waitFor(() => !auto.dirty);
  } finally {
    await files.update('autoSave', oldAutoSave, vscode.ConfigurationTarget.Global);
    await files.update('autoSaveDelay', oldDelay, vscode.ConfigurationTarget.Global);
  }
  await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  const autoReopened = await open(api, finalUri);
  assert.equal(await cell(autoReopened), '3');
  await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  console.log('Autosave preserves native cell input, continued typing and incomplete formulas.');
  console.log('Native editing: cell/formula round trip, Undo/Redo, Save As, Revert, failed/cancelled saves, edits during write, and backup recovery passed.');
}
async function open(api: EditorApi, uri: vscode.Uri): Promise<EditableDocument> {
  const result = renderedPromise(api);
  await vscode.commands.executeCommand('vscode.open', uri);
  const rendered = await result;
  assert.equal(rendered.rendered, true, rendered.failure);
  const doc = api.editing.getDocument(uri); assert.ok(doc); return doc;
}
function renderedPromise(api: EditorApi): Promise<RenderResult> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { listener.dispose(); reject(new Error('Native editor did not render')); }, 70_000);
    const listener = api.onDidRender(result => { clearTimeout(timer); listener.dispose(); resolve(result); });
  });
}
async function edit(doc: EditableDocument, text: string): Promise<unknown> {
  return doc.request('test:edit', { row: 1, col: 1, text });
}
async function cell(doc: EditableDocument, row = 1): Promise<unknown> {
  return doc.request('test:cell', { sheet: 0, row, col: 1 });
}

async function waitFor(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 5000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for the editor lifecycle');
    await new Promise(resolve => setTimeout(resolve, 25));
  }
}

async function revert(doc: EditableDocument): Promise<void> {
  const before = doc.token;
  await vscode.commands.executeCommand('workbench.action.files.revert');
  await waitFor(() => doc.token !== before && !doc.dirty);
}

function createAgent(config: EditorApi['mcp']) {
  const process = spawn(config.command, config.args, { env: { ...globalThis.process.env, ...config.env }, stdio: ['pipe', 'pipe', 'pipe'] });
  const lines = createInterface({ input: process.stdout });
  type Response = { result?: { isError?: boolean; content?: { text?: string }[] } };
  const waiting = new Map<number, { resolve: (value: Response) => void; reject: (error: Error) => void }>();
  let sequence = 0;
  lines.on('line', line => { const response = JSON.parse(line) as Response & { id: number }; const entry = waiting.get(response.id); if (entry) { waiting.delete(response.id); entry.resolve(response); } });
  process.on('exit', () => { for (const entry of waiting.values()) entry.reject(new Error('MCP proxy exited')); waiting.clear(); });
  return {
    call(method: string, params: object): Promise<Response> {
      const id = ++sequence;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { waiting.delete(id); reject(new Error(`MCP ${method} timed out`)); }, 15000);
        waiting.set(id, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
        process.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
      });
    },
    close(): void { process.stdin.end(); },
  };
}
