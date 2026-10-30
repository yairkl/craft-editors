#!/usr/bin/env python3
import importlib.util
import hashlib
import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('publisher', Path(__file__).with_name('publish-upstream-candidate.py'))
publisher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(publisher)


class PublishTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        (self.root / 'upstream').mkdir()
        (self.root / 'adapters').mkdir()
        (self.root / 'adapters/Cargo.lock').write_text('test lockfile')
        (self.root / 'packages/spreadsheets').mkdir(parents=True)
        self.old = {
            'upstream/manifest.json': {'applications': [{'id': 'gridcraft', 'version': '0.11.1', 'revision': 'a' * 40}]},
            'packages/spreadsheets/package.json': {'name': 'craft-spreadsheets', 'version': '0.1.4'},
            'package-lock.json': {'packages': {'packages/spreadsheets': {'version': '0.1.4'}}},
        }
        self.new = {
            'upstream/manifest.json': {'applications': [{'id': 'gridcraft', 'version': '0.13.0', 'revision': 'c' * 40}]},
            'upstream/rendering-build.json': {'sources': {'gridcraft': 'c' * 40}, 'patches': {'gridcraft': []}, 'adapterLockSha256': hashlib.sha256(b'test lockfile').hexdigest()},
            'packages/spreadsheets/package.json': {'name': 'craft-spreadsheets', 'version': '0.1.5'},
            'package-lock.json': {'packages': {'packages/spreadsheets': {'version': '0.1.5'}}},
        }
        self.changed = '\n'.join(self.new)
        for name, value in self.new.items():
            (self.root / name).write_text(json.dumps(value))

    def tearDown(self):
        self.temp.cleanup()

    def validate(self):
        def fake_run(*args, capture=False):
            if args[:3] == ('git', 'diff', '--name-only'):
                return self.changed
            return None
        with patch.object(publisher, 'ROOT', self.root), patch.object(publisher, 'run', side_effect=fake_run), \
             patch.object(publisher, 'previous', side_effect=lambda path: json.loads(json.dumps(self.old[path]))), \
             patch.object(publisher.updater, 'api', side_effect=lambda path: {'status': 'ahead'} if '/compare/' in path else {'tag_name': 'v0.13.0'}), \
             patch.object(publisher.updater, 'release_commit', return_value='c' * 40):
            return publisher.validate_changes('gridcraft')

    def test_expected_update(self):
        self.assertEqual(self.validate(), ('v0.13.0', 'c' * 40, '0.1.5'))

    def test_candidate_in_a_real_git_checkout(self):
        for name, value in self.old.items():
            (self.root / name).write_text(json.dumps(value))
        (self.root / 'upstream/rendering-build.json').write_text('{}')
        subprocess.run(['git', 'init', '-q', str(self.root)], check=True)
        subprocess.run(['git', '-C', str(self.root), 'add', '.'], check=True)
        subprocess.run(['git', '-C', str(self.root), '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'baseline'], check=True)
        for name, value in self.new.items():
            (self.root / name).write_text(json.dumps(value))
        with patch.object(publisher, 'ROOT', self.root), \
             patch.object(publisher.updater, 'api', side_effect=lambda path: {'status': 'ahead'} if '/compare/' in path else {'tag_name': 'v0.13.0'}), \
             patch.object(publisher.updater, 'release_commit', return_value='c' * 40):
            self.assertEqual(publisher.validate_changes('gridcraft'), ('v0.13.0', 'c' * 40, '0.1.5'))

    def test_rejects_unexpected_file(self):
        self.changed += '\n.github/workflows/ci.yml'
        with self.assertRaisesRegex(ValueError, 'unexpected files'):
            self.validate()

    def test_rejects_unrelated_manifest_change(self):
        self.new['upstream/manifest.json']['unrelated'] = True
        (self.root / 'upstream/manifest.json').write_text(json.dumps(self.new['upstream/manifest.json']))
        with self.assertRaisesRegex(ValueError, 'unrelated manifest'):
            self.validate()

    def test_rejects_unrelated_npm_lock_change(self):
        self.new['package-lock.json']['packages']['malicious'] = {}
        (self.root / 'package-lock.json').write_text(json.dumps(self.new['package-lock.json']))
        with self.assertRaisesRegex(ValueError, 'unrelated npm'):
            self.validate()

    def test_rejects_changed_extension_permissions(self):
        self.new['packages/spreadsheets/package.json']['capabilities'] = {'untrustedWorkspaces': {'supported': True}}
        (self.root / 'packages/spreadsheets/package.json').write_text(json.dumps(self.new['packages/spreadsheets/package.json']))
        with self.assertRaisesRegex(ValueError, 'unexpected extension'):
            self.validate()

    def test_rejects_a_baseline_for_the_wrong_source(self):
        self.new['upstream/rendering-build.json']['sources']['gridcraft'] = 'd' * 40
        (self.root / 'upstream/rendering-build.json').write_text(json.dumps(self.new['upstream/rendering-build.json']))
        with self.assertRaisesRegex(ValueError, 'source pins'):
            self.validate()


if __name__ == '__main__':
    unittest.main()
