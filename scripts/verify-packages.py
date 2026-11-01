"""Check installed archive contents and renderer isolation for every application."""
import json
import re
from pathlib import Path
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
PROGRAMS = {
    'spreadsheets': ('grid', 'xlsx', 'gridcraft'),
    'word': ('word', 'docx', 'wordcraft'),
    'powerpoint': ('deck', 'pptx', 'deckcraft'),
    'pdf': ('pdf', 'pdf', 'pdfcraft'),
    'vector': ('vector', 'svg', 'vectorcraft'),
}
for name in [*PROGRAMS, 'suite']:
    manifest = json.loads((ROOT / 'packages' / name / 'package.json').read_text())
    archive = ROOT / 'dist/vsix' / f"{manifest['name']}-{manifest['version']}.vsix"
    with ZipFile(archive) as z:
        files = set(z.namelist())
        installed = json.loads(z.read('extension/package.json'))
        assert installed == manifest, f'{name}: packaged manifest drift'
        assert installed.get('icon') == 'icon.png' and 'extension/icon.png' in files, f'{name}: missing extension icon'
        assert z.read('extension/icon.png').startswith(b'\x89PNG\r\n\x1a\n'), f'{name}: icon is not PNG'
        assert not installed.get('extensionDependencies'), f'{name}: unexpected required extension'
        assert not any('node_modules/' in f or '-checks.js' in f or '/test/' in f for f in files)
        if name in PROGRAMS:
            engine, extension, program = PROGRAMS[name]
            prefix = f'extension/media/engines/{engine}/'
            assert prefix + 'viewer_bg.wasm' in files and prefix + 'viewer.js' in files
            assert 'extension/out/src/file-limits.js' in files
            assert 'extension/out/src/backup.js' in files
            assert 'extension/out/src/byte-buffer.js' in files
            assert 'extension/out/src/coalesced-task.js' in files
            if name == 'spreadsheets':
                assert prefix + 'node/viewer.js' in files and prefix + 'node/viewer_bg.wasm' in files
                assert 'extension/out/src/mcp.js' in files
                assert 'extension/out/src/mcp-transport.js' in files
                assert 'extension/out/src/mcp-proxy.js' in files
                assert 'extension/out/src/mcp-files.js' in files
            if name in ('word', 'powerpoint', 'vector', 'pdf'):
                assert prefix + 'node/viewer.js' in files and prefix + 'node/viewer_bg.wasm' in files
                assert 'extension/out/src/document-mcp.js' in files
                assert 'extension/out/src/mcp-transport.js' in files
                assert 'extension/out/src/mcp-proxy.js' in files
                assert 'extension/out/src/mcp-files.js' in files
            assert all(f.startswith(prefix) for f in files if f.startswith('extension/media/engines/'))
            assert all(f.endswith(f'/{name}.js') for f in files if '/entrypoints/' in f)
            assert 'extension/' + installed['main'].removeprefix('./') in files
            if name in PROGRAMS:
                assert 'extension/notices/fonts/NotoSansHebrew-OFL.txt' in files
            dependencies = json.loads(z.read('extension/notices/dependencies.json'))
            for dependency in dependencies:
                if dependency['license'] == 'MPL-2.0' and str(dependency['source']).startswith('registry+'):
                    assert dependency.get('sourceArchive', '').startswith('https://crates.io/api/v1/crates/'), f"{name}: missing MPL source archive for {dependency['name']}"
                    assert 'extension/notices/licenses/MPL-2.0.txt' in files, f"{name}: missing MPL license text"
            for other_name, (_, _, other_program) in PROGRAMS.items():
                if other_name != name:
                    assert not any(p['name'].startswith(other_program + '-') for p in dependencies), f'{name}: sibling engine dependency'
            for editor in installed['contributes']['customEditors']:
                assert editor['selector'] == ([{'filenamePattern': '*.svg'}, {'filenamePattern': '*.vectorcraft'}] if name == 'vector' and not editor['viewType'].endswith('integrationProbe') else ([{'filenamePattern': '*.xlsx'}, {'filenamePattern': '*.csv'}, {'filenamePattern': '*.tsv'}] if name == 'spreadsheets' and not editor['viewType'].endswith('integrationProbe') else [{'filenamePattern': f'*.{extension}'}]))
            for renderer in (ROOT / 'media/engines' / engine).rglob('*'):
                if renderer.is_file() and renderer.suffix in ('.js', '.wasm'):
                    relative = renderer.relative_to(ROOT / 'media/engines' / engine).as_posix()
                    assert z.read(prefix + relative) == renderer.read_bytes()
            # wasm-bindgen can emit extra modules (DeckCraft's text agent).
            glue = z.read(prefix + 'viewer.js').decode()
            for module in re.findall(r"(?:from\s+)[\"'](\./[^\"']+)[\"']", glue):
                assert prefix + module.removeprefix('./') in files, f'{name}: missing imported module {module}'
        else:
            assert not installed.get('main') and not installed.get('browser')
            assert not any(f.startswith(('extension/media/', 'extension/out/')) for f in files)
            assert set(installed['extensionPack']) == {f'craft-vscode-dev.craft-{program}' for program in PROGRAMS}
        print(f'Verified {archive.name}: {len(files)} files, {archive.stat().st_size:,} bytes; renderer isolation passed.')
