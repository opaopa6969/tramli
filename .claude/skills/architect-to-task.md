# Skill: architect-to-task

## Purpose
Convert an architect agent's design discussion into a concrete task with spec attached.

## When to use
- After architect + operator finish designing a feature
- Operator says "じゃあこれで実装して"
- Design discussion reaches consensus

## Procedure

1. **Extract spec from conversation**:
   - API endpoints (method, path, request/response)
   - DB schema changes
   - Business logic rules
   - Edge cases discussed
   - Decisions made (and rejected alternatives)

2. **Create task with spec**:
   ```
   POST /api/tasks {
     project_id: "{project}",
     title: "{feature name}",
     spec_markdown: "{extracted spec}",
     priority: "high",
     spec_source: "conversation",
     on_complete_action: '{"type":"create_review_task"}' (if design-heavy)
   }
   ```

3. **Set on_complete_action** for review if warranted:
   - Design decisions involved → review required
   - Simple implementation → review optional

## Spec template

```markdown
# {Feature Name} — Implementation Spec

## Designed by
architect agent + operator, {date}

## API Endpoints
{from architect's design}

## DB Schema Changes
{if any: ALTER TABLE ... or CREATE TABLE ...}

## Business Logic
{rules and edge cases}

## Decisions Made
- {decision 1}: {rationale}
- {decision 2}: {rationale}

## Rejected Alternatives
- {alternative}: {why rejected}

## Acceptance Criteria
- [ ] {criteria from design}
```
