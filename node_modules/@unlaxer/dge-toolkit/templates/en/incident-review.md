# DGE Template: Incident Review

## Overview
Analyze production incident root causes and prevention through dialogue.

## Recommended Characters
Columbo (assumption check) + Picard (quality standard) + Red Team (attack perspective)

## Scene Structure

### Scene 1: What Happened
```
Columbo:  "In short, what broke? What did users see?"
Picard:   "Timeline. Precisely. When was the first alert?"
Red Team: "Could this be the result of an attack? Have you checked logs?"

Gaps: incident timeline, blast radius, user impact
```

### Scene 2: Why It Happened (5 Whys)
```
Columbo:  "Why did the migration fail?" → "Why were there no tests?" → ...
Picard:   "The process that allowed a production migration without tests is the problem."
Red Team: "Was this vulnerability known? Check CVEs."

Gaps: root cause, test gaps, process failures
```

### Scene 3: Why It Wasn't Detected
```
Columbo:  "Did the alerts fire?"
Picard:   "Monitoring quality is insufficient. Health checks are superficial."
Red Team: "How could an attacker bypass the alerts?"

Gaps: monitoring gaps, alert configuration, detection latency
```

### Scene 4: Prevention
```
Columbo:  "If the same thing happens tomorrow, what do we do?"
Picard:   "Add tests + CI gate + automated migration testing."
Red Team: "Does this fix open a different attack surface?"

Gaps: prevention measures, test additions, process improvements, monitoring enhancements
```
