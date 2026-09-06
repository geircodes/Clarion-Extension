# Contributing to Clarion Extension

Thanks for your interest in contributing! Please read the following before opening a PR.

## Branching Model

This project uses a simple release-branch model:

| Branch | Purpose |
|--------|---------|
| `master` | Stable released code — only updated at release time |
| `version-X.X.X` | Active development for the next release |

**Always branch from and target the current development branch** (e.g. `version-1.0.2`), not `master`. The current development branch is the **highest-numbered `version-x.y.z` branch** in the [branch list](https://github.com/msarson/Clarion-Extension/branches) — normally also the repository's default branch, but check the branch list rather than relying on that.

If you open a PR against `master` by mistake, don't close it — change the base in the **`base:`** dropdown at the top of the PR, or just say so and a maintainer will retarget it for you. Nothing is lost either way.

Note that a PR opened against `master` will show a diff containing every commit already merged into the development branch, which can look alarmingly large. Retargeting reduces it to your actual change.

## Getting Started

```bash
git clone https://github.com/msarson/Clarion-Extension.git
cd Clarion-Extension
git checkout version-1.0.2   # or the current development branch (see above)
npm install
npm run compile
```

## Development

```bash
npm run watch        # continuous rebuild
npm run test:server  # run server-side tests (no VS Code needed)
npm run test:client  # run client tests (requires VS Code Extension Host)
```

Press **F5** in VS Code to launch an Extension Development Host for manual testing.

## Submitting a PR

1. Fork the repo
2. Branch from the current development branch (`version-X.X.X`)
3. Make your changes with tests where applicable
4. Ensure `npm run test:server` passes
5. Open a PR targeting the current development branch

## Release Process

Releases are handled by the maintainer via the **Release** GitHub Actions workflow, which:
- Merges the version branch into `master`
- Builds and packages the VSIX
- Creates a GitHub release
- Publishes to the VS Code Marketplace
- Creates the next development branch and sets it as default
