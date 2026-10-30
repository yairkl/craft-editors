#!/usr/bin/env python3
import importlib.util
import sys
import unittest
from pathlib import Path

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('ci_changes', Path(__file__).with_name('ci-changes.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class SelectionTests(unittest.TestCase):
    def test_docs_and_workflow_do_not_build(self):
        self.assertEqual(module.classify(['README.md', '.github/workflows/ci.yml']),
                         dict(code=False, fixtures=False, build=False, wheel=False, remote_script=False, platform=False, extended=False))

    def test_upstream_automation_uses_its_own_focused_tests(self):
        files = ['upstream/README.md', 'scripts/upstream-release-candidate.py',
                 'scripts/publish-upstream-candidate.py', 'scripts/test-upstream-release-candidate.py',
                 'scripts/test-publish-upstream-candidate.py']
        self.assertEqual(module.classify(files),
                         dict(code=False, fixtures=False, build=False, wheel=False, remote_script=False, platform=False, extended=False))

    def test_fixtures_trigger_verification_and_platform_smoke(self):
        self.assertEqual(module.classify(['integration-tests/fixtures/example.xlsx']),
                         dict(code=False, fixtures=True, build=True, wheel=False, remote_script=False, platform=True, extended=False))

    def test_source_and_wheel_changes_select_build_and_tests(self):
        self.assertEqual(module.classify(['src/host.ts', 'adapters/grid/src/wheel.rs']),
                         dict(code=True, fixtures=False, build=True, wheel=True, remote_script=False, platform=True, extended=False))

    def test_remote_test_script_only_checks_its_syntax(self):
        self.assertEqual(module.classify(['scripts/test-remote-ssh.cjs']),
                         dict(code=False, fixtures=False, build=False, wheel=False, remote_script=True, platform=False, extended=False))

    def test_platform_suite_changes_trigger_platform_build(self):
        self.assertTrue(module.classify(['test/platform/index.ts'])['platform'])
        self.assertTrue(module.classify(['test/platform/index.ts'])['build'])
        self.assertTrue(module.classify(['test/platform/index.ts'])['extended'])

    def test_render_and_history_checks_get_extended_platform_validation(self):
        for path in ['media/rendering-checks.js', 'test/office/index.ts', 'test/graphics/index.ts', 'test/support/native-keyboard.ts']:
            with self.subTest(path=path):
                selected = module.classify([path])
                self.assertTrue(selected['build'] and selected['platform'] and selected['extended'])

    def test_unknown_paths_are_conservative(self):
        self.assertTrue(module.classify(['new-component/file'])['build'])


if __name__ == '__main__':
    unittest.main()
