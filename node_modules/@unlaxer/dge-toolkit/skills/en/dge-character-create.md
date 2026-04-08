<!-- DGE-toolkit (MIT License) -->

# Skill: DGE Custom Character Creation

## Trigger
When the user says any of the following:
- "add a character"
- "add [character name]" (e.g., "add Batman")
- "create an original character"
- "make a DGE character"

## Mode Detection
- Character name + source included → **named mode**
- Not included or "original" → **wizard mode**

---

## Named Mode

### Step 1: Character Analysis
LLM analyzes based on the character name and source the user specified:

1. **Axes vector** estimation (0.0-1.0):
   - decision_speed, risk_tolerance, delegation_level, quality_obsession, simplicity_preference
   - communication (enum), conflict_resolution (enum)

2. **Prompt Core** generation (3-5 lines of LLM instructions)

3. **Personality** extraction:
   - Values (2-3 items)
   - Catchphrases / quotes (3-5)
   - Communication style (3-4 lines)
   - Decision criteria (2-3 items)

4. **Backstory** extraction:
   - Background (2-3 lines)
   - Growth arc (1 line: A → B → C)
   - Trauma (1-3 items, each 1 line with "→ how it affects DGE")
   - DGE effectiveness (what scenarios they excel in)

5. **Weakness** (2-4 items)

6. **Similarity comparison** with existing characters (1-2 most similar + differences)

### Step 2: Show confirmation screen

```
[icon] [name] ([source])
Archetype: [archetype]

axes:
  decision_speed: X.XX   [explanation]
  risk_tolerance: X.XX   [explanation]
  ...

Quotes:
  - "..."
  - "..."

Warning: Similar to [existing character name] on axis
  Difference: [1 line explaining difference]

Is this character OK?
1. OK → Save
2. Adjust (natural language: "make them more cautious" etc.)
3. Direct values (advanced: change axes directly)
4. Start over
```

**MUST: Never save without confirmation. Always get user's OK.**

### Step 3: Adjust (if option 2 or 3)

**Natural language**: "make them more cautious" → LLM recalculates axes and re-displays
**Direct values**: User specifies `decision_speed: 0.60` → Apply and re-display

After adjustment, show confirmation screen again. Loop until OK.

### Step 4: Save

Save to `dge/custom/characters/{name}.md`:

```markdown
---
name: [name]
source: [source (author)]
archetype: [archetype_id]
icon: [emoji]
created: YYYY-MM-DD
axes:
  decision_speed: X.XX
  risk_tolerance: X.XX
  delegation_level: X.XX
  quality_obsession: X.XX
  simplicity_preference: X.XX
  communication: [enum]
  conflict_resolution: [enum]
---

# [icon] [name] ([source])

## Prompt Core
[3-5 lines]

## Personality
### Values
- ...
### Catchphrases / Quotes
- "..."
### Communication Style
...
### Decision Criteria
- ...

## Backstory
### Background
...
### Growth Arc
[A → B → C]
### Trauma
- [trauma] (→ [DGE effect])
### DGE Effectiveness
...

## Weakness
- ...

## Similar Characters
- [character name] — similar: ... / different: ...
```

After saving: "[icon] [name] saved. It will appear in character selection for your next DGE session."

---

## Wizard Mode

### Step 1: Basic Questions (MUST: at least 3)

```
Let's create an original character. I'll ask a few questions.

1. What's the character's name?
2. What scenarios will they shine in? (e.g., code review, strategy meetings, user interviews)
3. Their core personality in one word? (e.g., cautious, passionate, sarcastic, optimistic)
```

### Step 2: Additional Questions (optional)

After basic questions:
```
Want to go deeper?
1. Yes, ask more → additional questions
2. That's enough → generate
```

Additional question pool (ask 1-2 at a time until user says "enough"):
- Fast decisions or cautious?
- Risk-taker or safety-first?
- Delegate or do it yourself?
- Any catchphrases or signature lines?
- What happens when they get angry?
- How do they give praise?
- Loner or center of the team?
- Technical obsessions?
- Weaknesses or blind spots?
- Any similar famous characters? (optional)

### Step 3: Generate → Confirm → Save

Same as Named Mode Steps 2-4. Confirmation screen → Adjust → OK → Save.

---

## Custom Character Management

### List
"Show character list" → Display built-in characters + custom characters

### Delete
"Delete [character name]" → Confirm → Delete `dge/custom/characters/{name}.md`

### Edit
"Edit [character name]" → Show current content → Adjust via natural language → Re-save

---

## Loading Rules (integration with dge-session.md)

In dge-session.md Step 1:
1. Read `dge/characters/catalog.md` (built-in)
2. If `dge/custom/characters/*.md` exists, read Prompt Core section only from each file

In Step 4 character selection:
```
--- built-in ---
👤 Columbo  🎩 Picard  ☕ Holmes  😰 Charlie Brown  👑 Steve Jobs  ...
--- custom ---
⚔ Batman  🔧 Senior Dev

Recommended: Columbo + Picard + Batman
Change?
```

Read selected characters' Personality section.
Only read Backstory if user says "make it a deep discussion."
