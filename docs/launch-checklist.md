# Launch checklist

Phase 11 exit criterion (ARCHITECTURE §36): **every item checked and the owner's signature recorded** before Blacklist is opened to the public as a production service. Plan: [phase11-plan.md](phase11-plan.md).

Status key: ☐ open · ☑ done (with date and evidence link)

## Legal and policy (blockers)

- ☐ A qualified lawyer has reviewed the Terms, the Privacy Policy, the wording rules for findings, and the appeal and response process (PRD §10)
- ☐ Counsel has approved the retention map (ARCHITECTURE §25.3), including report, evidence and audit periods
- ☐ GDPR / UK GDPR applicability and data-subject rights decided with counsel (P-10)
- ☐ The legal pages on the site match the approved texts

## Decisions

- ☐ O-4: production hosting chosen and recorded
- ☐ O-12: risk-band calibration signed for production (or bands kept off)
- ☐ O-13: independent audit checkpoint decided
- ☐ P-13: operator recovery branch decided

## Security

- ☐ Independent security review completed; every finding fixed or accepted in writing
- ☐ Staff accounts re-verified: correct roles, at least two security keys each, no stale invitations
- ☐ At least two active administrators
- ☐ All production secrets are new (never used in staging) and stored only in the hosting platforms
- ☐ `BREAK_GLASS_ENABLED=false`, and research provider keys exist only on the API

## Operations

- ☐ Production database with point-in-time recovery and backups
- ☐ Restore drill performed and timed (date, duration, result)
- ☐ Staff recovery drill performed (an admin who lost their keys is restored)
- ☐ Break-glass drill performed on staging
- ☐ Uptime monitoring and alerts for the website, API and worker, with a named person who receives them
- ☐ Email sending from a verified domain; delivery tested to an outside address

## Product

- ☐ End-to-end walkthrough passed on staging, then on production
- ☐ Performance acceptable with realistic data (project directory, ranking, moderation queue)
- ☐ Research provider limits sized for expected traffic

## Sign-off

| Role | Name | Date | Signature |
|---|---|---|---|
| Project owner | | | |
