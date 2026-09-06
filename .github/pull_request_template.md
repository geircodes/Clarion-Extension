<!--
  Base branch: please target the current development branch (version-x.y.z),
  NOT master. `master` only ever receives the release merge.

  If GitHub pre-selected the wrong base, change it in the "base:" dropdown at
  the top of this page — no need to close and reopen the PR, and a maintainer
  can retarget it for you if you have already opened it.

  See CONTRIBUTING.md for the branching model.
-->

## What this changes

<!-- What was broken or missing, and what it does now. A repro case helps a lot. -->

## Why

<!-- Root cause, if you found it. "Why it wasn't caught before" is useful too. -->

## Testing

<!--
  How you verified it. Tests are welcome but not mandatory for small fixes.
  If you ran the suite, say so: `npm test` (server) / `npm run test:client`.
-->

---

- [ ] Targets the current `version-x.y.z` branch, not `master`
- [ ] `npx tsc -b` is clean
- [ ] Existing tests still pass (`npm test`)

<!--
  No need to edit CHANGELOG.md — a maintainer adds the entry on merge and
  credits you there.
-->
