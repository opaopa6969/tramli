# DGE Method — Design-Gap Exploration / Dialogue-driven Gap Extraction

## Origin of the Name

DGE carries two meanings simultaneously:

```
Design-Gap Exploration        — Explore gaps in your design (purpose)
Dialogue-driven Gap Extraction — Extract gaps through dialogue (method)
```

Both are correct. Find design gaps through dialogue.

## Prerequisites

- **Required**: Access to an LLM (Claude, GPT-4, Gemini, etc.)
- **Recommended**: Claude Code (auto-triggers via skills/)
- **Input**: A design document to review (API spec, feature plan, etc.)
- **Time**: 30-60 minutes per session (dialogue generation + human review)
- **Prior knowledge**: Basic understanding of the target domain (no DGE expertise needed)

---

## Read This First (3-Minute Version)

> **TL;DR** — Read below to get started with DGE. Details in subsequent sections.

**What is DGE?** A method that discovers "what's NOT written" in your design through character-driven dialogue.

**3 Steps**:
1. **Generate** — Pick a theme and characters, generate a dialogue
2. **Extract** — Pull out "undefined", "contradictory", and "overlooked" items as Gaps
3. **Specify** — Convert each Gap into Use Cases / APIs / Data Models

**The Columbo Method — 5 Types of Questions** (the most powerful weapon for digging out Gaps):
- Type 1: "First of all..." — Verify whether assumptions are actually correct
- Type 2: "In short..." — Force the essence into a single sentence
- Type 3: "Is that all?" — Surface overlooked alternatives
- Type 4: "Who gets hurt?" — Name specific people affected
- Type 5: "Didn't this happen before?" — Recall past failure patterns

**Getting Started**:
1. Prepare a design document (API spec, feature plan, etc.)
2. Feed the Quick Start prompt below to any LLM
3. **Have a human review the output** (this is the most important step — dialogue without review is incomplete)

---

## Principle

Spec reviews verify "what's written."
DGE discovers "what's NOT written."

By simulating real usage scenarios through characters,
unstated assumptions, implicit constraints, and overlooked considerations surface.

## DGE's 3 Steps

```
Step 1: Write a dialogue (Generate)
  Choose a theme and characters,
  generate a dialogue where those characters argue.

Step 2: Extract Gaps (Extract)
  Pull out "undefined", "contradictory", and "overlooked"
  items from the dialogue as Gaps.

Step 3: Turn into Spec (Specify)
  Convert each Gap into Use Cases, APIs, Data Models.
```

## How to Write Dialogues

### Format

```
Narrator: Explains technical background neutrally.
  Provides context for characters to enter the discussion.

Character A: "Dialogue"
  → Gap found: XX is undefined

Character B: "Dialogue"
  → Gap found: YY and ZZ contradict each other

Character C: "Dialogue"
  → Spec implication: XX API is needed
```

### Role: Narrator

An additional role discovered during DGE sessions.

```
The Narrator tells the technical background as a neutral narrator.
Not a character but a "scene-setter."

Example:
  Narrator: "We need to merge the delta between the production
        grammar and the complete grammar. The complete grammar
        has BooleanExpression in 3 layers. The production
        BooleanExpression is a flat Choice, so we need to
        replace it."

  → With this context, characters can jump into discussion:
    "Is that layering even necessary?" (Columbo)
    "The 3 layers are the correct design." (Picard)

Without the Narrator:
  Characters must explain background themselves.
  This doesn't fit their personality.
  Columbo explaining technical background is unnatural.

With the Narrator:
  Background → Discussion separation is clear.
  Characters can focus on their role.
```

### Rules

1. **Don't give answers** — Characters only raise problems. Solutions are for humans.
2. **Let everyone speak** — A dialogue where only one character talks isn't DGE.
3. **Welcome contradictions** — Contradictions between characters are the most valuable Gaps.
4. **Describe concrete scenarios** — Not abstract discussion, but "when a user does XX."
5. **Mark Gaps immediately** — Insert `→ Gap found:` within the flow of conversation.
6. **Narrator sets context** — Technical background is told by the Narrator; characters focus on discussion.

### Scene Structure

```
Scene 1: Happy Path
  Narrator explains background → Characters discuss → Gaps found

Scene 2: Edge Cases
  Narrator explains boundaries → Characters attack → Gaps found

Scene 3: Operations / Performance
  Narrator explains constraints → Characters discuss trade-offs → Gaps found

Scene 4: Security / Risk
  Narrator explains threat model → Red Team + House attack → Gaps found
```

## Observe → Suggest → Act Pattern

Every Gap has this structure:

```
Observe: "XX is not defined" (current problem)
Suggest: "YY should be added" (proposal)
Act:     UC-XX, API endpoint, Data Model (concrete spec)
```

## Gap Categories (6 Categories)

Categories established in DGE:

| Category | Description | Example |
|----------|-------------|---------|
| Missing logic | Implementation is lacking | Function not implemented |
| Spec-impl mismatch | Spec and implementation diverge | Parser passes but evaluator fails |
| Type/coercion gap | Type conversion oversight | toNum("3.14") returns String |
| Error quality | Unhelpful error messages | Just "parse failed" |
| Integration gap | Inconsistency at integration points | LSP doesn't provide completions |
| Test coverage | Missing tests | No tests for variadic functions |

Additional categories:

| Category | Description | Example |
|----------|-------------|---------|
| Business gap | Business model hole | No success metrics defined |
| Safety gap | Safety deficiency | Addiction risk from auto-answer |
| Ops gap | Operations gap | Zero runbooks |
| Message gap | Communication problem | Not speaking the user's language |
| Legal gap | Legal risk | No terms of service |

## Turning Gaps into Specs

### Use Case

```
UC-XXX-01: [Title]
  Trigger: [What triggers this]
  Input:   [What is input]
  Output:  [What is output]
  API:     [Corresponding API endpoint]
```

### API Endpoint

```
METHOD /api/path
  Body:     { field: type }
  Response: { field: type }
```

### Data Model

```sql
CREATE TABLE ... / ALTER TABLE ...
```

## The Columbo Method — 5 Types of Questions

DGE's most powerful weapon:

```
Type 1: "First of all..." — Verify assumptions
Type 2: "In short..." — Extract the essence
Type 3: "Is that all?" — Expand alternatives
Type 4: "Who gets hurt?" — Make impact concrete
Type 5: "Didn't this happen before?" — Reference the past
```

## Review Flow

```
1. Write dialogue (10-30 min)
2. Human reviews (5-10 min) ← THIS IS THE ESSENCE
3. Incorporate additional insights from review
4. Turn into Spec
```

The dialogue → review loop is DGE's core.
Dialogue without review is incomplete.

## DGE and Plain LLM: Complementary Relationship

DGE and plain LLM review are complementary. Neither alone is sufficient.

```
DGE strengths (decisions):
  - Architecture decisions (build/don't build, simplification)
  - Questioning assumptions ("Why JWT?" "Do we need Keycloak?")
  - Responsibility splitting (DELEGATE / HYBRID / BUILD)
  - Phase design (what first, what later)

Plain LLM strengths (details):
  - Security oversights (CSRF, XSS, privilege escalation)
  - Concrete values (rate limits, token expiration)
  - Complete DB schema SQL definitions
  - Code-level implementation examples
  - Exhaustive environment variable lists

When they disagree:
  Strategic decisions → prefer DGE
  Concrete values / oversights → prefer LLM
  Both contradict → human decides
```

DGE toolkit's auto_merge feature automates this complementary relationship.
It runs DGE and plain LLM review in parallel, then merges results for display.

## Quick Start (Works with Any LLM)

### Method A: Universal Prompt (ChatGPT / Gemini / Claude / etc.)

Copy the following prompt and paste it into any LLM.
Replace `{paste here}` with your design document.

```
You are a DGE (Design-Gap Exploration) facilitator.
Generate a dialogue where 3 characters argue about the following design document.

[Characters]
- Narrator: Explains technical background neutrally
- Columbo: Challenges assumptions with "first of all..." and "in short...". Cuts to the root without hesitation
- Picard: Guardian of quality and user experience. Accepts no compromise

[Rules]
1. Narrator explains background before discussion begins
2. Characters must disagree (unanimous agreement is forbidden)
3. When "undefined", "contradictory", or "overlooked" items are found, immediately mark with → Gap found:
4. Discuss in concrete scenarios ("when a user does XX"). No abstractions allowed
5. End with a list of all Gaps in Observe (current problem) / Suggest (proposal) / Act (concrete spec) format

[Scene Structure]
- Scene 1: Happy Path
- Scene 2: Edge Cases
- Scene 3: Operations / Security

[Target Document]
{paste your design document here}
```

### Method B: Claude Code (skill auto-trigger)

```bash
# 1. Copy skills to your project
cp dge/skills/*.md /path/to/your-project/.claude/skills/

# 2. Just tell Claude Code
Human: "Run DGE on the auth API design"
```

Claude Code reads skills/, then automatically runs: template selection → character selection → dialogue generation → Gap extraction.

### Expected Output

A successful session outputs in this format:

```
## Dialogue

Narrator: "The XX API assumes users will do YY."

Columbo: "First of all, is the user authenticated before doing YY?"
  → Gap found: Access control for unauthenticated users is undefined

Picard: "Before authentication, the error message showing just '401'
        is an insult to the user."
  → Gap found: Human-readable error response messages not designed

...

## Gap List

| # | Gap | Category | Severity |
|---|-----|----------|----------|
| 1 | Access control for unauthenticated users is undefined | Missing logic | High |
| 2 | Human-readable error response messages not designed | Error quality | Medium |
| ... | ... | ... | ... |

## Gap Details

### Gap-1: Access control for unauthenticated users is undefined
- Observe: No authentication check described in XX API
- Suggest: Add auth middleware, define response for unauthenticated requests
- Act: Define auth flow as UC-AUTH-01. Specify 401/403 response formats
```

**Success criteria**: 3+ Gaps found, and at least one makes you think "I didn't consider that." If all Gaps are obvious, add characters or scenes and re-run.

---

## DGE's Scope of Application

```
Any design document:
  API design, product design, business strategy, hiring, investment decisions
  → All design gaps

Common principle:
  "Discover gaps through character-driven dialogue"
  Topic-agnostic. Change the angle by changing the character mix.
```
