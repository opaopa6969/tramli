# Skill: spec-update

## When to use
Before writing any implementation code, when the task involves schema changes, new APIs, or new events.

## Procedure

### data-model.md update
```
1. Find the relevant table section
2. Add/modify columns with type, nullable, default, description
3. If new table: add full CREATE TABLE with all columns, PKs, FKs
4. If migration needed: note "Requires migration NNN"
5. Format: match existing table documentation style in the file
```

### api-surface.md update
```
1. Find the relevant API section (or create new section)
2. Document: METHOD /path
3. Request body (with types)
4. Response body (with types and status codes)
5. Error cases (400, 404, 409, etc.)
6. Format: match existing endpoint documentation style
```

### event-model.md update
```
1. Find the relevant event family (or create new family)
2. Document: event_type (e.g., portfolio.created)
3. Payload fields with types
4. When it's emitted
5. Format: match existing event documentation style
```

### domain-model.md update (requires human approval)
```
1. Find the entity section
2. Update fields, relationships, invariants
3. STOP: ask human to approve before proceeding
```

## Checklist
- [ ] Schema change → data-model.md updated
- [ ] New endpoint → api-surface.md updated
- [ ] New event → event-model.md updated
- [ ] Entity change → domain-model.md updated (with human approval)
- [ ] All updates done BEFORE writing implementation code
