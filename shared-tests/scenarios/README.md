# Shared Test Scenarios

These YAML files define the expected behavior of tramli flows across all 3 languages.
Each scenario is implemented as a test in each language:

- **Java**: `lang/java/src/test/java/org/unlaxer/tramli/SharedScenarioTest.java`
- **TypeScript**: `lang/ts/tests/shared-scenarios.test.ts`
- **Rust**: `lang/rust/tests/shared_scenarios.rs`

Paths are relative to the repository root.

To add a new scenario:
1. Write the YAML specification here
2. Implement the corresponding test in all 3 languages
3. Verify all 3 pass
