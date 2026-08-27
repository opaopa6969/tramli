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

## License

By contributing, you agree that your contributions are licensed under the MIT
License. See [`LICENSE`](LICENSE).
