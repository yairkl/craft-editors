#!/usr/bin/env python3
"""Reuse the exact engines from the packaged PR build for platform tests."""
from pathlib import Path, PurePosixPath
from zipfile import ZipFile

root = Path(__file__).resolve().parent.parent
packages = {'spreadsheets': 'grid', 'word': 'word', 'powerpoint': 'deck', 'pdf': 'pdf', 'vector': 'vector'}
for name, engine in packages.items():
    matches = list((root / 'dist/vsix').glob(f'craft-{name}-*.vsix'))
    if len(matches) != 1:
        raise SystemExit(f'Expected exactly one {name} VSIX, found {len(matches)}')
    prefix = f'extension/media/engines/{engine}/'
    extracted = set()
    with ZipFile(matches[0]) as archive:
        for member in archive.infolist():
            if not member.filename.startswith(prefix) or member.is_dir():
                continue
            relative = PurePosixPath(member.filename[len(prefix):])
            if relative.is_absolute() or '..' in relative.parts:
                raise SystemExit(f'Invalid renderer path: {member.filename}')
            destination = root / 'media/engines' / engine / Path(*relative.parts)
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(archive.read(member))
            extracted.add(relative.as_posix())
    required = {'viewer.js', 'viewer_bg.wasm', 'node/viewer.js', 'node/viewer_bg.wasm'}
    if not required <= extracted:
        raise SystemExit(f'{name} VSIX is missing {sorted(required - extracted)}')
    print(f'Extracted {len(extracted)} {engine} renderer files from {matches[0].name}')
