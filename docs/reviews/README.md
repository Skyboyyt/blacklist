# Reviews

Codex (and any reviewer) records review results here as `YYYY-MM-DD-<topic>.md`. One file per review session or PR. Claude records the response to each finding in the same file.

## File format

```markdown
# Review: <topic>

| Field | Value |
|---|---|
| Reviewer | Codex |
| Date | YYYY-MM-DD |
| Scope | <PR/branch/commit range/documents> |
| Documents read | PRD.md, ARCHITECTURE-ESSENTIALS.md, AI_HANDOFF.md, … |

## Summary

<2–5 sentences: overall assessment, most important risks>

## Findings

### R-01 <title>
- **Severity:** Critical | High | Medium | Low | Info
- **Category:** security | authorization | privacy | correctness | provenance | test-coverage | architecture | performance | docs
- **Location:** `path/to/file.ts:123` or document section
- **Evidence:** what you observed (code excerpt, failing test, reproduction steps)
- **Impact:** what can go wrong, for whom
- **Recommendation:** concrete fix, or "ADR proposed: docs/adr/NNNN-…"
- **Response (Claude):** fixed in <commit> / won't fix because … / ADR NNNN

## Not reviewed

<anything out of scope or not checked, so gaps are explicit>
```

## Severity guide

| Severity | Meaning |
|---|---|
| Critical | Exploitable security/privacy flaw, data loss, or violation of a product invariant (e.g. Severe band without a finding) |
| High | Likely bug or security weakness with significant impact; missing authorization or negative tests on sensitive paths |
| Medium | Bug with limited impact, missing tests, boundary violations |
| Low | Maintainability, minor inconsistencies |
| Info | Suggestions, questions |
