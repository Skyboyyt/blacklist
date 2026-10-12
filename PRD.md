# Blacklist — Product Requirements Document (PRD)

| Field | Value |
|---|---|
| Status | **Revision 3 — final Phase 0 closure corrections.** Pre-development / Architecture stage |
| Owner | Project owner (final product authority) |
| Primary engineer | Claude |
| Secondary / review engineer | Codex |
| Last updated | 2026-10-04 |
| Related | [ARCHITECTURE.md](ARCHITECTURE.md), [ARCHITECTURE-ESSENTIALS.md](ARCHITECTURE-ESSENTIALS.md), [THREAT-MODEL.md](THREAT-MODEL.md), design docs in [docs/design/](docs/design/) |

> Production implementation has **not** started. Nothing in this document describes a feature that exists today.
>
> **Revision 2** applies the owner's decisions of 2026-10-04:
> - library-first authentication;
> - 15-character passwords;
> - no public pending-report counts;
> - the smaller V1;
> - image-first evidence;
> - severe approvals never relaxed;
> - legal review as a pre-launch blocker.
>
> **Revision 3** applies the owner's later decisions:
> - **E-1 accepted with mitigations;**
> - **V1 public risk display = band + explanation, no numeric score (P-11);**
> - **frontend-first development** (ARCHITECTURE §36).
>
> It also applies the re-review corrections: reliable reset delivery, atomic reset, the Solana same-slot rule, and author/approver/system-publication terminology.
>
> It also applies the accepted review fixes (ADRs 0001–0007).

---

## 1. Product vision

Blacklist is a Web3 anti-scam, wallet-intelligence, project-verification and blockchain-investigation platform. It helps people research crypto projects, wallets, transactions, tokens and contracts **before** they make decisions. It gives victims, researchers and affected parties a structured, accountable way to report, review and contest suspicious activity.

Blacklist competes on the **trustworthiness of its claims**, not on the volume of accusations. Every statement Blacklist shows must be traceable to its source, its evidence, and the rules that produced it.

### 1.1 Product principles (permanent)

1. **Association does not equal guilt.** Interacting with an address that carries risk indicators is an observable fact, not proof of wrongdoing. Neither is the direction of a transfer: "A sent funds to B" does not show that A's owner authorized it (approved spenders, drainers, token programs, airdrops, relayers and fake logs all produce such records). Blacklist may show observed transfers neutrally. Stronger classifications require evidence and defined review criteria.
2. **Provenance is always visible.** Every claim belongs to exactly one provenance category, and the UI, API and database preserve the category:

   | Category | Meaning | Example |
   |---|---|---|
   | `chain_fact` | Directly observable blockchain data, with source, snapshot and finality | "Transaction 0x… finalized in block 21,000,000 transferred 2.1 ETH from …" |
   | `platform_analysis` | Deterministic, versioned Blacklist analysis of facts | "Token mint authority has not been revoked" |
   | `community_allegation` | Unverified claims from users (reports) | Private until reviewed; never shown publicly in V1 |
   | `moderator_finding` | Claims reviewed and verified by Blacklist moderators against defined criteria | "Verified finding: this contract's owner-only function transferred holders' tokens" |
   | `ai_observation` | Model-generated observations (future), never facts | — |
   | `external_source` | Third-party data (sanctions lists, explorer verification, provider labels), attributed to its publisher | "Source verified on <explorer> (as of 2026-09-30)" |

   The brief listed five categories. `external_source` is added because sanctions designations, explorer data and third-party labels are neither chain facts nor Blacklist analysis (ARCHITECTURE.md §34, D-012).
3. **Evidence over assertion.** Severe classifications require an independently approved moderator finding (or, once activated with legal sign-off, an authoritative external designation). Never community volume, AI output, association, transfer direction or a single report.
4. **Explainability.** For every assessment Blacklist must answer: *"Why does this entity currently have this result?"* It must also answer, for any past moment: *"Why did Blacklist show this result then?"*
5. **Absence of indicators is not safety.** A low result means "no significant risk indicators found", never "safe".
6. **Accountability and due process.** Affected parties, including people who no longer control keys, can respond, provide counter-evidence, request corrections and appeal before independent reviewers. History is preserved, never silently rewritten.
7. **Privacy by default.** Public blockchain information and private Blacklist information are separate. Account details, sessions, security events, draft and pending reports, reporter identity and research activity are private (§6.1).
8. **Never custodial, never secrets.** Blacklist never asks for seed phrases, private keys or recovery phrases, never takes custody of funds, and never asks users to sign transactions or typed data to "verify".

### 1.2 Product goals

| # | Goal | Measured by (see §9) |
|---|---|---|
| G1 | Anyone can research an address, transaction, token, contract or project quickly with clearly sourced information | Search-to-profile success, page performance |
| G2 | Turn victim and researcher reports into evidence-backed, reviewed findings | Moderation throughput, decision quality |
| G3 | Provide an explainable assessment people can trust because it is conservative and transparent | % of assessments with full explanations; replay tests; appeal reversal rate |
| G4 | Treat affected parties fairly | Redress available to every subject type; time to appeal decision |
| G5 | Protect accounts and private research | Zero private-data exposure incidents; auth security posture |
| G6 | Stay independent of any single blockchain data provider | Failover works; providers swappable without domain changes |

### 1.3 Non-goals

- Not a custodian, exchange, wallet, payment processor or transaction-signing service.
- No personal identity attributions of private individuals (no doxxing).
- No financial advice; no safety guarantees.
- No community votes on guilt; no comments.
- No own blockchain nodes or indexer at launch.

---

## 2. Target users

| Persona | Needs | V1 surfaces |
|---|---|---|
| **Retail crypto user** | A quick check before sending funds or buying a token | Search, address/token/project profiles, assessments |
| **Scam victim** | Report privately, provide evidence, get updates | Report flow, image and transaction evidence, report status |
| **Independent researcher** | Sourced research; (later) tracing, workspaces, reputation | Research views; later features deferred |
| **Affected party / project team** | Respond, correct errors, appeal, even without current wallet keys | Standing proofs, responses, corrections, appeals |
| **Moderator** (staff) | Safe evidence review with clear criteria and audit | Moderation queue, revision-bound findings |
| **Appeal reviewer** (staff, may be external) | Independent review of appeals | Appeal cases only |
| **Administrator** (staff) | Staff lifecycle, user suspension, projects, labels, audit | Minimal admin |
| **Integrator** (future) | Programmatic lookups | Public API (Future) |

---

## 3. Glossary

| Term | Definition |
|---|---|
| **Subject** | Anything Blacklist can research, report or assess: an **address** (chain-scoped), a **project**, or a **domain** |
| **Address** | A chain-scoped account identifier. The same string on two chains is two different subjects |
| **Chain** | A network identified by a CAIP-2 ID (e.g. `eip155:1` = Ethereum mainnet) |
| **Report** | A user's private allegation about subjects, with evidence. `community_allegation` until reviewed; never public in V1 |
| **Evidence** | V1: images (PNG/JPEG/WebP), transaction references, address references, URLs as text, statements |
| **Finding** | A moderator-verified factual conclusion about a subject, published as an immutable **revision** |
| **Revision** | An immutable snapshot of everything a finding asserts. Any change creates a new revision; approvals bind to one revision |
| **Signal** | One risk indicator for a subject, derived from a finding or a deterministic analysis |
| **Disclosure** | A capability fact shown as context with no risk contribution (e.g. "mint authority active") |
| **Risk Score** | An integer **0–100 where higher means more risk**: an ordinal policy indicator, not a probability or verdict |
| **Risk band** | Low (0–24), Moderate (25–49), High (50–74), Severe (75–100); plus *Not assessed* |
| **Confidence** | How complete and fresh the data behind an assessment is (Low/Medium/High). Separate from the score |
| **Standing** | Per-case proof that a person is affected and entitled to respond or appeal (signature, authority signature, DNS, or reviewed documents). It proves control or authority **at a time**, not identity or innocence |
| **Participant** | Any author or approver of any revision of a finding, or a decider on it. Participants cannot review appeals of that finding |

---

## 4. Release scope

Scope is divided into **V1**, **Post-V1**, and **Advanced/Future**. Changes to V1 require an owner-approved ADR (AGENTS.md §6).

### 4.1 V1 (owner decision 2026-10-04: smaller, defensible scope)

V1 proves one complete, trustworthy loop:

> **Research → Private report → Moderation → Revision-bound finding → Explained assessment → Response / Correction / Appeal**

| Area | V1 scope |
|---|---|
| Accounts | Email-first registration (mailbox proof before any credential), login, logout, forgot/reset password, password change, email change, session list and revocation, minimal profile (handle, display name; no public profile page) |
| Staff security | Invitation-only staff accounts; ≥ 2 WebAuthn authenticators (independent failure domains encouraged); WebAuthn-assured sessions; action-bound step-up; two-person admin grants and recovery; operator bootstrap and break-glass; audit |
| Roles | Member, Moderator, Appeal reviewer, Administrator |
| Chains | **Solana mainnet** and **Ethereum mainnet** |
| Search | Exact address and transaction lookup with explicit chain; project name and domain search |
| Address research | Kind, balances, bounded recent transactions (with movement evidence level and authorization basis), token/contract details, capability disclosures, public labels, published findings, responses, assessment with explanation. Unavailable data is shown as unavailable |
| Transaction research | Status, finality, fee, transfers with evidence level and authorization basis, involved addresses with labels and finding badges |
| Projects | Staff-created profiles: official addresses and domains, findings, responses, change history |
| Reporting | **Private** reports by registered users: categories, subjects, narrative, image evidence, transaction references, URLs as text |
| Evidence | **Images only** (PNG/JPEG/WebP), sanitized in an isolated processor; transaction-hash evidence verified against finalized chain data |
| Moderation | Queue, revision-bound findings, independent approval for severe findings (never relaxed), emergency suspension, audit |
| Assessments | Explained V1 ruleset (findings plus a small calibrated set of deterministic indicators), replayable history; **public display = risk band + explanation**, never the numeric score (P-11) |
| Redress | Correction requests (anyone with an account), responses and appeals with per-case standing (5 mechanisms), independent reviewers |
| Notifications | In-app notices about one's own reports, standing, responses, appeals and account security; security emails |
| Admin | Staff lifecycle, user suspension, project and label management, signal suppressions with rationale, audit viewer |
| Transparency | Methodology, privacy, security, terms pages |

### 4.2 Post-V1 (planned, not V1)

| Area | Scope |
|---|---|
| Member MFA | Passkeys/TOTP for all members (first Post-V1 identity item) |
| Watchlists and alerts | Watchlists, Blacklist-event alerts, then on-chain movement alerts |
| Saved research | With watchlists |
| Wallet links | Persistent, private, **non-exclusive** account–wallet proofs (evidence, not entitlement) |
| Public profiles | Profile pages with opt-in published reports |
| Tracing and graph | Step-by-step tracing; relationship graph with observed/inferred/verified edges |
| Investigation workspace | Private cases with explicit sharing |
| Project claims & verification | DNS TXT, authority signatures, documents |
| Community intelligence | Corroboration, outcome-based reputation, leaderboard |
| Additional EVM chains | Base, Arbitrum, BNB Chain, Polygon |
| Names, NFTs, smart-contract wallet signatures | ENS/SNS, NFT holdings, EIP-1271/6492 |
| Counterparty analytics | Bounded, neutral, with authorization semantics |
| Sanctions badge | After qualified legal review and an ADR |
| Document evidence (PDF) | After a separate isolated-sanitization security design and ADR |
| Project aggregate assessments | With published aggregation rules |
| Association signals | Only via ADR + calibration, with authorization-basis safeguards |

### 4.3 Advanced / Future

AI-assisted research (labelled, never decisive) · public API · cross-chain intelligence · inferred clustering · honeypot simulation · own indexing (ADR).

### 4.4 Explicitly NOT in V1

Watchlists and all alerts · graph and tracing UI · investigation workspaces · researcher reputation and leaderboard · AI · public API · comments · voting · elaborate analytics · public profile pages · persistent wallet links · counterparty analytics · sanctions badges · PDFs and other documents · member MFA · numeric effect of unreviewed reports, association or sanctions · user-created projects and self-service verification · NFTs · extra chains · mobile apps · browser extension · price data · payments · social login · avatar uploads.

---

## 5. Functional requirements

Keywords: **MUST** / **SHOULD** / **MAY**. Normative protocols live in the design documents referenced.

### 5.1 Authentication and accounts ([identity design](docs/design/identity.md), ADR 0001)

**Model (owner decision):** library-first. Better Auth runs headless for generic credential and session primitives; Blacklist owns every security policy. Wallet connection is never an authentication method.

| ID | Requirement |
|---|---|
| AUTH-1 | Registration MUST be **email-first**. `/register` asks only for an email; the emailed link opens `/register/complete`, where the person chooses handle and password. **No account, credential, session or authenticator may exist before the mailbox-token holder completes registration.** |
| AUTH-2 | Registration MUST NOT reveal whether an email has an account. Responses are identical; an existing account's owner receives a notice email instead (rate-limited). |
| AUTH-3 | Every account has a verified email by construction. There are no unverified accounts. |
| AUTH-4 | Emailed tokens MUST be single-use, purpose-bound and short-lived, carried in the URL **fragment**, and consumed only by POST from a confirm page. They are generated at send time and never stored in plaintext or placed in queues or logs. |
| AUTH-5 | Passwords MUST be 15–128 Unicode code points and ≤ 512 bytes after NFKC normalization. Longer input is rejected, **never truncated**. No composition rules; no periodic expiry; paste, autofill and password managers supported; breached passwords blocked (HIBP range API, with a local blocklist fallback). |
| AUTH-6 | Login MUST use a generic failure message and equalized timing. |
| AUTH-7 | Brute-force and credential-stuffing defenses MUST use durable per-account, per-IP (IPv6 /64) and global throttling with human-verification escalation, and MUST NOT allow permanent lockout of legitimate users. |
| AUTH-8 | Forgot-password MUST always answer "If an account exists, we sent instructions". Reset tokens expire after 30 minutes and are single-use. **At most one reset link per account is valid at a time**, and a link becomes usable only after the email provider has accepted the message. |
| AUTH-9 | A password reset MUST be **all-or-nothing**: the new password, consumption of the link, revocation of all sessions, the 72-hour cooling period (no email change), the audit record and the security notice take effect together or not at all. Staff resets also require WebAuthn. |
| AUTH-10 | Logout MUST revoke the server-side session (POST only). |
| AUTH-11 | Users MUST be able to view active sessions and revoke any, others, or all. |
| AUTH-12 | Password change MUST require the current password and revoke other sessions. |
| AUTH-13 | Email change MUST require recent re-authentication, verification of the new address, and a notice to the old address (no self-service revert link). |
| AUTH-14 | Security notices MUST be sent for password change/reset, email change and staff security events. |
| AUTH-15 | Staff MUST use dedicated invitation-only accounts with ≥ 2 WebAuthn authenticators (two registrations are not assumed to be independent devices); staff powers exist only in WebAuthn-assured sessions. Member MFA is Post-V1; the design supports it. |
| AUTH-16 | Authorization MUST be enforced server-side; frontend visibility never determines authorization. |
| AUTH-17 | Client-supplied roles MUST be ignored. |
| AUTH-18 | State-changing requests MUST carry an exact matching `Origin` header. |

### 5.2 Login page (explicit product requirement)

A dedicated `/login` page. Design requirements:

- **Visual:** professional, modern, clean, security-focused; Blacklist branding; dark and light themes; responsive from 320 px.
- **Fields:** email (`autocomplete="username"`) and password (`autocomplete="current-password"`) with an accessible show/hide toggle. Paste allowed.
- **Actions:** "Sign in", "Forgot password?" → `/forgot-password`, "Create an account" → `/register`.
- **States:** idle · inline validation · submitting (disabled, no double submit) · human-verification challenge · staff WebAuthn step (`/staff/verify`) · generic failure · rate-limited with guidance · session-expired notice · request ID on unexpected errors.
- **Safe errors:** never reveal whether an email exists.
- **Copy:** persistent line *"Blacklist will never ask for your seed phrase or private key."*
- **Redirects:** `next` must be a validated same-origin relative path.
- **Accessibility:** WCAG 2.2 AA; keyboard-only; visible focus; announced errors.
- **Third-party scripts:** none except the human-verification widget when challenged.

`/register`, `/register/complete`, `/forgot-password`, `/reset-password`, `/email-change/confirm`, `/staff/enroll` and `/staff/verify` share the design. Token pages use fragment tokens and `Referrer-Policy: no-referrer`.

### 5.3 User profiles

V1: unique handle (reserved words and staff-impersonation patterns blocked, confusables normalized) and display name, visible to the user and staff. **No public profile pages in V1.** Email is never exposed. Staff badges derive from server-side roles only.

### 5.4 Roles

| Role | V1 | Capabilities (summary) |
|---|---|---|
| **Member** | Yes | Research; private reports; standing proofs; responses, corrections, appeals |
| **Moderator** | Yes | Review cases, author and publish findings, approve others' severe findings, decide standing and appeals where independent |
| **Appeal reviewer** | Yes | Appeal-only reviewer for independence (may be an approved external person) |
| **Administrator** | Yes | Staff lifecycle, user suspension, projects, labels, suppressions, audit |
| **Researcher** | Post-V1 trust tier | Earned through verified contributions; never bypasses moderation |

### 5.5 Universal search

Exact EVM/Solana addresses and transaction identifiers with an explicit chain (never merged across chains); project names and domains. Search terms and looked-up addresses are never stored with the user's identity.

### 5.6 Wallet research and intelligence (V1)

- Address profile sections, each labelled with provenance and an "as of" time: chain, address, kind, balances, recent transactions (bounded window, disclosed), token/contract details, capability disclosures, public labels, published findings, responses, assessment.
- Each transfer shows its **movement evidence level** and **authorization basis** in plain language, e.g. *"Who authorized this transfer is unknown."*
- Lookalike-address warnings.
- Data a provider cannot supply is shown as unavailable.
- **Not in V1:** counterparty analytics, pending-report indicators, "interacted with flagged address" summaries.

### 5.7 Wallet tracking (watchlists)

**Deferred to Post-V1** (owner decision). Design retained: private watchlists, private notes, Blacklist-event alerts, then movement alerts.

### 5.8 Transaction research and tracing

- V1: transaction detail with status, finality, fee, and transfers with evidence level and authorization basis.
- Post-V1 tracing: user-driven hops; never asserts common ownership.

### 5.9 Relationship graph (Post-V1)

Observed / inferred / verified edges visibly distinguished; hubs collapsed; bounded; list view on mobile.

### 5.10 Project, token and contract research

- Projects (V1, staff-created): description, category, official addresses and domains with attribution basis, findings, responses, change history.
- Tokens and contracts (V1):
  - on-chain name/symbol marked **untrusted**; standard, decimals, supply;
  - EVM proxy implementation; explorer source verification (`external_source`);
  - Solana mint/freeze authority and Token-2022 extensions as **disclosures**;
  - impersonation indicator.
- Metadata URIs are never fetched. Unavailable data is never presented as fact.

### 5.11 Scam reporting (V1)

- Registered users submit **private** reports: category (rug pull, phishing, fake investment, impersonation, wallet draining, fake token, fraudulent project, stolen funds, suspicious contract, other), subjects, narrative (plain text), incident date, optional loss, image evidence, transaction references, URLs as text.
- **A report never marks a subject as anything.** Unreviewed reports are private moderation data: **no public count, no indicator, no effect on any public result** (owner decision).
- Reporter identity and narratives are never published. Findings are written by staff in factual language.
- Quotas, drafts (deleted after 30 days of inactivity, with warning), withdrawal before a decision, additional evidence when moderators ask.

### 5.12 Evidence (V1: image-first, owner decision)

- **Accepted:** PNG, JPEG, WebP. ≤ 10 MiB each, ≤ 10 per report, ≤ 40 megapixels, ≤ 12,000 px per side, single frame.
- **Rejected:** PDF, SVG, HTML, archives, animated images and everything else. PDFs and other documents need a separate isolated-sanitization design and ADR first.
- **Processing:** files are re-encoded with metadata stripped in an **isolated processor** with no database access, no secrets and no other network access. Failures are rejected (fail closed).
- **Viewing:** staff and the public see only sanitized derivatives. **Originals are never rendered** to anyone; they are preserved immutably for forensic export by operator procedure.
- **Transaction-hash evidence** is verified against finalized chain data by two independent providers at the same snapshot.
- **URLs** are stored as defanged text and never fetched.
- **Integrity:** evidence is never silently altered; redaction creates new derivatives; removal follows ARCHITECTURE.md §14.6.

### 5.13 Moderation ([moderation design](docs/design/moderation.md), ADR 0002)

```
Submission → automated screening (flags only) → queue → evidence review → finding revision (author)
          → approval of that exact revision (severe: independent approver) → automatic system publication
          → response / correction / appeal → independent review → resolution
```

- **Findings are immutable revisions.** Any change (text, severity, type, subject, evidence, linked factors) creates a new revision and needs fresh approval where approval applies.
- **Roles:** the **author** writes a revision; an **approver** approves that exact revision, and approval automatically publishes it. There is no separate publisher. Non-severe revisions may be self-approved by the author.
- **Severe findings:**
  - Need approval by an **independent approver**: a non-conflicted staff member who never authored any revision of that finding. The same applies to any change or downgrade of a published severe finding.
  - **If no independent approver is available, the severe finding is not published.**
  - The requirement is never relaxed.
  - For urgent harm, a separate *high* finding may be published while approval waits.
- **Emergency suspension:** any staff member, with step-up. A non-participant reviews it within 72 hours.
- **Language:** factual ("This contract's owner-only function transferred holders' tokens"), never generic labels like "scammer".

### 5.14 Risk assessment (ADR 0005)

- **Risk Score:** integer 0–100, higher = more risk; an ordinal policy indicator, not a probability, verdict or guarantee.
- **What it measures:** the risk of **interacting with** a subject. Victim wallets can score high, and their explanations say so.
- **Bands:** Low 0–24 ("no significant risk indicators found", not "safe") · Moderate 25–49 · High 50–74 · Severe 75–100 · *Not assessed* (never reassuring).
- **Confidence** is shown separately.
- **Public display (owner decision P-11):** the **risk band and its explanation**: key factors and evidence, confidence, coverage, freshness ("as of"), and dispute or appeal state. **The exact numeric score is not shown publicly in V1.** It may stay internal and is reconsidered only after real-world calibration.
- **V1 evidence tiers:**
  - *Verified:* published findings by severity.
  - *Analysis:* a small set of deterministic indicators (token impersonation; EIP-7702 delegation to a contract with a published finding, worded as possible victimhood), subject to owner calibration sign-off.
  - *Disclosures:* capability facts with **zero** contribution.
- **V1 assessments use only supported strong evidence** (verified findings and calibrated deterministic indicators). Severe requires an independently approved severe finding (or, once activated with legal sign-off, an authoritative designation).
- *Weak signals* (community reports, association, AI) are **inactive, deferred future policy**. If ever enabled by ADR, they may never add to strong evidence and alone may never exceed Moderate.
- **Permanent rules:** incoming transfers and unknown authorization never count. Verification never lowers risk. No manual score setting. Suppressions are audited and visible.
- **History:** every assessment keeps an immutable snapshot of its inputs. Past results are never recomputed with new rules. Users can see when and why a result changed.

### 5.15 Anti-abuse rules for community input

In V1 reports have **no public effect** until a finding is published, so mass reporting can only consume moderator time. Defenses: quotas, duplicate and coordination flags for staff, verifiable on-chain evidence preferred, penalties and restrictions for abusive reporting. Post-V1 community signals follow the weak-tier rules.

### 5.16 Verification (Post-V1)

Projects claim profiles and verify **specific claims** (DNS TXT, authority signatures, documents). Claims expire and are re-checked. "Verified" never means "safe". No embeddable badges.

### 5.17 Project and developer history (V1)

Project timeline (revisions, official address changes, findings, responses, appeal outcomes); deployer history as `chain_fact`. No personal identity attribution.

### 5.18 Responses, corrections and appeals ([moderation design §6–§9](docs/design/moderation.md#6-standing))

- **Correction request:** anyone with an account, no standing needed.
- **Standing** (per case, time-scoped) through any of:
  1. a fresh wallet signature;
  2. an authority signature for contracts, mints and programs, checked against a finalized chain read;
  3. a DNS TXT record for domains;
  4. **staff-assisted documentary standing** for lost keys, drained or compromised wallets, former employees, ownership transfers, contract migrations, organization representatives, smart-contract wallets and wallets that cannot sign messages;
  5. correction requests, which need no standing.
  Standing proves control or authority at a time, not identity or innocence.
- **Responses:** plain text, safety-moderated, worded as time-bound control.
- **Appeals:**
  - Filing never hides a finding (it shows "Disputed — under appeal"). Only an emergency suspension removes it from scoring.
  - Severe appeals are decided by a **non-participant** (neither the author nor the approver), internal or an approved external appeal reviewer.
  - If none is available the appeal waits and escalates to the owner after 14 days. **Independence is never relaxed.**
  - Outcomes: upheld, amended (new revision), reversed (correction notice for 90 days; history kept).
  - One level in V1.

### 5.19 Community intelligence (Post-V1)

Outcome-based reputation and leaderboard; anti-sybil, anti-collusion and anti-farming controls.

### 5.20 Investigation workspace (Post-V1)

Private cases with explicit, revocable sharing; "submit as report" copies only the selected items.

### 5.21 Saved research

Deferred to Post-V1 together with watchlists (owner V1 decision).

### 5.22 Notifications (V1)

In-app notices about the user's own reports, standing, responses, appeals and account security, plus security emails. Notifications re-check that their trigger is still current, so obsolete notices are never sent after reversals. **Emails never contain user-generated text or user-supplied links.**

### 5.23 Moderator dashboard (V1)

Queue; case view with sanitized evidence and chain verification status; revision editor; approvals queue (independence enforced); standing decisions; appeals; emergency suspension; conflict declarations.

### 5.24 Admin dashboard (V1, minimal)

- **Staff lifecycle:** invitations, two-person role approvals, suspensions, offboarding, recovery cases.
- **Users:** suspension and restoration.
- **Content:** projects, labels, signal suppressions with rationale.
- **Audit:** log viewer.

Dangerous actions require action-bound WebAuthn step-up. There is no impersonation feature. Bootstrap and break-glass exist only as operator CLI commands.

### 5.25 Audit logs (V1)

Consequential account, security, staff, role, moderation, revision/approval/publication, standing, evidence, suppression, configuration and operator actions are recorded.

What this protects against, stated honestly:

- The application cannot alter the records.
- A hash chain detects accidental or partial alteration.
- A complete rewrite by someone with database-administrator access is **not** prevented. An independent checkpoint is decided with hosting (O-13).

### 5.26 AI-assisted research (Future)

Labelled `ai_observation`; weak tier; suggestions to humans only; untrusted inputs.

### 5.27 Cross-chain roadmap

V1: Solana + Ethereum mainnet. Post-V1: Base, Arbitrum, BNB Chain, Polygon via the registry. Future: bridge-aware tracing. Chains stay separate subjects.

### 5.28 Public API roadmap (Future)

Versioned endpoints, scoped hashed keys, quotas, separate non-cookie authentication, terms.

---

## 6. Non-functional requirements

### 6.1 Privacy

- **Private by default (reconfirmed):** email and account details; sessions; security events; draft and pending reports; reporter identity; unpublished evidence and all originals; standing claims; private wallet/account links (when introduced); watchlists, private labels and investigations (when introduced); moderator internal notes and individual identities; research activity.
- **Public blockchain data does not make a user's research public.**
- Data minimization (IP prefixes, device summaries); no third-party analytics on account or auth pages; telemetry without research terms tied to identity.
- Retention follows a counsel-approved map (draft in ARCHITECTURE.md §25.3). Pseudonymization is not assumed to be erasure.

### 6.2 Security

Governed by [THREAT-MODEL.md](THREAT-MODEL.md) and the design documents.

### 6.3 Anti-abuse

Rate limits and quotas on costly or user-generated actions; edge bot management; human verification on suspicious auth activity; reports inert until reviewed.

### 6.4 Responsive design and accessibility

Desktop, laptop, tablet and mobile browsers (latest two versions of evergreen browsers; iOS Safari 17+). Mobile-first; WCAG 2.2 AA; dark and light themes.

### 6.5 Performance budgets (validated in staging)

| Metric | Target |
|---|---|
| LCP, public profile, 4G mobile | < 2.5 s p75 |
| API p95, cached / DB-only reads | < 300 ms |
| First profile section (uncached, provider-dependent) | < 2.5 s p95; slower sections stream |
| Login p95 (including Argon2id) | < 700 ms |

### 6.6 Reliability

Graceful provider degradation with "as of" times; never stale-as-current. 99.5% monthly availability target for research and auth. Database RPO ≤ 15 min, RTO ≤ 4 h. Idempotent, revision-checked jobs.

### 6.7 Content and legal standards

- Neutral, factual language.
- Methodology, terms and privacy pages.
- **Qualified legal review is a pre-launch blocker** (owner decision). Blacklist must not launch publicly with unresolved high-risk publication or legal questions.
- These documents make **no legal conclusions**. The open legal questions are in §10.1.

---

## 7. User journeys (V1)

1. **Pre-transaction check:** paste an address → chain shown explicitly → profile with band, explanation, findings, disclosures and freshness → decide.
2. **Victim report:**
   - `/register`, enter email → link → choose handle and password.
   - Private report with screenshots and transaction hashes → status updates.
3. **Moderation:**
   - The moderator authors a finding revision (sanitized images, verified transactions).
   - Non-severe: the author self-approves it and it becomes public automatically. Severe: an independent moderator approves that exact revision, which makes it public automatically.
   - The assessment updates.
4. **Affected party without keys:** a drained victim submits documentary evidence → a standing reviewer grants standing → appeal → a non-participant decides → outcome published.
5. **Staff onboarding:** admin invites → invitee enrolls a password and two authenticators → (admin role) a second admin approves → staff powers are active only after WebAuthn on each login.

---

## 8. Scope control rules

- Changes to V1 require an owner-approved ADR.
- Additions that create public user-generated content (comments, votes, public lists, profiles with links) are **not small**; they are out of scope by default.
- Additional chains need a registry entry, a finality policy, provider coverage per capability, fixtures and tests.
- Deferred features are not built "for later": no tables or endpoints for them in V1.

---

## 9. Success criteria

| Criterion | V1 target |
|---|---|
| Explainability | 100% of displayed assessments have factor explanations; replay tests reproduce historical results |
| False-positive control | Zero Severe bands without an independently approved severe finding (invariant tests); zero public effects from unreviewed reports |
| Redress | Every subject type has a standing path; severe appeals decided by non-participants |
| Moderation latency | Median submission-to-first-action < 72 h (staffing-dependent) |
| Decision quality | Appeal reversal rate tracked; > 10% triggers policy review |
| Privacy | Zero private-data exposure incidents |
| Account security | R-01 adversarial suite green; zero tokens in queue/log inspections; staff WebAuthn coverage 100% |
| Provider independence | Failover tested; snapshot-bound verification for evidence |
| Performance and reliability | Budgets met; restore rehearsed before launch |

---

## 10. Product decisions

### 10.1 Status

| # | Decision | Status |
|---|---|---|
| P-1 | Password minimum | **Decided (owner):** 15 code points for password-only accounts; max 128 code points / 512 bytes; NFKC; no truncation |
| P-2 | Public pending-report counts | **Decided (owner):** not shown; unreviewed reports have no public effect |
| P-3 | Search-engine indexing of address/transaction pages | Open. Recommendation: `noindex` for address and transaction pages in V1; index methodology and reviewed project pages (robots is not access control) |
| P-4 | Second approval when staff are scarce | **Decided (owner):** never relaxed; severe not published until independently approved |
| P-5 | On-chain movement alerts | **Decided (owner):** deferred |
| P-6 | Sanctions (OFAC) data | **Deferred** until qualified legal review; when activated, an attributed badge only, with no numeric effect |
| P-7 | Evidence and report retention after account deletion | Open; counsel. Draft map in ARCHITECTURE.md §25.3 |
| P-8 | Legal review | **Decided (owner): pre-launch blocker.** Open questions for counsel: launch jurisdictions and audiences; defamation exposure and classification wording; allegation, response and takedown handling; evidence redaction and retention; privacy-law applicability (GDPR/UK GDPR and others) and lawful bases; sanctions interpretation and publication; reporter protection; terms of service |
| P-9 | Individual moderator identities on findings | Open. Recommendation: not shown publicly ("Blacklist moderation team") |
| P-10 | Data export / DSAR | Open; applicability decided with counsel; export and deletion designed early |
| P-11 | Public display of the numeric score | **Decided (owner 2026-10-04):** V1 public display = risk band + explanation (factors, evidence, confidence, coverage, freshness, dispute state). No public numeric score; reconsider after calibration |
| P-12 | Staffing for independence | **Open (owner).** An author plus an independent approver to publish severe findings, and a third person (internal or approved external appeal reviewer) for severe appeals |
| P-13 | Break-glass procedural control | **Open (owner).** Decide whether deployment-config access and production-shell access are held by different people, or whether a documented second-person approval precedes break-glass. Otherwise break-glass is a single-person action mitigated only by audit and review |
