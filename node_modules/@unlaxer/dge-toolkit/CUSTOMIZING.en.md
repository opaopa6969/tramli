# DGE toolkit Customization Guide

## Customization Strategy

```
A. Use as-is (the majority)
   → npm install + YAML / file additions are sufficient

B. Full customization (for power users)
   → git fork + follow this guide to make changes
```

"Fork only if A is not enough." No coexistence mechanism is provided. Once forked, do not use `npx dge-update`; manage differences with `git fetch upstream`.

---

## Level 1: Configuration Changes (no fork required)

### Adding Flows
Add YAML files to `dge/flows/`. Use `flows/design-review.yaml` as a reference for the structure.

```yaml
name: my-flow
display_name: "📖 My Flow"
extract:
  type: custom
  marker: "→ Found:"
  # ...
generate:
  types:
    - id: SCENE
      display_name: "📖 Scene"
  output_dir: dge/output/
post_actions:
  - id: again
    display_name: "One more time"
  - id: generate
    display_name: "Generate"
  - id: later
    display_name: "Later"
```

### Adding Characters
Say "Add a character" for interactive creation. Or manually create a file in `dge/custom/characters/`.

### Adding Templates
Add markdown files to `dge/templates/`. Use existing templates as a reference.

### Patterns
Add custom presets to `dge/patterns.md`.

---

## Level 2: Rewriting Skills (fork recommended)

Git fork first, then edit the files in `.claude/skills/`.

### dge-session.md

| Section | Line | What to Change |
|---------|------|----------------|
| MUST rules | Line 19~ | Change enforced behaviors |
| SHOULD rules | Line 31~ | Change recommendations |
| Decision rules | Line 44~ | Change auto-decide conditions |
| Step 3.5 | Pattern selection | Change preset list |
| Step 4 | Character recommendation | Change recommendation logic |
| Step 5 | Dialogue generation | Remove or change senior narrator narration |
| Step 6 | Extraction | Change marker text (also possible via flows/ YAML) |
| Step 8 | Choices | Change choice structure (also possible via flows/ YAML) |
| Step 10 | Spec generation | Change artifact templates (also possible via flows/ YAML) |

### dge-character-create.md

| Section | What to Change |
|---------|----------------|
| Wizard questions | Change question content and order |
| Axes definition | Add new axes (e.g., creativity, empathy) |
| Save format | Change backstory section structure |

See the Hook point list in [INTERNALS.md](./INTERNALS.md) for details.

---

## Level 3: Server Changes (fork recommended)

| File | What to Change |
|------|----------------|
| server/src/recommend.ts | Recommendation algorithm (keyword map, coverage vector) |
| server/src/index.ts | Add or change API endpoints |
| server/migrations/ | Change DB schema |

---

## Fork Best Practices

```bash
# 1. Fork
git clone https://github.com/YOUR/DGE-toolkit.git
cd DGE-toolkit

# 2. Add upstream
git remote add upstream https://github.com/xxx/DGE-toolkit.git

# 3. Periodically check upstream
git fetch upstream
git log upstream/main --oneline -10

# 4. Cherry-pick only the changes you need
git cherry-pick <commit-hash>

# 5. Publish as your own package (optional)
cd kit
# Change the name in package.json: "@your-org/dge-toolkit-custom"
npm publish --access public
```

---

## Related Documents

- [INTERNALS.md](./INTERNALS.md) — Flow diagrams, data flow diagrams, state diagrams, hook list
- [flows/design-review.yaml](./flows/design-review.yaml) — Default flow definition
- [integration-guide.md](./integration-guide.md) — Integration with existing workflows
