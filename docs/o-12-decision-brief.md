# Decision brief: O-12, switching on public risk bands

| Field | Value |
|---|---|
| Prepared by | Claude, 2026-10-17 |
| Decision owner | Project owner |
| Status | **Open**: waiting for the owner's decision |
| Technical source | ARCHITECTURE §15.3 (V1 ruleset), `packages/domain/src/risk/ruleset.ts` |

## What you are deciding

Whether visitors may see a **risk band** (Low, Moderate, High or Severe) on address pages and project profiles, and whether the **project risk ranking** may rank projects.

Today both are hidden: every address shows "Risk bands are being calibrated" and the ranking lists every project as "Not ranked". The scoring already runs in the background, and staff can see it on moderation cases.

Switching it on is one setting on the Render **API** service: `RISK_PUBLIC_BANDS=true`. It can be switched off again at any time by setting it back to `false`. Nothing is deleted either way.

## What visitors would see, and what they would not

- **Shown:** the band word (for example "High"), a short reason for each factor ("A moderator published a high-severity finding"), confidence, what data was available, and the time of the assessment.
- **Never shown:** a number. The 0–100 score stays internal, as the product rules require (P-11).
- **Never "safe":** an address with no published findings shows "Not assessed", never "Low" and never "safe".
- **Only reviewed evidence counts:** reports that staff have not accepted and published have no effect at all.

## How a band is worked out

Each **published moderator finding** on an address adds points:

| Finding severity | Points |
|---|---|
| Low | 10 |
| Medium | 30 |
| High | 55 |
| Severe | 80 |

The points add up, then two rules apply:

1. **Cap:** without a **Severe** finding that a second, independent staff member approved, the total stops at **74**, the top of High. Several High findings can never make an address Severe on their own.
2. **Bands:** 0–24 is **Low**, 25–49 is **Moderate**, 50–74 is **High**, and 75–100 is **Severe**.

Two automatic indicators also exist (token-name impersonation, 30 points; a wallet delegated to a flagged contract, 40 points), but nothing produces them yet, so in practice **only moderator findings count today**.

### Worked examples

| Published findings on an address | Points | Band shown |
|---|---|---|
| none | — | Not assessed |
| one Low | 10 | Low |
| one Medium | 30 | Moderate |
| one Medium and one Low | 40 | Moderate |
| **three Low** | 30 | **Moderate** |
| one High | 55 | High |
| two High | 110, capped at 74 | High |
| one Severe, independently approved | 80 | Severe |

## The choices in front of you

You can accept the table above as it is, or ask for changes. The points worth a deliberate look:

1. **Several small findings adding up.** Three Low findings make an address Moderate. Is that what you want, or should Low findings never lift an address above Low?
2. **Medium starts at Moderate.** A single Medium finding is enough for Moderate.
3. **Severe needs two people.** Only an independently approved Severe finding can reach the Severe band. This is a safety rule, not calibration; I recommend keeping it.
4. **Staging first.** The architecture asks for calibration against a "golden set" of real, reviewed cases before public bands. Staging has almost no real findings yet, so that set does not exist.

## Recommendation (Claude)

- **For staging now:** switch bands on with the table unchanged, so the full flow can be tested end to end: publish a finding, see the band, see the ranking, suspend the finding, see the change. Record it as a **staging-only** sign-off.
- **For production:** keep O-12 open until about 20–30 real reviewed cases exist. Then review whether the bands they produce match your judgement, adjust the points if needed, and sign the production calibration.

## How to answer

Reply with one of:

- **"Approve O-12 for staging as proposed"**: I record it and tell you exactly which setting to change in Render.
- **"Approve with changes: …"**: describe the change (for example "three Low findings must stay Low"). I prepare it as a reviewed change first.
- **"Keep bands off"**: nothing changes.
