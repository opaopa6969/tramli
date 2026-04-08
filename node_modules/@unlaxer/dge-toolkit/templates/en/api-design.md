# DGE Template: API Design

## Overview
Surface gaps before designing a new API endpoint.

## Recommended Characters
Columbo (assumption check) + Picard (quality standard) + Charlie Brown (scope reduction)

## Scene Structure

### Scene 1: Basic Flow
```
focus: Input/output/error definitions
Columbo: "Who's calling this API?" "What does it return?"
Picard:  "Error responses must follow RFC 7807."
Charlie Brown: "Can we just do GET and POST for MVP...?"

Gaps to extract:
- Input field definitions
- Response format
- Error codes and messages
- Authentication requirements
```

### Scene 2: Auth & Authorization
```
focus: Authentication method, permission management
Columbo: "Can unauthenticated users access this?"
Picard:  "JWT in httpOnly cookie. localStorage is unacceptable."
Charlie Brown: "Can we just use API keys for now...?"

Gaps to extract:
- Auth method (JWT / Session / API key)
- Token storage location
- Permission model (RBAC / ABAC / none)
- Rate limiting
```

### Scene 3: Validation & Edge Cases
```
focus: Input validation, boundary values, error cases
Columbo: "What happens if you send an empty string?"
Picard:  "Validation errors must be 400 + detailed message."
Charlie Brown: "Just use a validation library..."

Gaps to extract:
- Validation rules per field
- Duplicate check (409 Conflict)
- Character limits, type checking
- File upload restrictions
```

### Scene 4: Performance & Operations
```
focus: Production load, caching, logging
Columbo: "What happens if 1,000 users hit this at once?"
Picard:  "Response time must be under 200ms."
Charlie Brown: "Only 10 people will use this at first..."

Gaps to extract:
- Pagination
- Caching strategy
- Log output content
- Monitoring & alerting
```

## Output Format
Output Gaps from each Scene in this format:
```
Gap: [Title]
  Observe: [Current problem]
  Suggest: [Proposal]
  UC:      [Use Case definition]
  API:     [Endpoint definition]
  SQL:     [Data Model change]
```
