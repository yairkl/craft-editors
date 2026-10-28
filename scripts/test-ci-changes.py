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
                         dict(code=False, fixtures=False, build=False, wheel=False, remote_script=False, platform=False))

    def test_fixtures_trigger_verification_and_platform_smoke(self):
        self.assertEqual(module.classify(['integration-tests/fixtures/example.xlsx']),
                         dict(code=False, fixtures=True, build=True, wheel=False, remote_script=False, platform=True))

    def test_source_and_wheel_changes_select_build_and_tests(self):
        self.assertEqual(module.classify(['src/host.ts', 'adapters/grid/src/wheel.rs']),
                         dict(code=True, fixtures=False, build=True, wheel=True, remote_script=False, platform=True))

    def test_remote_test_script_only_checks_its_syntax(self):
        self.assertEqual(module.classify(['scripts/test-remote-ssh.cjs']),
                         dict(code=False, fixtures=False, build=False, wheel=False, remote_script=True, platform=False))

    def test_platform_suite_changes_trigger_platform_build(self):
        self.assertTrue(module.classify(['test/platform/index.ts'])['platform'])
        self.assertTrue(module.classify(['test/platform/index.ts'])['build'])

    def test_unknown_paths_are_conservative(self):
        self.assertTrue(module.classify(['new-component/file'])['build'])


if __name__ == '__main__':
    unittest.main()
