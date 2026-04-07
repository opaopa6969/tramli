# Shared Test Scenarios

Language-independent test scenarios in YAML format. Each scenario describes
a flow execution path that must produce identical results across Java, TypeScript, and Rust.

## Format

```yaml
flow: <flow-name>
description: <what this scenario tests>
initial_data:
  TypeName:
    field: value
steps:
  - expect_state: <state-name>
  - resume_with:
      TypeName:
        field: value
    expect_state: <state-name>
  - auto_chain_to: <state-name>
  - expect_completed: true
    exit_state: "<state-name>"
  - expect_context:
      TypeName:
        field: value
```

## Running

Each language has a test runner that reads these YAML files:

- **Java**: `SharedTestRunner.java` reads `shared-tests/scenarios/*.yaml`
- **TypeScript**: `shared-test-runner.test.ts` reads `shared-tests/scenarios/*.yaml`
- **Rust**: `shared_test_runner.rs` reads `shared-tests/scenarios/*.yaml`

## Adding Scenarios

1. Create a new `.yaml` file in `scenarios/`
2. Run tests in all 3 languages
3. If a scenario fails in one language but passes in others, the failing implementation has a bug
