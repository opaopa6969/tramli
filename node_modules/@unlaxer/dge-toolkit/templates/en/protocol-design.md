# DGE Template: Protocol Design

## Overview
Find gaps in service-to-service communication contracts (headers, JWT, API, errors).

## Recommended Characters
Hartman (implementation) + Holmes (simplification) + domain specialist

## Scene Structure

### Scene 1: Communication Directions & Auth
focus: Who sends what to whom, how is auth handled
Hartman: "List every communication direction. You're missing some."
Holmes: "Do we even need this call?"

### Scene 2: Data Format & Schema
focus: Headers, JWT claims, JSON body specs
Hartman: "Show me the type definitions. Not just 'string'."
Holmes: "Too many fields. Half would suffice."

### Scene 3: Error Contracts
focus: Meaning of each error code, retry policy, client handling
Hartman: "Clarify the difference between 401 and 403."

### Scene 4: Versioning & Backward Compatibility
focus: API versioning, handling breaking changes
Holmes: "Do we need versioning? One version is enough."
