<!-- DGE-toolkit (MIT License) — https://github.com/xxx/DGE-toolkit -->

# Skill: DGE Toolkit Update

## Trigger
When the user says any of the following:
- "update DGE"
- "dge update"

## Steps

### Step 1: Check current version
Read `dge/version.txt` and display local version.
If file doesn't exist, display "No version info (pre-v1.0.0 install)."

### Step 2: Find update source
Check in priority order:
1. `node_modules/@unlaxer/dge-toolkit/version.txt` — if npm installed
2. Ask user for source path — if not using npm

For npm, compare `node_modules/@unlaxer/dge-toolkit/version.txt` with `dge/version.txt` and display:
```
Current: v1.0.0
Available: v1.2.0
```

### Step 3: Explain what will be updated
Display and ask user for confirmation:

```
The following toolkit files will be overwritten:
- dge/method.md
- dge/characters/*.md
- dge/templates/*.md
- dge/flows/*.yaml
- dge/patterns.md
- dge/integration-guide.md
- dge/INTERNALS.md
- dge/CUSTOMIZING.md
- dge/dialogue-techniques.md
- dge/bin/*
- dge/README.md, LICENSE, version.txt
- .claude/skills/dge-session.md
- .claude/skills/dge-update.md
- .claude/skills/dge-character-create.md

The following will NOT be touched:
- dge/sessions/ (your DGE session outputs)
- dge/custom/ (your custom files)

Proceed with update?
```

**Wait for user confirmation.**

### Step 4: Run update
If user approves:

npm:
```bash
npx dge-update
```

Manual:
Guide user through manual copy of toolkit files only.

### Step 5: Report result
```
DGE toolkit updated to v[new version].
sessions/ and custom/ were not modified.
```

## MUST Rules
1. **Always get user confirmation before updating.** Never overwrite silently.
2. **Never touch sessions/ or custom/.**
3. **If update source not found, guide user through npm update steps.**

## Notes
- This skill is independent of DGE sessions. Don't suggest updates during a session.
- For users not using npm, guide through manual copy steps.
