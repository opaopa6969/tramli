# DGE Template: Feature Planning

## Overview
Find requirement gaps before implementing a new feature.

## Recommended Characters
Columbo (assumption check) + Holmes (simplification) + Charlie Brown (scope reduction)

## Scene Structure

### Scene 1: User Story
```
focus: Who, why, what
Columbo: "First of all, who asked for this feature?"
Holmes:  "Tell me the one most important use case. The rest can wait."
Charlie Brown: "...maybe just ask 3 users first...?"

Gaps to extract:
- Target users
- Problem being solved
- Existing alternatives
- Success metrics (KPI)
```

### Scene 2: UI/UX Flow
```
focus: What the user does on screen
Columbo: "What happens when they click the button?"
Holmes:  "If it takes more than 3 screen transitions, no one will use it."
Charlie Brown: "...a single modal should be enough..."

Gaps to extract:
- Screen transition diagram
- Form fields
- Error display
- Loading states
```

### Scene 3: Technical Constraints
```
focus: Implementation difficulty, dependencies, risks
Columbo: "How many days does this take to build?"
Holmes:  "Can't we do 80% with existing code?"
Charlie Brown: "...I don't want to add a new library..."

Gaps to extract:
- Technical dependencies (new libraries?)
- Impact on existing code
- Effort estimate
- Risks
```

### Scene 4: MVP Scope
```
focus: Minimum implementation scope
Columbo: "Do we need all of this? Half might be enough."
Holmes:  "If you could only build one thing, what?"
Charlie Brown: "...trying to do everything will break me..."

Gaps to extract:
- Must-have vs nice-to-have
- v1 scope vs v2 backlog
- Minimum viable set
```
