# DGE Internals — Internal Structure

Internal structure of the DGE toolkit. Use as a reference when customizing.

## Flow Diagrams

### Overall Flow (flow + structure detection → branching)

```mermaid
flowchart TD
    Start(["Run DGE"]) --> S0{"Step 0: flow + structure detection"}

    S0 -->|"Run DGE / Sounding Board"| Quick["⚡ quick"]
    S0 -->|"In Detail / Spec / Design Review"| Full["🔍 design-review"]
    S0 -->|"Brainstorm / Ideas"| Brain["💡 brainstorm"]

    S0 -->|Structure keyword detected| Struct{"Structure auto-selection"}
    Struct -->|"Peer review / Review"| Tribunal["⚖ tribunal"]
    Struct -->|"Attack / Security"| Wargame["⚔ wargame"]
    Struct -->|"Pitch / Investment"| Pitch["💰 pitch"]
    Struct -->|"Diagnosis / Expert"| Consult["🏥 consult"]
    Struct -->|"Incident / Retrospective"| Invest["🔥 investigation"]
    Struct -->|No match| Quick

    subgraph "Phase 0 (common to all structures)"
        P0["Project context auto-collection\nREADME / docs / tree / deps / git log"]
    end

    subgraph "Roundtable type (roundtable)"
        Q1["Kit Loading"] --> Q2["Theme Confirmation"]
        Q2 --> Q4["Character Selection (axis-based)"]
        Q4 --> Q5["Dialogue Generation\nwith response obligation"]
        Q5 --> Q7["Save + Gap List + Options"]
    end

    subgraph "Multi-phase type (tribunal / wargame / pitch / consult / investigation)"
        M1["Kit Loading"] --> M2["Theme Confirmation + Evaluator/Division Selection ⏸"]
        M2 --> MP1["Phase 1: Independent Evaluation (non-dialogue)\nFormat enforced"]
        MP1 --> MP2["Phase 2: Adversarial Dialogue\nwith response obligation"]
        MP2 --> MP3["Phase 3: Synthesis\nGap List"]
        MP3 --> M7["Save + Options"]
    end

    Quick & Full & Brain --> P0
    Tribunal & Wargame & Pitch & Consult & Invest --> P0
    P0 --> Q1
    P0 --> M1
```

### Branching After Options

```mermaid
flowchart TD
    S8["Summary + Options ⏸"] --> C1{"User Selection"}

    C1 -->|"1. Run DGE"| S9B["Previous Context\n+ TreeView"]
    C1 -->|"2. Auto-iterate"| S9A["Auto-iteration Mode\n(max 5 rounds)"]
    C1 -->|"3. Implement"| S10["Cumulative Spec Generation"]
    C1 -->|"4. Raw LLM Merge"| S9C["subagent\nRaw Review → Merge"]
    C1 -->|"5. Later"| End([End])

    S9B -->|Theme Selection| S2([Go to Step 2])
    S9A -->|Not Converged| S5([Go to Step 5])
    S9A -->|Converged| S10
    S9C --> Merge["Merge Result Display ⏸"]
    Merge -->|Implement| S10
    Merge -->|Later| End

    S10 --> Review{"Spec Review ⏸"}
    Review -->|OK| Impl([Start Implementation])
    Review -->|Revise| S10
    Review -->|Later| End
```

⏸ = Points where the system waits for user response

## dge-tool Mode

```mermaid
flowchart LR
    S1["Step 1:\ndge-tool version"] -->|Success| TM["🔧 Tool mode"]
    S1 -->|Failure| SM["📝 Skill mode"]

    TM --> S7T["Step 7: dge-tool save"]
    TM --> S8T["Step 8: dge-tool prompt"]

    SM --> S7S["Step 7: Write tool"]
    SM --> S8S["Step 8: Built-in options"]

    S7T -->|Failure| S7S
    S8T -->|Failure| S8S
```

## Data Flow Diagram

```mermaid
flowchart LR
    subgraph Input["Loading (Step 1)"]
        M[method.md]
        C[characters/catalog.md]
        CC[custom/characters/*.md]
        P[patterns.md]
        F[flows/*.yaml]
        PJ[projects/*.md]
        DT[dge-tool Detection]
    end

    subgraph Engine["DGE Engine"]
        S0["Step 0: Flow Detection"]
        S5["Step 5: Dialogue Generation\n(flow.extract.marker)"]
        S10["Step 10: Spec Generation\n(flow.generate.types)"]
        S9C["Step 9C: subagent\nRaw LLM Merge"]
    end

    subgraph Output["Output"]
        SE[sessions/*.md]
        SP[specs/*.md]
        MR[sessions/*-merged.md]
        PR[projects/*.md Update]
    end

    M & C & CC & P --> S5
    F --> S0
    S0 --> S5
    PJ --> S5
    DT --> S5
    S5 --> SE
    S5 --> S10
    S5 --> S9C
    S10 --> SP
    S9C --> MR
    SE & SP & MR --> PR
```

## State Diagram

```mermaid
stateDiagram-v2
    state "Flow Lifecycle" as FL {
        [*] --> quick: Default
        quick --> design_review: "Go into detail"
        quick --> brainstorm: "Brainstorm"
        design_review --> quick: "Back to simple"
        quick --> tribunal: "Peer review"
        quick --> wargame: "Attack"
        quick --> pitch: "Pitch"
        quick --> consult: "Diagnose"
        quick --> investigation: "Retrospective"
        tribunal --> quick: "Switch to roundtable"
        wargame --> quick: "Switch to roundtable"
        pitch --> quick: "Switch to roundtable"
        consult --> quick: "Switch to roundtable"
        investigation --> quick: "Switch to roundtable"
    }

    state "Project" as Project {
        [*] --> not_started
        not_started --> explored: DGE session executed
        explored --> spec_ready: Spec generated
        spec_ready --> implemented: Implementation complete
    }

    state "Spec" as Spec {
        [*] --> draft: Auto-generated
        draft --> reviewed: Review OK
        reviewed --> migrated: Transferred to official document
    }

    state "Auto-iteration" as AutoIter {
        [*] --> iterating: Start
        iterating --> iterating: New C/H Gap exists
        iterating --> converged: New C/H Gap = 0
        iterating --> stopped: Limit reached (5 rounds)
        stopped --> iterating: "+3 more rounds"
        converged --> [*]: Proceed to Spec generation
    }
```

## flow + structure Comparison

### flow (mode)

| | ⚡ quick | 🔍 design-review | 💡 brainstorm |
|---|---------|------------------|---------------|
| Steps | 5 | 10 | 6 |
| Shared MUSTs | 3 | 3 | 3 |
| Flow-specific MUSTs | 0 | 4 | 1 |
| Template | Skipped | Selection | Skipped |
| Pattern | Auto | Selection | Auto |
| Character Confirmation | Display only | Wait for confirmation | Wait for confirmation |
| Extraction | Gap | Gap | Idea |
| Spec Generation | None | Yes | None |
| Speech Style | Standard | Standard | Yes-and |

### structure

| | 🗣 roundtable | ⚖ tribunal | ⚔ wargame | 💰 pitch | 🏥 consult | 🔥 investigation |
|---|--------------|-----------|----------|---------|-----------|----------------|
| Phases | 1 | 3 | 3 | 3 | 3 | 3 |
| Phase 0 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Independent Eval | None | 3 Reviewers | Red Team | Entrepreneur Pitch | Each Specialty | Each Division Testimony |
| Response Obligation | Between characters | Rebuttal required | Defense required | All questions answered | Conference synthesis | Five Whys |
| Format | Free | S/S/W/Q/V | Attack Plan | P/S/M/T/A | Findings/Risk/Recommendation | Timeline+Testimony |
| Best Theme | General | Papers/Design | Security | Business Decisions | Multi-domain Design | Incident Analysis |

## Hook Points List

| Step | Name | Hook | Level | dge-tool |
|------|------|------|-------|----------|
| 0 | Flow Detection | trigger_keywords | 1 (YAML) | — |
| 1 | Kit Loading | File list to load | 2 | version detection |
| 2 | Theme Confirmation | Deep-dive logic | 2 | — |
| 3 | Template Selection | Add templates | 1 (templates/) | — |
| 3.5 | Pattern Selection | Add presets | 1 (patterns.md) | — |
| 4 | Character Selection | Add/recommend characters | 1 (custom/) / 2 | — |
| 5 | Dialogue Generation | Narration / Scene | 2 | — |
| 6 | Extraction | Markers / Categories | 1 (YAML extract) | — |
| 7 | Save | Save destination / filename | 1 (YAML output_dir) | **save** |
| 8 | Options | Options configuration | 1 (YAML post_actions) | **prompt** |
| 9A | Auto-iteration | Convergence check / limit | 2 | — |
| 9B | Context | TreeView / theme | 2 | — |
| 9C | LLM Merge | subagent execution | 2 | — |
| 10 | Spec Generation | Artifact types | 1 (YAML generate) | — |

## File Map

| File | Role | Read by | Written by |
|---------|------|---------|---------|
| method.md | Method body | Step 1 | toolkit-provided |
| characters/catalog.md | 19 built-in characters | Step 1, 4 | toolkit-provided |
| custom/characters/*.md | Custom characters | Step 1, 4 | dge-character-create |
| patterns.md | 20 patterns + 9 presets | Step 1, 3.5 | toolkit-provided |
| dialogue-techniques.md | 8 dialogue techniques | Step 5 | toolkit-provided |
| flows/*.yaml | Flow definitions | Step 0, 6, 7, 8, 10 | toolkit-provided or user |
| sessions/*.md | DGE session output | Step 9B, 10 | Step 7 (auto) |
| specs/*.md | Spec files | At implementation | Step 10 (auto) |
| projects/*.md | Project management | Step 9B | Step 7 (auto-update) |
| bin/dge-tool.js | MUST enforcement CLI | Step 1, 7, 8 | toolkit-provided |
| AGENTS.md | Codex/general DGE instructions | Codex, Cursor | install.sh |
| GEMINI.md | Gemini CLI DGE instructions | Gemini CLI | install.sh |
| .cursorrules | Cursor DGE instructions | Cursor | install.sh |
| agents-dge-section.md | DGE instruction template (ja) | install.sh | toolkit-provided |
| agents-dge-section.en.md | DGE instruction template (en) | install.sh | toolkit-provided |
