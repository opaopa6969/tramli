# Skill: phase

Change the active development phase.

## Usage

Operator says: `/phase`, "phase を変えて", "spec フェーズにして", "リリース準備"

## Phases

| Phase | Focus | Code? | Risk tolerance |
|-------|-------|-------|---------------|
| `spec` | Design, docs, architecture | No (docs only) | High (exploration) |
| `implementation` | Build features from spec | Yes (full cycle) | Medium |
| `stabilization` | Bug fixes, test coverage, release prep | Yes (fixes only) | Low |
| `maintenance` | Production support | Yes (critical only) | Minimal |

## Procedure

1. Show current phase and available phases
2. Operator selects new phase
3. Update `active_phase` in `.claude/CLAUDE.md`
4. Confirm: "Phase switched to {phase}. Behavior adjusted."

## Phase-specific behavior overrides

### spec
- Do NOT write implementation code
- Focus on: docs, design-questions, ADRs, stories, spec reviews
- `npm test` still runs (existing tests must not break)
- Commit message prefix: `docs:` or `spec:`

### implementation
- Full development cycle (see development-workflow.md)
- All rules apply per autonomous-behavior.md
- Commit message prefix: `feat:`, `fix:`, `refactor:`

### stabilization
- No new features — only bug fixes and test coverage
- Every change needs a test
- Update CHANGELOG.md for each fix
- Commit message prefix: `fix:`, `test:`, `docs:`
- Suggest release when backlog is clear

### maintenance
- Only critical fixes (security, data loss, service down)
- Require human confirmation before every change
- Full test suite + manual verification
- Commit message prefix: `hotfix:`
