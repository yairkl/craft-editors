#!/usr/bin/env python3
"""Publish a validated candidate without executing its code with write access."""
import copy
import hashlib
import importlib.util
import json
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('updater', ROOT / 'scripts/upstream-release-candidate.py')
updater = importlib.util.module_from_spec(spec)
spec.loader.exec_module(updater)


def run(*args, capture=False):
    result = subprocess.run(args, cwd=ROOT, check=True, text=True, stdout=subprocess.PIPE if capture else None)
    return result.stdout.strip() if capture else None


def previous(path):
    return json.loads(run('git', 'show', 'HEAD:' + path, capture=True))


def validate_changes(app):
    editor = updater.EDITORS[app]
    package_path = f'packages/{editor}/package.json'
    allowed = {'upstream/manifest.json', 'upstream/rendering-build.json', 'adapters/Cargo.lock', 'package-lock.json', package_path}
    changed = set(run('git', 'diff', '--name-only', capture=True).splitlines())
    if not {'upstream/manifest.json', 'upstream/rendering-build.json', 'package-lock.json', package_path} <= changed <= allowed:
        raise ValueError('Candidate changes unexpected files or is incomplete')
    old = previous('upstream/manifest.json')
    new = json.loads((ROOT / 'upstream/manifest.json').read_text())
    old_app = next(item for item in old['applications'] if item['id'] == app)
    new_app = next(item for item in new['applications'] if item['id'] == app)
    expected = copy.deepcopy(old)
    entry = next(item for item in expected['applications'] if item['id'] == app)
    for key in ('version', 'revision', 'minimumRust'):
        if key in new_app:
            entry[key] = new_app[key]
    if expected != new or updater.version(new_app['version']) <= updater.version(old_app['version']):
        raise ValueError('Candidate changes unrelated manifest metadata or is not newer')
    baseline = json.loads((ROOT / 'upstream/rendering-build.json').read_text())
    if baseline['sources'] != {item['id']: item['revision'] for item in new['applications']}:
        raise ValueError('Build baseline does not match the candidate source pins')
    if baseline['patches'] != {item['id']: item.get('patches', []) for item in new['applications']}:
        raise ValueError('Build baseline does not match the declared patches')
    if baseline['adapterLockSha256'] != hashlib.sha256((ROOT / 'adapters/Cargo.lock').read_bytes()).hexdigest():
        raise ValueError('Build baseline does not match the adapter lockfile')
    release = updater.api(f'repos/storytold/{app}/releases/latest')
    tag = release['tag_name']
    if release.get('draft') or release.get('prerelease') or updater.version(tag) != updater.version(new_app['version']):
        raise ValueError('Candidate is no longer the latest stable release')
    if updater.release_commit(app, tag) != new_app['revision']:
        raise ValueError('Candidate commit does not match the release tag')
    comparison = updater.api(f'repos/storytold/{app}/compare/{old_app["revision"]}...{new_app["revision"]}')
    if comparison.get('status') != 'ahead':
        raise ValueError('Candidate is not a descendant of the current source pin')
    old_package = previous(package_path)
    new_package = json.loads((ROOT / package_path).read_text())
    major, minor, patch = updater.version(old_package['version'])
    expected_package = copy.deepcopy(old_package)
    expected_package['version'] = f'{major}.{minor}.{patch + 1}'
    if new_package != expected_package:
        raise ValueError('Candidate changes unexpected extension metadata')
    old_lock = previous('package-lock.json')
    new_lock = json.loads((ROOT / 'package-lock.json').read_text())
    old_lock['packages'][f'packages/{editor}']['version'] = expected_package['version']
    if old_lock != new_lock:
        raise ValueError('Candidate changes unrelated npm lockfile entries')
    run('git', 'diff', '--check')
    return tag, new_app['revision'], expected_package['version']


def main():
    app = os.environ['APP']
    repo = os.environ['GITHUB_REPOSITORY']
    base = os.environ['BASE_BRANCH']
    base_sha = os.environ['BASE_SHA']
    if app not in updater.EDITORS or not re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+', repo) or not re.fullmatch(r'[A-Za-z0-9_.-]+', base) or not updater.SHA.fullmatch(base_sha):
        raise ValueError('Invalid repository, application or base revision')
    current = updater.api(f'repos/{repo}/git/ref/heads/{base}')['object']['sha']
    if current != base_sha:
        print('Default branch changed during validation; retry on the new revision.')
        return
    patch_file = os.environ['PATCH_FILE']
    run('git', 'apply', '--check', patch_file)
    run('git', 'apply', patch_file)
    tag, commit, extension_version = validate_changes(app)
    branch = f'automation/upstream-{app}-{tag}'
    existing = json.loads(run('gh', 'pr', 'list', '--repo', repo, '--head', branch, '--state', 'all', '--json', 'number', capture=True))
    if existing:
        print(f'A pull request for {app} {tag} already exists; leaving it unchanged.')
        return
    run('git', 'config', 'user.name', 'github-actions[bot]')
    run('git', 'config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com')
    run('git', 'switch', '-c', branch)
    run('git', 'add', 'upstream/manifest.json', 'upstream/rendering-build.json', 'adapters/Cargo.lock', 'package-lock.json', f'packages/{updater.EDITORS[app]}/package.json')
    run('git', 'commit', '-m', f'Update {app} to {tag}')
    git_auth = ('git', '-c', 'credential.helper=', '-c', 'credential.helper=!gh auth git-credential')
    run(*git_auth, 'push', 'origin', f'HEAD:refs/heads/{branch}')
    body = (f'Updates [{app} to {tag}](https://github.com/storytold/{app}/releases/tag/{tag}) at `{commit}`. '
            f'The corresponding extension advances to {extension_version}.\n\n'
            'The scheduled Linux build, package checks, and editor lifecycle suites passed. '
            'Review the upstream changes, patches, dependency and notice changes, and the pull request checks before merging. '
            'The standard cross-platform PR checks may require workflow approval. No release is published automatically.')
    try:
        run('gh', 'pr', 'create', '--repo', repo, '--base', base, '--head', branch, '--title', f'Update {app} to {tag}', '--body', body)
    except subprocess.CalledProcessError:
        # A failed request can still have created a PR. Delete only our unchanged
        # branch when GitHub confirms no PR exists, so a later check can retry.
        prs = json.loads(run('gh', 'pr', 'list', '--repo', repo, '--head', branch, '--state', 'all', '--json', 'number', capture=True))
        if not prs:
            head = run('git', 'rev-parse', 'HEAD', capture=True)
            run(*git_auth, 'push', f'--force-with-lease=refs/heads/{branch}:{head}', 'origin', f':refs/heads/{branch}')
        raise


if __name__ == '__main__':
    try:
        main()
    except (KeyError, OSError, ValueError, subprocess.CalledProcessError) as error:
        sys.exit(f'Could not propose upstream update: {error}')
