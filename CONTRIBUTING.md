# Contributing to tramli

tramli is a **monorepo** with three language implementations sharing the same
design: Java, TypeScript, and Rust. This guide covers environment setup,
running tests, and the PR workflow.

## Development Environment

### Prerequisites

| Tool | Version |
|------|---------|
| Java (JDK) | 21+ |
| Node.js | 18+ (Bun optional) |
| Rust | 1.75+ (edition 2021) |
| Maven | 3.9+ (or use `mvnw`) |

### Clone and build

```bash
git clone https://github.com/opaopa6969/tramli.git
cd tramli
```

### Java

```bash
cd lang/java
mvn test
```

### TypeScript

```bash
npm install          # root — sets up workspaces
npm run build -w lang/ts
npm test -w lang/ts  # vitest run
```

### Rust

```bash
cd lang/rust
cargo test
```

## Shared Tests

Cross-language test scenarios live in [`shared-tests/scenarios/`](shared-tests/).
Each YAML file describes a flow execution path that must produce identical
results across all three languages. See [`shared-tests/README.md`](shared-tests/README.md)
for the format.

To add a scenario:

1. Create a `.yaml` file in `shared-tests/scenarios/`
2. Run tests in all three languages
3. If a scenario fails in one language but passes in others, the failing
   implementation has a bug — file an issue

## Pull Request Workflow

1. **Fork and branch** — create a branch from `main`:
   ```bash
   git checkout -b fix/issue-<number>-<short-description>
   ```

2. **Write tests** — every change should include or update a test. If fixing a
   bug, add a shared test scenario that reproduces it.

3. **Run all relevant language tests** before pushing:
   ```bash
   # Java
   cd lang/java && mvn test
   # TypeScript
   npm test -w lang/ts
   # Rust
   cd lang/rust && cargo test
   ```

4. **Commit** — use conventional commit messages:
   ```
   fix(java): reject duplicate external requires sets
   feat(rust): add cross flow data map
   docs: move long-term improvement backlog to roadmap
   ```

5. **Open a PR** — reference the issue with `Closes #<number>` in the PR body.
   One PR per meaningful unit.

6. **Merge** — after CI passes, a maintainer merges with
   `gh pr merge --merge --delete-branch`.

### DGE / Design Dialogue

For design discussions and gap extraction, tramli uses the DGE toolkit
(see [`AGENTS.md`](AGENTS.md) for the workflow). Design decisions should be
documented in the PR description.

## Code Style

- **Java**: standard Maven/Java conventions. No external dependencies for the
  core library (Jackson is optional for JSONB).
- **TypeScript**: ESM-first. `tsc` for build, `vitest` for tests.
- **Rust**: `cargo fmt` + `cargo clippy` before committing.

## Core Release

Core releases use one version for `@unlaxer/tramli`, the `tramli` crate,
`org.unlaxer:tramli`, and `org.unlaxer:tramli-bom`. Plugin packages keep their
own release cadence.

1. Set and verify the version:
   ```bash
   node scripts/set-core-version.mjs --write 3.8.0
   node scripts/set-core-version.mjs --check 3.8.0
   ```
2. Merge the version change after the normal test and PR workflow.
3. Run the `Release core` workflow on `main` with that version. Keep
   `publish` disabled first to exercise all tests and package dry-runs, then
   run it again with `publish` enabled.
4. The publish run skips versions already found in a registry, which makes a
   retry safe after a partial release. It finishes by compiling consumers
   against the public npm, crates.io, and Maven Central artifacts.

The GitHub `release` environment requires these secrets:

| Secret | Purpose |
|--------|---------|
| `CARGO_REGISTRY_TOKEN` | crates.io granular publish token |
| `MAVEN_CENTRAL_USERNAME` | Maven Central Portal token username |
| `MAVEN_CENTRAL_PASSWORD` | Maven Central Portal token password |
| `MAVEN_GPG_PRIVATE_KEY` | ASCII-armored signing key |
| `MAVEN_GPG_PASSPHRASE` | signing-key passphrase |

npm uses a Trusted Publisher instead of a long-lived token. Configure
`opaopa6969/tramli`, workflow `release-core.yml`, and environment `release` on
npmjs.com. The workflow grants OIDC only to the publish job.

To verify an existing public version independently:

```bash
scripts/smoke-public-core.sh 3.7.1
```

## License

By contributing, you agree that your contributions are licensed under the MIT
License. See [`LICENSE`](LICENSE).
