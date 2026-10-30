#!/usr/bin/env python3
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('updater', Path(__file__).with_name('upstream-release-candidate.py'))
updater = importlib.util.module_from_spec(spec)
spec.loader.exec_module(updater)


class CandidateTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        (self.root / 'upstream').mkdir()
        (self.root / 'packages/spreadsheets').mkdir(parents=True)
        self.write('upstream/manifest.json', {'applications': [{'id': 'gridcraft', 'repository': 'https://github.com/storytold/gridcraft', 'version': '0.11.1', 'revision': 'a' * 40}]})
        self.write('packages/spreadsheets/package.json', {'name': 'craft-spreadsheets', 'version': '0.1.4'})
        self.write('package-lock.json', {'packages': {'packages/spreadsheets': {'name': 'craft-spreadsheets', 'version': '0.1.4'}}})

    def tearDown(self):
        self.temp.cleanup()

    def write(self, name, value):
        (self.root / name).write_text(json.dumps(value))

    def read(self, name):
        return json.loads((self.root / name).read_text())

    def test_new_release_updates_only_its_pin_and_extension_version(self):
        replies = [{'tag_name': 'v0.13.0', 'draft': False, 'prerelease': False}, {'object': {'type': 'tag', 'sha': 'b' * 40}}, {'object': {'type': 'commit', 'sha': 'c' * 40}}, {'status': 'ahead'}]
        with patch.object(updater, 'api', side_effect=replies):
            result = updater.prepare('gridcraft', self.root)
        self.assertEqual(result['commit'], 'c' * 40)
        app = self.read('upstream/manifest.json')['applications'][0]
        self.assertEqual((app['version'], app['revision']), ('0.13.0', 'c' * 40))
        self.assertEqual(self.read('packages/spreadsheets/package.json')['version'], '0.1.5')
        self.assertEqual(self.read('package-lock.json')['packages']['packages/spreadsheets']['version'], '0.1.5')

    def test_older_or_equal_release_does_not_downgrade(self):
        with patch.object(updater, 'api', return_value={'tag_name': 'v0.11.1', 'draft': False, 'prerelease': False}):
            self.assertIsNone(updater.prepare('gridcraft', self.root))
        self.assertEqual(self.read('packages/spreadsheets/package.json')['version'], '0.1.4')

    def test_rejects_prerelease_and_unsafe_tag(self):
        for release in [{'tag_name': 'v0.12.0', 'prerelease': True}, {'tag_name': 'v0.12.0-rc.1', 'prerelease': False}, {'tag_name': '../bad', 'prerelease': False}]:
            with self.subTest(release=release), patch.object(updater, 'api', return_value=release), self.assertRaises(ValueError):
                updater.prepare('gridcraft', self.root)

    def test_rejects_unexpected_tag_object(self):
        with patch.object(updater, 'api', return_value={'object': {'type': 'tree', 'sha': 'c' * 40}}), self.assertRaises(ValueError):
            updater.release_commit('gridcraft', 'v0.13.0')

    def test_rejects_cyclic_annotated_tags(self):
        with patch.object(updater, 'api', return_value={'object': {'type': 'tag', 'sha': 'c' * 40}}), self.assertRaises(ValueError):
            updater.release_commit('gridcraft', 'v0.13.0')

    def test_rejects_divergent_source_history(self):
        replies = [{'tag_name': 'v0.13.0'}, {'object': {'type': 'commit', 'sha': 'c' * 40}}, {'status': 'diverged'}]
        with patch.object(updater, 'api', side_effect=replies), self.assertRaisesRegex(ValueError, 'not a descendant'):
            updater.prepare('gridcraft', self.root)
        self.assertEqual(self.read('upstream/manifest.json')['applications'][0]['revision'], 'a' * 40)

    def test_source_version_must_match_release(self):
        manifest = self.read('upstream/manifest.json')
        manifest['applications'][0]['minimumRust'] = '1.90'
        self.write('upstream/manifest.json', manifest)
        checkout = self.root / 'upstream/checkouts/gridcraft'
        checkout.mkdir(parents=True)
        cargo = checkout / 'Cargo.toml'
        cargo.write_text('[workspace.package]\nversion = "0.12.0"\nrust-version = "1.95"\n')
        with self.assertRaisesRegex(ValueError, 'disagree'):
            updater.verify_source('gridcraft', self.root)
        cargo.write_text('[workspace.package]\nversion = "0.11.1"\nrust-version = "1.95"\n')
        updater.verify_source('gridcraft', self.root)
        self.assertEqual(self.read('upstream/manifest.json')['applications'][0]['minimumRust'], '1.95')


if __name__ == '__main__':
    unittest.main()
