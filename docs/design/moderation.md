# Moderation, Findings, Approvals and Redress — Design

| Field | Value |
|---|---|
| Status | **Normative design, Phase 0 (revision 3, 2026-10-04).** Backend implementation in Phase 9 after authorization; the staff UI (Phase 5) mocks these contracts |
| Owner | Claude (primary engineer) |
| Decision record | [ADR 0002](../adr/0002-immutable-approvals-and-effective-redress.md) (R-05, R-09), [ADR 0008](../adr/0008-revision-2-ratification-corrections.md) (actor terminology, V2-04) |
| Summarized in | [ARCHITECTURE.md §14, §17](../../ARCHITECTURE.md#14-reports-evidence-and-moderation) |
| Threats | T-26–T-29, T-35, T-38–T-39, T-46–T-47, T-56 |

---

## 1. Vocabulary

| Term | Meaning |
|---|---|
| **Finding** | A moderator-verified factual conclusion about one subject: a sequence of immutable revisions |
| **Revision** | An immutable snapshot of everything a finding asserts. Any change produces a new revision |
| **Author** (human) | The staff member who creates and submits a revision |
| **Approver** (human) | The staff member who records an `approve` event for one exact revision and content hash. Severe cases require an **independent approver** (§4) |
| **System publication** | Not a person. The automatic, atomic transition that makes an approved revision publicly effective. It is **triggered by an approval event** and attributed to that event, never to a separate human "publisher" |
| **Participants of a finding** | Every author of any revision, every approver of any revision, and every staff actor in a suspension or reversal of that finding |
| **Conflicted** | Defined in §7.2 |

There are exactly **two human roles in publication: author and approver.** Every publication is a system transition caused by an approval. The only question is whether the approver must be independent of the authors (§4.1).

---

## 2. Finding revisions

`finding_revisions` is append-only. A revision contains:

- `finding_id`, `revision_number` (1, 2, …), `author_id`, `created_at`;
- `subject_id`, `finding_type`, `severity` (`low` | `medium` | `high` | `severe`), `public_summary`, `internal_rationale`;
- the **evidence set**: evidence item IDs, each with the SHA-256 of its stored object and of the derivative that would be published;
- linked risk factor codes, and the moderation policy version applied;
- `content_hash`: SHA-256 over the canonical JSON of **all** fields above.

**Any** change, including a one-character text fix, a severity or type change, adding or removing evidence, a changed derivative, a changed subject or a changed linked factor, creates a new revision with a new `content_hash`. Revisions are never edited.

---

## 3. Approval events

`finding_approval_events` is append-only:

| Field | Meaning |
|---|---|
| `revision_id`, `revision_content_hash` | The exact revision judged. The hash is re-verified against the stored revision when used |
| `approver_id`, `at` | Who and when |
| `event` | `approve` · `reject` · `withdraw` (withdrawal is possible only while an approval has not taken effect, i.e. publication is blocked by a legal hold, §4.3) |
| `rationale` | Required for `reject` and `withdraw` |
| `stepup_challenge_id` | The action-bound WebAuthn step-up that authorized the event ([identity §10.7](identity.md#107-action-bound-step-up)) |

An approval authorizes **only** the revision it names. When a newer revision exists, older approvals remain visible but authorize nothing. The brief's `second_approved_by/at` columns are removed. No append-only row is ever updated.

---

## 4. Approval and system publication

### 4.1 Who may approve

| Revision being approved | Approver requirement |
|---|---|
| **Non-severe** (low/medium/high), where the finding's currently public revision (if any) is **not** severe | Any staff member with `finding:approve` who is not conflicted. **May be the author** (self-approval is permitted only in this case) |
| **Severe** | An **independent approver**: holds `finding:approve_severe`; is **not an author of any revision** of this finding; is not conflicted (§7.2); is active staff at approval time |
| **Any** revision that would **replace a currently public severe revision** (downgrade to high/medium/low, text change, evidence change) | An independent approver as for severe, who is additionally **not a participant of the currently public revision** |

### 4.2 Approve-and-publish (one transaction)

Recording an `approve` event and the resulting **system publication** happen in **one transaction**. It locks the finding row (`SELECT … FOR UPDATE`) and checks **all** of the following, or rolls back (no approval recorded, nothing published):

1. The revision is the **latest** revision of the finding.
2. The stored `content_hash` matches a recomputation from the revision's stored content and equals the hash in the approval.
3. Every evidence item in the evidence set is `available`; its stored object hash matches; its publishable derivative exists and matches.
4. The approver holds the required permission in a WebAuthn-assured session with a valid action-bound step-up, and meets the §4.1 requirement for this revision.
5. No unresolved legal hold or emergency suspension blocks the subject.

On success the same transaction appends:

- the `finding_approval_events` row (`approve`, approver = the human actor);
- a `finding_publication_events` row (**actor = `system`**, `cause_approval_event_id` = that approval). This is the system publication;
- the finding status change (`published`, `published_revision_id`) and a `finding_status_history` row;
- an audit record;
- jobs for risk signals and notifications.

A repeated approval of an already-public revision is idempotent. Concurrent approvals serialize on the row lock.

### 4.3 Blocked publication

If check 3 or 5 fails, nothing is recorded; the approver retries once evidence is ready or the hold is lifted. The only exception is an explicit legal hold:

- The approval is recorded with `publication_blocked = legal_hold` and the revision stays non-public.
- Lifting the hold triggers system publication only after re-running checks 1–4 in a new locked transaction.
- An approval may be withdrawn while it is blocked.

### 4.4 Event model (audit names)

| Event | Actor | Meaning |
|---|---|---|
| `finding_created` | Author | Finding record with revision 1 |
| `finding_revision_submitted` | Author | A new immutable revision exists |
| `finding_approved` | Approver | Approval of an exact revision and hash |
| `finding_rejected` | Approver | Revision rejected, with rationale |
| `finding_approval_withdrawn` | Approver | Withdrawn before taking effect (§4.3 only) |
| `finding_became_public` | **System** (cause: a `finding_approved` event) | Revision is now publicly effective |
| `finding_superseded` | **System** (cause: a newer `finding_became_public`) | Older public revision replaced |
| `finding_suspended` | Staff actor | Emergency suspension (§8.3) |
| `finding_suspension_reviewed` | Reviewer | Outcome of the 72-hour review |
| `finding_reversal_proposed` | Proposer | Reversal proposed (§8.2) |
| `finding_reversed` | Reversal approver or appeal reviewer | Reversal decided; the status change is a system transition |

Audit history always shows who **authored**, who **approved**, and that publication was a **system** effect of that approval.

---

## 5. Severe findings

### 5.1 Rules

| Question | Answer |
|---|---|
| Who can author a severe revision | Staff with `finding:propose` (moderators, admins), in a WebAuthn-assured session |
| Who can approve | An **independent approver** (§4.1): `finding:approve_severe`, not an author of any revision, not conflicted |
| May the author approve | **No.** No author of any revision of the finding may approve a severe revision |
| Is there a separate publisher | **No.** Approval triggers atomic **system publication** of exactly the approved revision (§4.2) |
| Required independence | Approver ≠ any author; not conflicted (§7.2); ≠ any reporter of a linked report; no standing claim or wallet proof for the subject |
| Conflict handling | Checked at authoring and at approval (which is also when publication happens); later-discovered conflicts require recusal and re-review of past approvals |
| Revision binding | Approval binds to the exact revision and content hash. Any change → new revision → new approval |
| Replacement / downgrade | Replacing a public severe revision (any change, including a downgrade) needs an independent approver who is also not a participant of the current public revision (§4.1) |
| Reversal | §8 |
| Appeal | §9. The severe appeal reviewer must not be any participant |
| If no independent approver is available | **The severe revision is not published.** It stays `pending_second_approval`; nothing about it is public. Never relaxed for staffing reasons |
| Emergency (live, ongoing harm) | A separate **high** finding may be authored and self-approved under §4.1 while the severe revision awaits independent approval. It is capped at High (74) and never shows "Severe". Emergency suspension is §8.3 |

### 5.2 Staffing implication

Publishing a severe finding needs **two people: an author and an independent approver**. Deciding an appeal against a severe finding needs **a third person** who participated in neither role, either internal staff or an approved external `appeal_reviewer` ([identity §10.1](identity.md#101-principles)). The owner must plan staffing accordingly (open decision in PRD §10).

---

## 6. Standing

### 6.1 Principle

Standing is decided **per case** (per response or appeal). It records what was proven and when. **Control of an address proves authority at a point in time, not identity, innocence, or authorship of past conduct.** Standing never grants permanent rights over a subject.

### 6.2 Standing mechanisms

Any one is sufficient. A case may combine several.

| # | Mechanism | Suitable for | What it proves | Verification |
|---|---|---|---|---|
| 1 | **Fresh control signature** | EOAs, Solana keypair accounts | Control of the address at signing time | SIWE (EVM, `personal_sign`) / SIWS (Solana) message with purpose `standing`, case ID, nonce, 10-minute expiry, single use ([§6.4](#64-signature-challenges)) |
| 2 | **Authority signature** | Contracts, token mints, programs, PDAs | Control of the on-chain authority (owner, admin, upgrade authority, mint authority, deployer) at a finalized block | Fresh signature by the authority address **plus** a chain read showing that address is the authority at a finalized block ([chain-data §5](chain-data.md#5-snapshot-identity-and-cross-verification)) |
| 3 | **Domain control** | Domain subjects | Control of DNS for the domain at check time | `TXT` record at `_blacklist-standing.<domain>` containing a case-specific token, read through a controlled DNS resolver. **No HTTP fetch** |
| 4 | **Staff-assisted documentary standing** | Lost keys, compromised or drained wallets, victims, former employees, project ownership transfers, contract migrations, organization representatives, smart-contract wallets (EIP-1271 deferred), hardware wallets that cannot sign messages | Whatever the reviewed documents establish, stated explicitly in the decision | The appellant submits evidence. Examples: drain transactions and approval history, prior signed messages, an official announcement on a verified domain or official channel, corporate authorization, a migration transaction. A **standing reviewer** (non-conflicted staff, not a participant of the finding) decides and records what was and was not established |
| 5 | **Correction request** | Anyone with an account | Nothing (no standing needed) | Triaged as a `correction_request` case. Covers factual errors, wrong subjects, wrong labels |

### 6.3 Standing records

`standing_claims` rows (per case): mechanism, proof references (challenge ID and signature, or authority read receipt, or DNS check record, or documents), decided by (mechanisms 1–3 are automatic, 4 is a reviewer), outcome, scope statement, timestamps. Standing is never inferred from a persistent account–wallet link. Persistent wallet links are **deferred from V1**, and when introduced they will be evidence, not entitlement, with no account holding exclusive control of an address.

### 6.4 Signature challenges

Built from scratch by the server and never accepted from the client:

- Human-readable text in EIP-4361 / SIWS format: domain, URI, chain ID, address, statement, nonce (≥ 96 bits), issued-at, expiration (10 minutes), request ID (case ID).
- Statement example: *"Prove control of this address for Blacklist case #1234. This signature does not authorize any transaction or token approval and costs nothing."*
- Single use, bound to user, session, purpose, case, chain and address.
- **Never requested:** `eth_sign`, typed data (EIP-712, permits), or any transaction signature.

---

## 7. Independence rules

### 7.1 Matrix

✗ = the same person may **not** hold both roles for the same finding. There is no "publisher" role; publication is a system effect of approval (§4).

| | Author (any revision) | Severe / severe-replacement approver | Non-severe approver | Reversal approver | Standing reviewer | Appeal reviewer |
|---|---|---|---|---|---|---|
| **Author** | — | ✗ | allowed (self-approval) | ✗ | ✗ | ✗ |
| **Severe / severe-replacement approver** | ✗ | — | allowed | ✗ | ✗ | ✗ |
| **Reporter of a linked report** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| **Appellant / responder** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |

### 7.2 Conflicted staff

A staff member is conflicted for a finding when any of these hold:

- they submitted or corroborated a linked report;
- they are the appellant or responder;
- they hold a standing claim, wallet proof or project claim relating to the subject;
- they self-declare a conflict (employment, investment, personal relationship);
- an admin records a conflict for them.

Conflicts block authoring, approving (and therefore the system publication it would cause), standing review and appeal review for that finding.

---

## 8. Amendment, reversal and suspension

### 8.1 Amendment

A new revision, approved under §4.1, whose system publication supersedes the earlier public revision. An independent approver is required when **either** the new revision **or** the currently public revision is severe. Severe findings cannot be downgraded or edited single-handedly.

### 8.2 Reversal

A reversal is proposed (`finding_reversal_proposed`) and decided (`finding_reversed`) against the finding's current public revision; the status change is a system transition.

- **Non-severe:** one non-conflicted staff member. The original author may self-correct.
- **Severe:** two people. A proposer (any non-conflicted staff, **including** an original participant admitting error) and an approver who is **not** a participant. Or an appeal reviewer's decision (§9).
- Effect: finding status `reversed`; its risk signal is retracted with a reason; a new assessment is produced; a public correction notice is shown for 90 days; the history entry "reversed on <date>" remains.

### 8.3 Emergency suspension

Any staff member with step-up may immediately move a published finding to `suspended`. Examples: personal data published by mistake, the wrong subject, a credible legal emergency, credible counter-evidence during an appeal.

- Effect: hidden from the public page except "Temporarily suspended pending review"; its signal is `suspended` (excluded from scoring); a new assessment is produced.
- Suspending a **severe** finding notifies all admins immediately, because a single person reducing a severe finding is the abuse case this rule watches for.
- A non-participant must review within **72 hours** and either reinstate (severe: by an independent approver as in §4.1) or reverse.
- Repeated suspensions by the same staff member are flagged in decision-pattern analytics.

---

## 9. Appeals

- **Who:** a party with standing (§6), against a published finding or a moderation decision that affects them.
- **Filing does not hide the finding.** It shows "Disputed — under appeal". Only an emergency suspension (§8.3) removes it from scoring.
- **Reviewer:**
  - Non-severe: any non-conflicted staff member who is not a participant.
  - Severe: a non-conflicted reviewer who is **not a participant** of the finding (neither an author nor the approver). This is a third person: internal staff, or an approved external `appeal_reviewer`.
- **If no eligible reviewer is available,** the appeal stays pending with the notice shown. After **14 days** it escalates to the owner, who must arrange an eligible reviewer. Independence is never relaxed.
- **Outcomes:**
  - `upheld`: the finding stays, noted "appeal reviewed".
  - `amended`: a new revision (severe needs fresh approval by a non-participant).
  - `reversed`: §8.2.
  Every outcome is a revision-bound decision.
- **Levels:** one level in V1. A new appeal requires new evidence.
- **Responses** (right of reply): a party with standing may publish a plain-text response. It is moderated for safety (doxxing, abuse, malicious links), not viewpoint, and shown as "Response from a party that proved control of this address/domain on <date>". The wording reflects time-bound control, not identity.

---

## 10. Reports (V1)

- Private to the reporter and staff. **No public count, no public indicator, and no effect on any public score or band while unreviewed** (owner decision, 2026-10-04).
- Lifecycle: `draft → submitted → screening → queued → in_review → (needs_info ↔ in_review) → accepted | rejected | rejected_abusive`, with `withdrawn` possible before a decision. Status history is append-only.
- An accepted report leads to a finding authored by staff (§2–§5). The report's narrative is never published verbatim; reporter identity is never published.
- Withdrawn or rejected reports never feed any signal. Delayed jobs re-check report status before acting ([ARCHITECTURE.md §22](../../ARCHITECTURE.md#22-background-jobs)).

---

## 11. Test obligations

Defined in [testing-strategy.md §5–§7](../testing-strategy.md#5-authorization-tests): system publication attributed to the approval event (no human publisher), self-approval allowed only for non-severe non-replacement revisions, concurrent approve-and-publish, approval of a superseded revision, withdrawn approval, revoked approver, null or same-person approver, changed evidence hash, co-approver appeal attempt, each standing mechanism (including lost-key documentary standing), reversal by a participant without an independent approver, emergency suspension review deadline.
