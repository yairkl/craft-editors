#!/usr/bin/env python3
"""Select PR checks conservatively from the paths changed against the base."""
import os
import subprocess


def classify(paths):
    result = {'code': False, 'fixtures': False, 'build': False, 'wheel': False, 'remote_script': False, 'platform': False}
    for path in paths:
        if path.startswith(('docs/', '.github/')) or path in {
            'README.md', 'CONTRIBUTING.md', 'LICENSE', '.gitattributes', '.gitignore',
            'scripts/ci-changes.py', 'scripts/test-ci-changes.py',
        }:
            continue
        if path.startswith('integration-tests/fixtures/') or path == 'scripts/generate-fixtures.py':
            result['fixtures'] = True
            result['build'] = True
            result['platform'] = True
            continue
        if path == 'scripts/test-remote-ssh.cjs':
            result['remote_script'] = True
            continue
        if path.startswith('test/platform/') or path in {'scripts/test-extensions.cjs', 'scripts/unpack-test-renderers.py'}:
            result['code'] = True
            result['build'] = True
            result['platform'] = True
            continue
        if path.startswith('test/') or path.startswith('integration-tests/') or path.startswith('scripts/test-'):
            result['code'] = True
            continue
        # Unknown paths are treated as product changes rather than silently skipping checks.
        result['code'] = True
        result['build'] = True
        result['platform'] = True
        if path.startswith(('adapters/grid/', 'adapters/native/')) or path in {'adapters/Cargo.toml', 'adapters/Cargo.lock'}:
            result['wheel'] = True
        if path in {'package.json', 'package-lock.json'}:
            result['fixtures'] = True
    return result


def main():
    base = os.environ['PR_BASE_SHA']
    changed = subprocess.check_output(['git', 'diff', '--name-only', '-z', base, 'HEAD'])
    paths = [os.fsdecode(p) for p in changed.split(b'\0') if p]
    selections = classify(paths)
    with open(os.environ['GITHUB_OUTPUT'], 'a', encoding='utf-8') as output:
        for name, selected in selections.items():
            print(f'{name}={str(selected).lower()}', file=output)
    print('Changed paths:', ', '.join(paths))
    print('Selected checks:', selections)


if __name__ == '__main__':
    main()
