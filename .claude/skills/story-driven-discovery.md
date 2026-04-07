# Skill: story-driven-discovery

## Purpose

Discover use cases, spec gaps, and UX issues through operator role-play sessions.
The operator plays themselves using the product. The agent plays the system/assistant.
Through conversation, real-world scenarios surface requirements that top-down spec writing misses.

## When to use

- New feature area with unclear UX
- Spec feels complete but hasn't been tested against real scenarios
- After long absence from a project (what would re-onboarding look like?)
- When operator says "ストーリーで考えよう", "walk me through", "use case を洗い出して"

## Procedure

### 1. Set the scene
Ask the operator for a scenario:
```
What scenario should we explore?
Examples:
- First-time setup (空のプロジェクトから始める)
- Return after absence (1週間ぶりに戻ってきた)
- New feature request (ユーザーが新機能を要求)
- Failure recovery (サービスが落ちた)
- Onboarding a new team member
```

### 2. Role-play the conversation
The operator describes what they would do/say. You respond as the system would.
Key: be **honest about what the system can't do yet**. Gaps are discoveries.

### 3. Capture discoveries as you go

For each discovery, categorize:

| Category | Format |
|----------|--------|
| **Use Case** | `UC-SHORT-NAME: one-line description` |
| **Spec Implication** | What needs to change in which spec doc |
| **Data Model Change** | New table, column, or relationship |
| **UX Insight** | How the user expects something to work |
| **Architecture Impact** | Structural change needed |

### 4. Summarize at checkpoints

After every 3-5 exchanges, pause and summarize:
```
## Discoveries so far
### Use Cases (N new)
- UC-XXX: ...
### Spec Implications
- ...
### Data Model Changes
- ...
```

### 5. Produce output document

At the end of the session, produce a structured markdown file:

```markdown
# Story: [Title] — [Subtitle]

## Scenario
[Setup context]

## Story
[Full conversation with discoveries inline]

## Discovered Use Cases
- UC-XXX: description

## Spec Implications
1. [Implication with affected doc reference]

## Data Model Changes
[Table/column changes needed]

## Architecture Impact
[Structural changes needed]

## Next Steps
[Prioritized action items]
```

Save to `stories/` or `.claude/stories/` directory.

### 6. Feed back into specs

After the story session:
1. Create/update design-questions.md with open questions
2. Create/update backlog.md with new work items
3. If data model changes: note them for future migration
4. If UX insights: note them for UI design

## Tips

- **Don't script the conversation** — let it flow naturally
- **Follow the operator's mental model** — even if it differs from current architecture
- **Name every discovery** — UC-SHORT-NAME makes them referenceable
- **Ask "what would you do next?"** — surfaces sequential use cases
- **Ask "what if X goes wrong?"** — surfaces failure/edge cases
- **The best discoveries come from gaps** — when the system can't do what the operator expects

## Example trigger phrases

- "このプロジェクトを初めて使う人になったつもりで"
- "10日間不在だった状態から戻ってきたら"
- "新しいサービスを追加したいんだけど"
- "障害が起きた時の対応フロー"
