# Skill: backlog-management

## When to use
After completing any task, and when discovering new work during implementation.

## Backlog item format

In `docs/backlog.md`, items follow this format:

```markdown
| # | Feature | Status | Design | Depends on |
|---|---------|--------|--------|------------|
| 1 | Portfolio/Project CRUD API | ✅ complete | api-surface.md | — |
| 2 | multi-portfolio membership | 🔨 in-progress | data-model-changes.md | #1 |
| 3 | Agent Registration API | 📋 planned | stories/02-setup/01-agent-registration.md | #2 |
```

## Status values

```
📋 planned      — spec exists, ready to pick up
🔍 designing    — open questions being resolved (check design-questions.md)
🔨 in-progress  — implementation underway
🧪 testing      — code done, verifying tests
✅ complete      — tests pass, docs updated, committed
⏸️ blocked       — waiting on dependency or human decision
```

## Autonomous actions

### On task start
```
1. Change backlog item status to 🔨 in-progress
2. Note start time (optional)
```

### On task complete
```
1. Change status to ✅ complete
2. Check: does this unblock other items? If so, note them.
3. Scan for new items discovered during implementation → add as 📋 planned
4. Report to human: "Completed #N. Unblocked: #M, #P. New items: #Q."
```

### On task blocked
```
1. Change status to ⏸️ blocked
2. Note the blocker (dependency? design question? human decision needed?)
3. Add to design-questions.md if it's a design question
4. Report to human: "Blocked on #N because [reason]. Question added to design-questions.md."
```

### Picking next task
After completing a task:
```
1. Check backlog for highest-priority 📋 planned item that has no unresolved dependencies
2. Propose to human: "Next up: #N [title]. Shall I start?"
3. If human says yes → start the development workflow
4. If human says something else → follow their direction
```

## implementation-status.md update

After completing a slice or significant feature:

```markdown
## Slice H — Data model v2 (complete)

### What was built
- Migration 003: portfolio_projects junction table
- Updated Zod schemas for new many-to-many relationship
- ... (list key changes)

### Test coverage
- 5 new integration tests
- 2 migration tests
- All 108 existing tests still passing

### What's left
- (anything deferred to next slice)
```

## current-capabilities.md update

Move items between sections:

```markdown
### 動作する機能
| API | 説明 |
|-----|------|
| `POST /api/portfolios` | Portfolio 作成 (name UNIQUE) |  ← ADD THIS

### 未実装の機能
~~Portfolio/Project CRUD~~ → 動作する機能 に移動済み  ← MARK AS MOVED
```
