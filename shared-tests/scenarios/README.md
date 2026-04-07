# Shared Test Scenarios

These YAML files define the expected behavior of tramli flows across all 3 languages.
Each scenario is implemented as a test in each language:

- **Java**: `src/test/java/com/tramli/SharedScenarioTest.java`
- **TypeScript**: `tests/shared-scenarios.test.ts`
- **Rust**: `tests/shared_scenarios.rs`

To add a new scenario:
1. Write the YAML specification here
2. Implement the corresponding test in all 3 languages
3. Verify all 3 pass
