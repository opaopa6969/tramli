# Skill: release

## When to use
After completing a feature or set of fixes that should be versioned.

## Versioning (semver)
- **patch** (0.0.X): bug fix, refactor, docs, no API change
- **minor** (0.X.0): new feature, new endpoint, backward-compatible
- **major** (X.0.0): breaking API change, schema migration required (ask human first)

## Procedure

### 1. Version bump
```bash
npm version patch|minor|major --no-git-tag-version
# This updates package.json only. We commit manually.
```

### 2. CHANGELOG.md
Prepend a new entry at the top (below the header):

```markdown
## [X.Y.Z] - YYYY-MM-DD

### Added
- New feature or capability

### Changed  
- Modified behavior (non-breaking)

### Fixed
- Bug fix description

### Migration
- Required migration steps (if any)

### Breaking
- Breaking changes (major version only)
```

Rules:
- Write from the user's perspective, not implementation details
- Reference backlog items: "Portfolio/Project CRUD API (backlog #1)"
- One line per change, start with verb (Add, Fix, Change, Remove)

### 3. Release notes (minor/major only)
Create `docs/release-notes/vX.Y.md`:

```markdown
# Release vX.Y — [title]

## Summary
2-3 sentence overview of what changed.

## New features
- Feature with brief explanation

## Migration guide
Steps to upgrade from previous version.

## Known issues
Any known limitations.
```

### 4. Git tag
```bash
git tag -a vX.Y.Z -m "Release vX.Y.Z: brief one-line summary"
```

### 5. PR template (for pr-review profile)
```markdown
## Release vX.Y.Z

### Changes
- [list from CHANGELOG]

### Checklist
- [ ] All tests pass
- [ ] CHANGELOG.md updated
- [ ] Release notes created (minor/major)
- [ ] Version in package.json updated
- [ ] Spec docs are up to date
```

## Checklist
- [ ] Version bumped in package.json
- [ ] CHANGELOG.md entry written
- [ ] Release notes created (if minor/major)
- [ ] All changes committed
- [ ] Git tag created
- [ ] Pushed (tag + commits)
