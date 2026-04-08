# Auth API Design (Sample)

> This is a sample design document for trying DGE.
> Say "run DGE on this" and characters will find gaps in this design.

## Overview
JWT-based token authentication API. Login → token issuance → token verification per request.

## Endpoints
- `POST /api/auth/login` — Email + password login → JWT issued
- `POST /api/auth/refresh` — Get new JWT using refresh token
- `POST /api/auth/logout` — Logout
- `POST /api/auth/signup` — New user registration

## Token Spec
- Access token: JWT, expires in 15 min
- Refresh token: opaque, expires in 30 days
- Storage: TBD

## Data Model
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
```

## Open Questions
- Error response format
- Rate limiting
- Password reset flow
