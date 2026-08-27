# Security Policy

## Supported Versions

tramli is a library, not a deployed service. We provide security fixes for the
latest released version of each language implementation:

| Language | Package | Supported |
|----------|---------|-----------|
| Java | `org.unlaxer:tramli` (Maven Central) | Latest |
| TypeScript | `@unlaxer/tramli` (npm) | Latest |
| Rust | `tramli` (crates.io) | Latest |

## Reporting a Vulnerability

**Please do NOT open a public GitHub issue for security vulnerabilities.**

Use one of the following private channels:

1. **GitHub Security Advisories (preferred)** —
   <https://github.com/opaopa6969/tramli/security/advisories/new>

2. **Email** — <opaopa6969@gmail.com>

### What to include

- Description of the vulnerability and its impact
- Steps to reproduce (proof of concept)
- Affected language implementation(s) and version(s)
- Suggested fix (optional)

### Response timeline

| Step | Target |
|------|--------|
| Acknowledgement | Within 3 business days |
| Initial assessment | Within 7 business days |
| Fix or mitigation | Within 30 days (severity-dependent) |

We follow coordinated disclosure. A CVE will be requested through GitHub
Security Advisories when a fix is available.
