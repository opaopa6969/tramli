# DGE Template: Security Review

## Overview
Review API and system security through character-driven dialogue.

## Recommended Characters
Picard (quality) + Red Team (attack) + House (hidden problems)

## Scene Structure

### Scene 1: Auth & Authorization
```
Picard:   "Where are auth tokens stored? localStorage is rejected."
Red Team: "What's the blast radius if the JWT secret leaks?"
House:    "What's the admin privilege escalation flow? Can you prevent privilege escalation attacks?"

Gaps: token storage, secret management, privilege escalation, session management
```

### Scene 2: Input Validation
```
Picard:   "Confirm all inputs are sanitized."
Red Team: "SQL injection: try ' OR 1=1 --. XSS: try <script>."
House:    "If there's file upload, what about path traversal? SSRF?"

Gaps: SQL injection, XSS, CSRF, path traversal, SSRF
```

### Scene 3: Data Protection
```
Picard:   "Is PII encrypted? Is PII leaking into logs?"
Red Team: "If the DB dump leaks, can passwords be decrypted?"
House:    "Are backups encrypted? Who has access?"

Gaps: encryption (at-rest, in-transit), PII management, log redaction, backups
```

### Scene 4: Infrastructure
```
Picard:   "Is HTTPS enforced? Is CORS configured minimally?"
Red Team: "Without rate limiting, brute force will break through."
House:    "Are dependency CVEs checked regularly?"

Gaps: HTTPS, CORS, rate limiting, dependency audit, DDoS protection
```
