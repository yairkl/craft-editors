#!/usr/bin/env python3
"""Prepare one newer stable upstream release for compatibility testing."""
import json
import os
import re
import sys
import tomllib
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EDITORS = {'gridcraft': 'spreadsheets', 'wordcraft': 'word', 'deckcraft': 'powerpoint', 'pdfcraft': 'pdf', 'vectorcraft': 'vector'}
VERSION = re.compile(r'^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$')
SHA = re.compile(r'^[0-9a-f]{40}$')


def version(value):
    match = VERSION.fullmatch(value)
    if not match:
        raise ValueError(f'Unsupported stable version: {value!r}')
    return tuple(map(int, match.groups()))


def api(path):
    request = urllib.request.Request('https://api.github.com/' + path, headers={
        'Accept': 'application/vnd.github+json', 'User-Agent': 'craft-vscode-updater',
        **({'Authorization': 'Bearer ' + os.environ['GH_TOKEN']} if os.getenv('GH_TOKEN') else {}),
    })
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)


def release_commit(app, tag):
    item = api(f'repos/storytold/{app}/git/ref/tags/{tag}')['object']
    # Annotated tags can point to another tag; refuse unexpected objects or cycles.
    seen = set()
    while item['type'] == 'tag':
        sha = item['sha']
        if not SHA.fullmatch(sha) or sha in seen or len(seen) >= 5:
            raise ValueError('Invalid annotated tag chain')
        seen.add(sha)
        item = api(f'repos/storytold/{app}/git/tags/{sha}')['object']
    if item['type'] != 'commit' or not SHA.fullmatch(item['sha']):
        raise ValueError('Release tag does not resolve to a commit')
    return item['sha']


def prepare(app, root=ROOT):
    if app not in EDITORS:
        raise ValueError('Unknown application')
    manifest_path = root / 'upstream/manifest.json'
    manifest = json.loads(manifest_path.read_text())
    entries = [entry for entry in manifest['applications'] if entry['id'] == app]
    if len(entries) != 1 or entries[0]['repository'] != f'https://github.com/storytold/{app}':
        raise ValueError('Invalid application manifest')
    entry = entries[0]
    release = api(f'repos/storytold/{app}/releases/latest')
    tag = release['tag_name']
    candidate = version(tag)
    if release.get('draft') or release.get('prerelease'):
        raise ValueError('Latest release is not stable')
    if candidate <= version(entry['version']):
        print(f'{app}: no newer stable release than {entry["version"]}')
        return None
    commit = release_commit(app, tag)
    if not SHA.fullmatch(entry['revision']):
        raise ValueError('Invalid current source revision')
    comparison = api(f'repos/storytold/{app}/compare/{entry["revision"]}...{commit}')
    if comparison.get('status') != 'ahead':
        raise ValueError('Release is not a descendant of the current source pin; review manually')
    editor = EDITORS[app]
    package_path = root / 'packages' / editor / 'package.json'
    lock_path = root / 'package-lock.json'
    package = json.loads(package_path.read_text())
    lock = json.loads(lock_path.read_text())
    package_lock = lock['packages'][f'packages/{editor}']
    if package_lock['version'] != package['version']:
        raise ValueError('Package version and lockfile disagree')
    major, minor, patch = version(package['version'])
    new_version = f'{major}.{minor}.{patch + 1}'
    entry['version'] = '.'.join(map(str, candidate))
    entry['revision'] = commit
    package['version'] = new_version
    package_lock['version'] = new_version
    for path, value in [(manifest_path, manifest), (package_path, package), (lock_path, lock)]:
        path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n')
    print(f'{app}: {tag} ({commit}); {editor} extension {new_version}')
    return {'app': app, 'tag': tag, 'commit': commit, 'editor': editor, 'extension_version': new_version}


def verify_source(app, root=ROOT):
    if app not in EDITORS:
        raise ValueError('Unknown application')
    manifest_path = root / 'upstream/manifest.json'
    manifest = json.loads(manifest_path.read_text())
    entry = next(item for item in manifest['applications'] if item['id'] == app)
    with (root / 'upstream/checkouts' / app / 'Cargo.toml').open('rb') as source:
        package = tomllib.load(source)['workspace']['package']
    if package['version'] != entry['version']:
        raise ValueError('Release tag and upstream workspace version disagree')
    if 'minimumRust' in entry and 'rust-version' in package:
        entry['minimumRust'] = package['rust-version']
        manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n')
    print(f'{app}: release tag matches upstream workspace version {entry["version"]}')


if __name__ == '__main__':
    try:
        if len(sys.argv) == 3 and sys.argv[1] == '--verify-source':
            verify_source(sys.argv[2])
            sys.exit(0)
        result = prepare(sys.argv[1])
        if os.getenv('GITHUB_OUTPUT'):
            with open(os.environ['GITHUB_OUTPUT'], 'a') as output:
                print('candidate=' + ('true' if result else 'false'), file=output)
                for key, value in (result or {}).items():
                    print(f'{key}={value}', file=output)
    except (IndexError, KeyError, OSError, ValueError, urllib.error.URLError) as error:
        sys.exit(f'Upstream release check failed: {error}')
