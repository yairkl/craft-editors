# 0.1.7 publication candidate verification

Date: 2026-11-22. Candidate: `5b0b2868208e6538906a203734ac40b0706e4cda`, tagged `v0.1.7-beta.1`.

## Local evidence

- Clean `npm ci`, TypeScript checking, all 17 npm tests, all 22 Python tooling tests and fixture verification passed.
- The reused local renderer build record exactly matched the committed `upstream/rendering-build.json` baseline. Packaging checked source pins, patch lists, lockfile hash and actual renderer hashes against that record.
- All six candidate archives passed `npm run packages:check`, including dependency notice associations, license selections, renderer isolation/provenance and bundled patch hashes. Every dependency inventory entry has a notice association; the graph is conservative and includes build dependencies.
- `xvfb-run -a npm run test:installed` passed for each app independently and for all apps with the Suite, using disposable Linux VS Code 1.102.0 profiles and software graphics rendering.
- A separate disposable profile installed all six official `v0.1.6-beta.3` installers after verifying their published `SHA256SUMS`, then installed the candidate archives with the existing IDs. The five app versions changed from 0.1.6 to 0.1.7; the unchanged Suite stayed at 0.1.6. The installed-extension rendering tests passed for all five apps after the upgrade. This tests direct VSIX upgrading, not registry delivery or document migration from an existing user's workspace.

The local upgrade command used the project's existing installed-test driver and a temporary runner; it did not modify normal VS Code profiles. Native input, full save/history coverage and other platforms are covered by the tagged CI workflow rather than this upgrade check.

## Release CI

[Tagged release run](https://github.com/yairkl/craft-editors/actions/runs/45001299920): dispatched for this candidate. See the run for the authoritative final status. Publication is gated on the required build, Linux suites, Remote SSH and Linux/macOS/Windows matrix jobs.

## Remaining scope

Publisher identity is still undecided. Marketplace/Open VSX ownership, account agreements, authentication, uploads and registry installation/upgrade remain unverified. Cursor is not installed in this verification environment, and this run does not establish current Cursor lifecycle coverage. Keep [issue #14](https://github.com/yairkl/craft-editors/issues/14) open until those requirements are completed.

`npm audit` reported three moderate findings through the development-only VSIX packager and its glob/minimatch dependencies. Archive verification excludes `node_modules` from the installed extensions. Revalidate an updated packaging toolchain before configuring store automation; these results do not claim a clean npm audit.
