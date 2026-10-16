# Blacklist — Threat Model

| Field | Value |
|---|---|
| Status | **Revision 3** (2026-10-04), with implementation notes through Phase 8 appended below |
| Author | Claude (primary engineer) |
| Reviewer | Codex: review and re-review 2026-10-04 (APPROVED AFTER ADDITIONAL REQUIRED FIXES); revision 3 awaits the final closure check |
| Last updated | 2026-10-15 (status notes; see the Phase 7–8 review) |
| Related | [ARCHITECTURE.md](ARCHITECTURE.md) (§8–§11, §14, §15, §22–§26), [identity](docs/design/identity.md), [moderation](docs/design/moderation.md), [chain-data](docs/design/chain-data.md) designs, [data model](docs/data-model.md) |

This threat model is written **before** implementation so that mitigations are designed in, not bolted on. Every feature PR that touches a listed asset must state which threats it affects (see AGENTS.md). Update this document when trust boundaries, assets or mitigations change.

---

## 1. Scope and method

- **Scope:** web app, API, worker, PostgreSQL, object storage, email, blockchain providers, CI/CD and repository, staff operations.
- **Method:** asset-centric analysis + STRIDE per trust boundary + abuse cases specific to an anti-scam platform (the platform itself is a target and a weapon).
- **Ratings:** Impact and Likelihood on High / Medium / Low, assessed for a public launch with the V1 design in place *before* mitigations (inherent). Residual risk is noted where it remains meaningful.

## 2. Assets

| Asset | Why it matters |
|---|---|
| A1 User accounts & sessions | Takeover exposes private research and lets attackers act as the user |
| A2 Staff accounts | Can publish findings, see private evidence, change roles — highest-value target |
| A3 Private user data | Emails, sessions, draft and pending reports, reporter identities, standing claims, research activity; later watchlists, labels, investigations, wallet links |
| A4 Evidence (originals) | May contain victims' personal data; integrity underpins findings |
| A5 Findings, labels, risk scores | Public claims with reputational and legal consequences; integrity is the product |
| A6 Audit log | Accountability. Application-level tampering must be prevented and partial alteration detected (ARCHITECTURE §23; not immutable against DB administrators) |
| A7 Secrets | DB credentials, `BETTER_AUTH_SECRET` (session-cookie signing), provider keys, storage keys, SMTP credentials, internal API token |
| A8 Platform availability | Users rely on checks before transactions |
| A9 Provider budget | Cost-exhaustion target |
| A10 Brand trust | Impersonation of Blacklist harms users directly |

## 3. Trust boundaries

| # | Boundary | Untrusted side |
|---|---|---|
| B1 | Browser ↔ Edge | Everything from the browser, including headers and wallet responses |
| B2 | Edge ↔ web/api | Forwarded headers unless from the configured edge |
| B3 | web (SSR) ↔ api | Trusted only with valid internal token; still subject to session auth |
| B4 | api/worker ↔ PostgreSQL | DB enforces grants/constraints as last line |
| B5 | api/worker ↔ object storage | Stored content is untrusted (user uploads) |
| B6 | worker ↔ blockchain providers | Provider responses are untrusted data |
| B7 | worker ↔ uploaded files | Hostile content (malware, polyglots) |
| B8 | Staff ↔ admin/moderation functions | Staff are trusted but fallible and targetable |
| B9 | Developers/agents ↔ repository & CI | Supply chain, secret exposure |
| B10 | Email channel | Attacker-controlled mailboxes, link scanners |

## 4. Threat actors

| Actor | Motivation | Capability |
|---|---|---|
| Scammers / drainer operators | Remove or prevent flags; flag competitors; phish users | Funded, organized, sybil accounts, forged evidence, legal threats |
| Credential attackers | Account takeover at scale | Leaked credential lists, botnets, AiTM phishing kits |
| Harassers / brigaders | Target individuals or projects | Many accounts, coordination |
| Competitors | Manipulate project scores | Moderate resources |
| Malicious insiders | Bribery, revenge, curiosity | Staff privileges |
| Supply-chain attackers | Mass compromise via dependencies | Compromised maintainers, typosquats, worms |
| Opportunistic scrapers/bots | Data harvesting, cost exhaustion | Distributed IPs |
| Nation-state / sanctioned actors | Avoid exposure | High |

## 5. Assumptions

- TLS terminates at a reputable edge provider; the hosting platform's secret store and managed Postgres are trustworthy.
- Staff devices may be compromised; staff can be phished.
- Blockchain providers can be wrong, stale, unavailable, or (rarely) compromised.
- Every user-supplied byte (text, files, URLs, wallet responses, headers) is hostile until validated.

---

## 6. Threat register (summary)

| ID | Threat | Impact | Likelihood |
|---|---|---|---|
| T-01 | Account takeover | High | High |
| T-02 | Credential stuffing | High | High |
| T-03 | Brute force | Medium | High |
| T-04 | Session theft | High | Medium |
| T-05 | Password reset abuse | High | Medium |
| T-06 | Account enumeration | Medium | High |
| T-07 | CSRF (incl. login CSRF) | High | Medium |
| T-08 | XSS | High | Medium |
| T-09 | SQL injection | High | Low |
| T-10 | SSRF | High | Medium |
| T-11 | IDOR | High | High |
| T-12 | Broken authorization / privilege escalation / mass assignment | High | Medium |
| T-13 | API abuse | Medium | High |
| T-14 | DDoS | High | Medium |
| T-15 | Rate-limit bypass | Medium | Medium |
| T-16 | Bot abuse | Medium | High |
| T-17 | Staff MFA bypass via AiTM phishing | High | Medium |
| T-18 | Pre-account takeover, incl. attacker-chosen credential activation (R-01) | High | Medium |
| T-19 | Open redirect | Medium | Medium |
| T-20 | Clickjacking | Medium | Low |
| T-21 | Session fixation | High | Low |
| T-22 | Cookie tossing / subdomain takeover | High | Low |
| T-23 | Provider cost exhaustion | Medium | Medium |
| T-24 | Email link prefetch / token leakage via Referer & logs | Medium | Medium |
| T-25 | Sybil accounts | High | High |
| T-26 | Fake reports | High | High |
| T-27 | Mass reporting | High | Medium |
| T-28 | Brigading / coordinated campaigns | High | Medium |
| T-29 | Harassment and doxxing through reports/responses | High | Medium |
| T-30 | Reputation manipulation (Post-V1) | Medium | Medium |
| T-31 | Risk-score manipulation | High | High |
| T-32 | Malicious uploads (polyglots, active content) | High | Medium |
| T-33 | Malware in evidence | High | Medium |
| T-34 | Forged screenshots | Medium | High |
| T-35 | Forged evidence (general) | High | Medium |
| T-36 | Malicious URLs | High | High |
| T-37 | Phishing (impersonating Blacklist / via Blacklist) | High | High |
| T-38 | Wallet-signature abuse | High | Medium |
| T-39 | Signature replay | High | Medium |
| T-40 | RPC/provider compromise | High | Low |
| T-41 | Incorrect provider data | High | Medium |
| T-42 | Provider outages | Medium | High |
| T-43 | Dependency / supply-chain attacks | High | Medium |
| T-44 | Secret leakage (runtime, logs, client bundles) | High | Medium |
| T-45 | GitHub secret exposure | High | Medium |
| T-46 | Admin compromise | High | Medium |
| T-47 | Moderator abuse | High | Medium |
| T-48 | Insider threats (operators/developers) | High | Low |
| T-49 | Audit-log tampering | High | Low |
| T-50 | Privacy leakage | High | Medium |
| T-51 | Scraping | Medium | High |
| T-52 | Notification abuse | Medium | Medium |
| T-53 | Verification abuse / badge laundering (Post-V1) | High | Medium |
| T-54 | Prompt injection against AI features (Future) | Medium | High |
| T-55 | Address poisoning of Blacklist users | High | Medium |
| T-56 | Legal / takedown weaponization | High | Medium |
| T-57 | Data loss / destructive attack (ransomware) | High | Low |

---

## 7. Threat details

### Identity and sessions

#### T-01 Account takeover
- **Threat:** Attacker gains control of a user account via stolen credentials, phishing, session theft, reset abuse or email compromise.
- **Impact:** High — private drafts and reports exposed; reports, responses or appeals filed in the victim's name (standing is still proven per case, so no address standing is gained).
- **Likelihood:** High (crypto users are heavily targeted).
- **Mitigation:** Email-first registration (no credential before mailbox proof, T-18); Argon2id; breach checks; durable throttling (T-02/T-03); `__Host-` HMAC-signed session cookies with database revocation; session list + revoke; security notices; member re-auth for sensitive changes; 72-hour cooling period after reset; staff use dedicated accounts with ≥ 2 WebAuthn authenticators, and WebAuthn is required even for staff password reset; wallet signatures never grant access. Member passwords need at least 12 code points (staff 8 beside two WebAuthn authenticators; ADR 0016, amended 2026-10-16). While staging holds real people, member sign-up is invite-only (ADR 0019). **Residual:** V1 members have no second factor; member MFA is the first Post-V1 identity item.
- **Detection:** `security_events` anomalies (new IP prefix + sensitive actions, impossible travel heuristics for staff), spikes in resets, user reports via "this wasn't me".
- **Recovery:** Revoke all sessions; force password reset; support-assisted recovery with identity checks; review the audit trail for actions taken and reverse them through new decisions.

#### T-02 Credential stuffing
- **Threat:** Automated login attempts using leaked credential pairs across many accounts.
- **Impact:** High — mass takeover.
- **Likelihood:** High.
- **Mitigation:** Per-IP-prefix and global failure-ratio detection; human verification when thresholds trip; edge bot management; breached-password check forces changes; generic errors; login p95 kept predictable (no timing oracle).
- **Detection:** Failure ratio metric and alert; many distinct emails per IP prefix; ASN concentration.
- **Recovery:** Platform-wide human verification; force resets for accounts with successful logins from the attacking infrastructure; notify affected users.

#### T-03 Brute force
- **Threat:** Repeated password guesses against one account.
- **Impact:** Medium.
- **Likelihood:** High.
- **Mitigation:** 5 failures / 15 minutes → human verification + exponential delay (max 15 min); no permanent lockout (avoids attacker-induced denial of service); minimum password length and breached check; owner notification after repeated failures.
- **Detection:** `auth_throttle` state; per-account failure alerts.
- **Recovery:** Throttle resets on successful login; user prompted to change password if attack persisted.

#### T-04 Session theft
- **Threat:** Stealing session tokens via XSS, malware, network interception, logs, or shared devices.
- **Impact:** High.
- **Likelihood:** Medium.
- **Mitigation:** HttpOnly + Secure + SameSite `__Host-` cookies HMAC-signed with `BETTER_AUTH_SECRET`. **E-1 is accepted with mandatory mitigations M1–M10** (identity §5.5): no bearer, JWT or session-conversion plugin; Better Auth routes not mounted; no authentication from client-supplied raw tokens; no wrapper converting stored tokens into browser authentication; secret outside the DB **and DB backups**, with separate access; token fields never in DTOs; immediate revocation (cookie cache off, DB lookup and security-version check on every request); regression tests for expired, revoked, forged, unsigned, wrong-secret and raw-stored tokens; rehearsed secret rotation; re-evaluation before any library upgrade. Also: strict CSP (HttpOnly prevents reading, not riding); HSTS; staff 30 min / 12 h sessions with WebAuthn assurance. **A DB + secret compromise is an account-session compromise** (rotate, revoke all, bump versions).
- **Detection:** Session used from a new IP prefix/user agent shortly after creation elsewhere (staff alerts); user-visible session list.
- **Recovery:** Revoke sessions; force re-authentication; investigate XSS source if suspected.

#### T-05 Password reset abuse
- **Threat:** Token guessing/reuse/leakage, reset flooding (email bombing), using reset to bypass MFA, or using reset to hijack a compromised mailbox.
- **Impact:** High.
- **Likelihood:** Medium.
- **Mitigation:** **Blacklist-owned** reset tokens (Better Auth reset endpoints unused). Generated by the worker at send time, stored only as hashes, never in jobs, DLQs or logs. Fragment links; 30-minute TTL; **one open token per account**, issued under a per-account lock; redeemable **only after the delivery layer reports `accepted_for_delivery`**, otherwise invalidated before retry. Redemption is **one transaction** (credential, token, all sessions, cooling, security version, audit, notice), so it is all-or-nothing. Staff reset requires WebAuthn. Throttles per email hash and IP prefix; no account lookup in the request path; jobs older than 15 minutes dropped.
- **Detection:** Reset-request rate per account/IP; resets followed by sensitive-action attempts.
- **Recovery:** Invalidate outstanding tokens; restore account through support; notify user.

#### T-06 Account enumeration
- **Threat:** Discovering whether an email has an account via registration, login, reset, email change, or timing differences.
- **Impact:** Medium — targeted phishing of Blacklist users, privacy leak.
- **Likelihood:** High.
- **Mitigation:** Identical responses for register/reset/email-change regardless of existence (owners informed by email instead); generic login errors; dummy hash verification to equalize timing; uniform throttling. Handles are public by design and are not login identifiers.
- **Detection:** High volumes of register/reset attempts with distinct emails from one source.
- **Recovery:** Tighten throttles/human verification; no data to recall.

#### T-07 CSRF (including login CSRF)
- **Threat:** A third-party site causes the browser to perform state-changing requests with the user's cookies, or to log the user into an attacker account.
- **Impact:** High.
- **Likelihood:** Medium.
- **Mitigation:** Single policy ([identity §11](docs/design/identity.md#11-request-origin-and-csrf-policy-single-policy-resolves-r-15)): exact `Origin` equal to `APP_ORIGIN` on every non-safe request, including login, logout, registration, reset and uploads. Missing, `null` or foreign Origin is rejected. No `Sec-Fetch-Site` or `Referer` fallback; same-site is not same-origin. `SameSite=Lax`; JSON-only mutations; no CORS; `GET` never mutates.
- **Detection:** Rejected-origin counter.
- **Recovery:** Fix and redeploy; review affected actions in audit log.

#### T-17 Staff MFA bypass via adversary-in-the-middle phishing
- **Threat:** Phishing proxy relays staff credentials and one-time codes.
- **Impact:** High (staff powers).
- **Likelihood:** Medium (common in crypto sector).
- **Mitigation:** WebAuthn only for staff (origin-bound, UV required); ≥ 2 enrolled authenticators (two registrations do not prove two independent devices, so independent failure domains are encouraged and recovery assumes they may share fate); enrollment and re-enrollment need the emailed token plus an out-of-band enrollment code; no TOTP, SMS or support-code fallback; action-bound step-up; recovery only by two-person re-enrollment with a 24-hour objection window; new-device alerts. Recovery objections (ADR 0013 C) need a step-up and a reason, so one stolen staff session cannot silently block every recovery; repeated objections by one person alert every admin; an objector never verifies or approves the case that resolves their objection; the subject's objection link records an objection and grants nothing else.
- **Detection:** Staff login from new device/region alert.
- **Recovery:** Revoke sessions and factors; re-enrol with verified hardware; audit review of actions.

#### T-18 Pre-account takeover (registration squatting and attacker-chosen credentials)
- **Threat:** An attacker registers the victim's email first and chooses the password, so the victim's later email verification activates an account whose password the attacker knows (Codex review R-01). Variants plant sessions or authenticators before verification.
- **Impact:** High: persistent takeover of the victim's future account and private data.
- **Likelihood:** Medium. This is a well-known class; it affected Better Auth's magic-link/OTP flows (GHSA-qq9h-g4jm-xgf3).
- **Mitigation:** Email-first registration ([identity §4](docs/design/identity.md#4-registration--email-first-activation-resolves-r-01)). `register/start` creates only a registration intent, never a user, credential, session or authenticator. The password is chosen in `register/complete` by the holder of the mailbox token, in the same transaction that creates the account. Only the newest intent is valid. Tokens are generated at send time, hashed, single-use, 30-minute TTL. Better Auth sign-up disabled; no social login or account linking.
- **Detection:** Intent-creation rates per email and IP; completion-failure rates; adversarial tests in CI.
- **Recovery:** Nothing persists before completion, so there is nothing to recover. Suspected compromised accounts follow T-01 recovery.

#### T-19 Open redirect
- **Threat:** `next=` parameters redirect users to phishing sites after login.
- **Impact:** Medium.
- **Likelihood:** Medium.
- **Mitigation:** Only same-origin relative paths that match the route allowlist; reject `//`, backslashes, schemes, encoded variants.
- **Detection:** Rejected redirect counter.
- **Recovery:** Patch validator.

#### T-20 Clickjacking
- **Threat:** Framing Blacklist to trick users into actions.
- **Impact:** Medium. **Likelihood:** Low.
- **Mitigation:** `frame-ancestors 'none'`; COOP.
- **Detection:** CSP violation reports.
- **Recovery:** N/A beyond header fix.

#### T-21 Session fixation
- **Threat:** Attacker plants a known session ID before the victim logs in.
- **Impact:** High. **Likelihood:** Low.
- **Mitigation:** New session token issued at login and MFA completion; `__Host-` prefix blocks subdomain-set cookies; tokens are server-generated only.
- **Detection:** N/A (prevented structurally); tests assert rotation.
- **Recovery:** Revoke sessions.

#### T-22 Cookie tossing / subdomain takeover
- **Threat:** A compromised or dangling subdomain sets cookies or hosts phishing content under Blacklist's domain.
- **Impact:** High. **Likelihood:** Low.
- **Mitigation:** `__Host-` cookies; evidence served from a separate registrable domain; DNS hygiene (no dangling CNAMEs); inventory of subdomains.
- **Detection:** Periodic DNS audit; certificate transparency monitoring.
- **Recovery:** Remove records, rotate sessions.

#### T-24 Email link prefetch and token leakage
- **Threat:** Mail scanners consume single-use tokens; tokens leak via Referer headers, analytics, or access logs.
- **Impact:** Medium. **Likelihood:** Medium.
- **Mitigation:** Tokens travel in URL fragments (never sent to servers, logs, CDNs or `Referer`); confirm pages never consume on GET; POST-only redemption; tokens generated at send time and never placed in queues, logs or error reports; `Referrer-Policy: no-referrer` and no third-party resources on token pages; short TTLs; retries re-issue, so at most one token is valid.
- **Detection:** "Token already used" rates; log-scan tests.
- **Recovery:** User requests a new link.

### Application security

#### T-08 Cross-site scripting (XSS)
- **Threat:** Injected script via user content (reports, profiles, responses), chain-derived strings (token names/symbols, memos), uploaded files, or URL parameters.
- **Impact:** High — session riding, staff action forgery.
- **Likelihood:** Medium.
- **Mitigation:** React escaping; lint ban on `dangerouslySetInnerHTML`; plain-text only user content; chain strings treated as untrusted; nonce-based strict CSP with `object-src 'none'`, `base-uri 'none'`; uploads never served from app origin; SVG/HTML uploads rejected.
- **Detection:** CSP violation reporting; security tests with payload corpus in profiles, reports, token names.
- **Recovery:** Patch, invalidate sessions if staff exposure suspected, audit actions.

#### T-09 SQL injection
- **Threat:** Unparameterized queries built from input.
- **Impact:** High. **Likelihood:** Low (ORM + rules).
- **Mitigation:** Drizzle query builder; raw SQL only via tagged templates with bound parameters; lint rule against string-concatenated SQL; least-privilege DB roles; append-only grants.
- **Detection:** SAST; DB error-rate monitoring; integration tests with injection payloads.
- **Recovery:** Patch; assess data exposure; rotate credentials if needed.

#### T-10 Server-side request forgery (SSRF)
- **Threat:** Making the server fetch internal or attacker-chosen URLs (cloud metadata, internal services).
- **Impact:** High. **Likelihood:** Medium (if fetch features exist).
- **Mitigation:** V1 never fetches user-supplied or metadata URLs (reported URLs are stored as text). DNS TXT standing checks use a controlled resolver; there is no HTTP fetching. Outbound hosts are allowlisted in config and, where possible, at the network layer. Provider URLs come from configuration, never from requests. The evidence processor's egress is limited to object storage. Future fetchers will be isolated with DNS-rebinding protection, private-range blocking, redirect re-validation, timeouts and size caps.
- **Detection:** Egress logs/alerts on non-allowlisted destinations.
- **Recovery:** Disable feature; rotate any exposed credentials.

#### T-11 Insecure direct object reference (IDOR)
- **Threat:** Accessing others' watchlists, reports, evidence, notifications, sessions or investigations by changing IDs.
- **Impact:** High. **Likelihood:** High (most common API flaw).
- **Mitigation:** Owner-scoped repository functions requiring the actor's user ID; composite parent-owner FKs; UUIDv7 IDs; 404 for inaccessible resources; authorization-matrix tests for every route × method × actor; evidence authorized per item and case, never by content hash (no cross-item deduplication in V1); RLS defense in depth later (O-8).
- **Detection:** 404 spikes on private resources per user; tests in CI.
- **Recovery:** Patch; identify affected records from access logs; notify affected users if data was exposed.

#### T-12 Broken authorization, privilege escalation, mass assignment
- **Threat:** Missing permission checks, trusting client-provided roles/owner IDs/status fields, staff functions reachable without MFA, workers bypassing checks.
- **Impact:** High. **Likelihood:** Medium.
- **Mitigation:** Default-deny route policies with a startup assertion; domain-level checks using the same catalog; Zod strips unknown fields; DTO allowlists both ways; code-defined permissions; staff permissions only in WebAuthn-assured sessions; role changes revoke sessions; jobs carry identifiers only and reload authority; least-privilege system actors; Better Auth router not mounted (no undeclared library endpoints).
- **Detection:** Route-policy coverage test; audit of role changes; anomaly alerts.
- **Recovery:** Patch; review audit log for misuse; reverse unauthorized decisions via superseding decisions.

### Availability and abuse

#### T-13 API abuse
- **Threat:** Automated misuse of endpoints (bulk lookups, report spam, upload floods, challenge spam).
- **Impact:** Medium. **Likelihood:** High.
- **Mitigation:** Route-class rate limits; domain quotas; idempotency keys; payload size limits; pagination caps.
- **Detection:** Per-user and per-IP request metrics; quota-hit alerts.
- **Recovery:** Tighten limits; suspend abusive accounts.

#### T-14 Distributed denial of service
- **Threat:** Volumetric or application-layer floods, including expensive-endpoint targeting (search, profiles, password hashing).
- **Impact:** High. **Likelihood:** Medium.
- **Mitigation:** Edge DDoS protection and WAF; caching; argon2 concurrency limiter; provider budgets; graceful degradation; autoscaling policy (deployment-dependent).
- **Detection:** Edge analytics, latency/error alerts.
- **Recovery:** Edge "under attack" modes; temporarily require sign-in for expensive endpoints.

#### T-15 Rate-limit bypass
- **Threat:** Spoofed `X-Forwarded-For`, IPv6 address rotation, distributed IPs, SSR path abuse.
- **Impact:** Medium. **Likelihood:** Medium.
- **Mitigation:** Trust forwarded headers only from configured proxies; SSR client-IP header honoured only with internal token; limits keyed by IPv6 /64 or /48 prefix; per-account limits in addition to per-IP; human verification escalation.
- **Detection:** Diversity metrics (many prefixes, same behaviour).
- **Recovery:** Adjust keys and thresholds.

#### T-16 Bot abuse
- **Threat:** Bots registering accounts, submitting reports, scraping, probing auth.
- **Impact:** Medium. **Likelihood:** High.
- **Mitigation:** Edge bot management; human verification on registration start and throttled auth; registration requires a mailbox round trip before any account exists; reports have no public effect until reviewed.
- **Detection:** Registration velocity, unverified-account ratios.
- **Recovery:** Purge bot accounts; tighten gates.

#### T-23 Provider cost exhaustion
- **Threat:** Attackers drive expensive provider calls (fresh address lookups, deep history) to exhaust budgets or cause rate-limit outages.
- **Impact:** Medium. **Likelihood:** Medium.
- **Mitigation:** Caching and single-flight; bounded windows; anonymous limits lower; per-provider budgets with graceful degradation; spend metrics and alerts.
- **Detection:** Spend and call-volume anomalies.
- **Recovery:** Raise anonymous restrictions; block sources at the edge.

### Community integrity

#### T-25 Sybil accounts
- **Threat:** One actor operates many accounts to amplify reports, corroborations, or reputation.
- **Impact:** High. **Likelihood:** High.
- **Mitigation:** Mailbox-proven registration; human verification under risk; disposable-email heuristics; per-account quotas. In V1 unreviewed reports have **no public effect**, so sybil volume cannot move any public result. Standing is per case and reviewed (no exclusive or permanent wallet links).
- **Detection:** Clustering on registration time, IP prefix, device summary, writing similarity, shared evidence hashes.
- **Recovery:** Mark accounts ineligible; retract their signals; recompute affected assessments; suspend.

#### T-26 Fake reports
- **Threat:** Fabricated allegations against legitimate wallets/projects.
- **Impact:** High (reputational harm, legal exposure). **Likelihood:** High.
- **Mitigation:** Reports private and inert until a staff-authored finding is published; verifiable on-chain evidence preferred; moderator criteria per finding type; severe findings need independent approval; `rejected_abusive` outcome with restrictions.
- **Detection:** Reports with no verifiable evidence; reporter history; subject's response.
- **Recovery:** Reject; retract signals; recompute; restrict reporter.

#### T-27 Mass reporting
- **Threat:** Large volumes of reports against one subject to force a flag or overwhelm moderators.
- **Impact:** High. **Likelihood:** Medium.
- **Mitigation:** No numeric or public effect from report volume; duplicate and velocity flags route bursts to a single case; per-user daily quotas.
- **Detection:** Velocity metrics per subject.
- **Recovery:** Merge, reject, restrict accounts.

#### T-28 Brigading / coordinated campaigns
- **Threat:** Organized groups (e.g. from social media) report or harass a target.
- **Impact:** High. **Likelihood:** Medium.
- **Mitigation:** No public counts, voting or comments; coordination flags for staff; findings require evidence review and staff-authored factual language.
- **Detection:** Burst of new/low-standing accounts on one subject; referral spikes.
- **Recovery:** Freeze signals; mass-reject; communicate via moderation notes.

#### T-29 Harassment and doxxing through reports or responses
- **Threat:** Using reports/responses to publish personal information or harass individuals.
- **Impact:** High. **Likelihood:** Medium.
- **Mitigation:** No personal-identity attributions (product rule); all public text moderated; reporter identity hidden by default; evidence redaction before publication; plain text only.
- **Detection:** Moderation review; PII pattern flags.
- **Recovery:** Unpublish; redact; restrict account.

#### T-30 Reputation manipulation (Post-V1)
- **Threat:** Farming reputation through trivial, duplicate, or colluding contributions; leaderboard gaming.
- **Impact:** Medium. **Likelihood:** Medium.
- **Mitigation:** Reputation only from moderator-decided outcomes; per-subject caps; novelty weighting; collusion-ring detection; negative events for abusive submissions; freeze during investigation.
- **Detection:** Graph analysis of corroboration pairs; reputation velocity.
- **Recovery:** Reverse reputation events (append compensating events); remove from leaderboard.

#### T-31 Risk-score manipulation
- **Threat:** Raising others' scores (dusting from flagged addresses, mass reports, forged evidence, address poisoning) or lowering one's own (fresh addresses, interacting with reputable contracts, fake verification, appeal flooding, bribed suppressions).
- **Impact:** High. **Likelihood:** High.
- **Mitigation:** Incoming transfers and `unknown` authorization never count. **No association signals in V1** (evidence levels + authorization basis, [chain-data design](docs/design/chain-data.md)). No weak signals are active in V1 (the deferred policy forbids them ever adding to strong evidence). Capability facts are zero-contribution disclosures. Severe requires an independently approved severe finding; no verification-based reductions; low-coverage subjects get low confidence or `not_assessed`, never reassurance; appeals never auto-hide; suppressions are audited and visible; ruleset changes go through code review. **Stale or reordered jobs** cannot resurrect reversed findings or overwrite newer assessments (expected-revision checks, compare-and-set pointers; ARCHITECTURE §22.2). History is replayable from immutable input snapshots.
- **Project ranking (ADR 0012):** the public band ranking has no score; it uses each project's highest official-address band, never ranks stale, unavailable, suspended or low-confidence data, and shares ranks within a band, so there is no fine-grained position to game and missing data never reads as low risk.
- **Detection:** Invariant tests (no Severe without severe finding/sanctions); monitoring of suppression volume per staff member; dusting pattern detection.
- **Recovery:** Retract signals; recompute; reverse suppressions via decisions.

### Evidence and content

#### T-32 Malicious uploads
- **Threat:** Polyglot files, HTML/SVG with script, oversized files, decompression bombs, path traversal via filenames, MIME confusion.
- **Impact:** High. **Likelihood:** Medium.
- **Mitigation:** Images only (PNG/JPEG/WebP); streamed size limits; random storage keys; filenames stored as metadata only; magic-byte check; pixel, dimension and frame limits; strict decode and re-encode in an **isolated processor** with no credentials and no network beyond scoped storage URLs, failing closed on decoder errors; derivatives served from a separate registrable domain as attachments with `nosniff`; originals never rendered.
- **Detection:** Rejection metrics by reason.
- **Recovery:** Block blob; purge; review account.

#### T-33 Malware in evidence
- **Threat:** Weaponized PDFs/images aimed at moderators' machines (stepping stone to staff compromise).
- **Impact:** High. **Likelihood:** Medium.
- **Mitigation:** No document formats in V1 (PDF requires a separate isolated-sanitization design and ADR). Images are re-encoded in the isolated processor, so derivatives carry only fresh pixel data. Staff and public see derivatives only; **originals have no UI path** (operator forensic export to an isolated machine only). Antivirus is deferred: it adds little for re-encoded images and is never relied on alone. A decoder exploit is contained in a credential-free, egress-restricted, disposable processor.
- **Detection:** Scan results; endpoint protection on staff devices (operational policy).
- **Recovery:** Block and purge; incident response for exposed staff devices; rotate staff credentials.

#### T-34 Forged screenshots
- **Threat:** Fabricated chats, dashboards, or transaction screenshots.
- **Impact:** Medium. **Likelihood:** High.
- **Mitigation:** Screenshots classified as supporting, never sufficient alone for findings; moderators require verifiable corroboration (on-chain references, multiple independent reporters, official sources); Post-V1 manipulation indicators and perceptual-hash duplicate detection.
- **Detection:** Moderator review; duplicate hashes across unrelated reporters.
- **Recovery:** Reject; penalize; reverse dependent findings via new decisions.

#### T-35 Forged evidence (general)
- **Threat:** Real transactions presented with false context (e.g. claiming an exchange deposit is a scammer wallet), fabricated documents, doctored on-chain explorer pages.
- **Impact:** High. **Likelihood:** Medium.
- **Mitigation:** Transaction references verified by Blacklist against finalized chain data by two independent providers at the same snapshot, with receipts recorded. Explorer screenshots are never accepted as proof of chain facts. Transfers are shown with evidence level and authorization basis, so claims like "this wallet sent…" are checked. Known-service labels shown to moderators; right of reply and appeals.
- **Detection:** Verification mismatches; appeals with counter-evidence.
- **Recovery:** Amend/reverse via decisions; correction notices.

#### T-36 Malicious URLs
- **Threat:** Reported phishing URLs clicked by users or staff; URLs used in profiles/responses to spread phishing.
- **Impact:** High. **Likelihood:** High.
- **Mitigation:** URLs stored as text, displayed defanged and non-clickable by default; interstitial warnings for any outbound link; no auto-linking in user text; no fetching by servers; staff guidance to open in isolated browsers.
- **Detection:** Moderation review; external threat feeds (Post-V1).
- **Recovery:** Unpublish content; restrict account.

#### T-37 Phishing (impersonating Blacklist, or abusing Blacklist channels)
- **Threat:** Fake Blacklist sites/apps asking for seed phrases or signatures; fake "verify your wallet with Blacklist" campaigns; abusing Blacklist emails/notifications to carry phishing links.
- **Impact:** High. **Likelihood:** High.
- **Mitigation:** Persistent "we never ask for seed phrases or transactions" messaging; SIWE messages bound to Blacklist's domain (wallet warnings on look-alikes); emails contain no user-generated text or links; SPF/DKIM/DMARC (`p=reject`) on sending domain; official domains published; no embeddable badges; seed-phrase detector blocks pasting secrets into forms.
- **Detection:** Brand/domain monitoring (Post-V1); user reports; DMARC reports.
- **Recovery:** Takedown requests; public warnings; user notifications.

### Wallet signatures

#### T-38 Wallet-signature abuse
- **Threat:** Tricking users into signing dangerous payloads (permits, transactions) under the guise of verification; misleading signing prompts; Blacklist being used to normalize unsafe signing.
- **Impact:** High (loss of funds). **Likelihood:** Medium.
- **Mitigation:** Only human-readable SIWE/SIWS messages built by the server for a specific case and purpose; statements say no transaction or approval is authorized; `eth_sign`, typed data and transaction signing banned (lint + review); signatures prove control at a time, never identity or innocence.
- **Detection:** Code review checklist; static check for banned RPC method names.
- **Recovery:** Hotfix; public advisory if any unsafe prompt shipped.

#### T-39 Signature replay
- **Threat:** Reusing a signature captured from another site, another purpose, another account, or an expired challenge.
- **Impact:** High. **Likelihood:** Medium.
- **Mitigation:** Server-issued nonces (≥ 96 bits), single use, 10-minute expiry, bound to user, session, purpose, case, chain ID, address and domain/URI; atomic consumption; standing is per case (no reusable link entitlement).
- **Detection:** Rejected-replay counter.
- **Recovery:** Invalidate links created from replayed signatures (would indicate a bug).

### Blockchain data

#### T-40 RPC/provider compromise
- **Threat:** A provider is breached or malicious and returns crafted data (fake transactions, balances, ownership).
- **Impact:** High. **Likelihood:** Low.
- **Mitigation:** Facts behind scoring signals and pinned evidence require agreement from a provider in a **different independence group at the identical snapshot** (EVM block hash; Solana signature + slot; Solana account **context slot**; identical values at different slots are inconclusive). Receipts record chain/cluster, provider, query, parameters, commitment, snapshot, timestamps and digests. Providers are treated as untrusted input (schema validation, size limits); provider URLs never followed; keys scoped.
- **Detection:** Disagreement metrics; sudden data anomalies.
- **Recovery:** Disable provider; re-verify data fetched in the window; recompute affected assessments; correction notices.

#### T-41 Incorrect provider data
- **Threat:** Stale, partial, mislabelled, or reorged data presented as fact.
- **Impact:** High (false positives/negatives). **Likelihood:** Medium.
- **Mitigation:** Finality policy: only finalized data is pinned or scored (pinned tables accept only finalized rows). "As of" display; partial-history disclosure. Different snapshots are reported as inconclusive (never agreement or conflict); a missing same-slot Solana read means verification is unavailable and no scoring signal is created. EVM block-level balance deltas never upgrade individual transfers. Conflicts are excluded from scoring; explorer and provider labels are `external_source`; post-finality invalidations are appended and dependent signals retracted.
- **Detection:** Finality job orphan detection; disagreement metrics; user correction requests.
- **Recovery:** Mark orphaned/conflicted; recompute; correction notices.

#### T-42 Provider outages
- **Threat:** Provider downtime or rate limiting degrades research.
- **Impact:** Medium. **Likelihood:** High.
- **Mitigation:** Multi-provider failover per capability; circuit breakers; cache with "as of"; assessments not recomputed from partial data; graceful section degradation.
- **Detection:** Provider health probes; circuit-open alerts.
- **Recovery:** Automatic failover; manual provider re-prioritization.

### Supply chain, secrets, repository

#### T-43 Dependency / supply-chain attacks
- **Threat:** Malicious package versions (compromised maintainers, worms), typosquats, dependency confusion on `@blacklist/*`, malicious install scripts, compromised GitHub Actions or base images.
- **Impact:** High. **Likelihood:** Medium (repeated npm incidents in 2025–2026).
- **Mitigation:** pnpm `minimumReleaseAge` 7 days, `trustPolicy: no-downgrade`, `strictDepBuilds`, `saveExact`; exact lockfile; frozen installs in CI; minimal justified dependencies; `workspace:` protocol for internal packages; Actions pinned to SHAs; base images pinned by digest; OSV scanning; SBOM; update bots respecting release age; CI secrets unavailable to untrusted PRs. The authentication library has a large advisory history (Better Auth: 22 advisories to date), so it runs headless with no plugins, its router unmounted, its cookie cache and limiter disabled, and versions tracked against advisories.
- **Detection:** OSV/audit alerts; lockfile diff review; unexpected `allowBuilds` changes flagged in review.
- **Recovery:** Pin to known-good versions; rotate all secrets reachable from affected environments; rebuild images; incident review.

#### T-44 Secret leakage (runtime, logs, client bundles)
- **Threat:** Secrets exposed through logs, error messages, client bundles (`NEXT_PUBLIC_`), error-tracking payloads, or SSR responses.
- **Impact:** High. **Likelihood:** Medium.
- **Mitigation:** `packages/config` (api/worker) is server-only; the web server holds only its SSR token in a `server-only` module; `BETTER_AUTH_SECRET` lives only in the secret store (never in the database, backups, logs or client); client-bundle secret scan in CI; log redaction with tests; error-tracker scrubbing; problem+json never includes internals.
- **Detection:** Bundle scan; log scanning for secret patterns.
- **Recovery:** Rotate secret; purge logs where possible; assess exposure.

#### T-45 GitHub secret exposure
- **Threat:** Secrets committed to the repo (including history, issues, PR descriptions, CI logs) or exfiltrated from CI.
- **Impact:** High. **Likelihood:** Medium.
- **Mitigation:** `.gitignore` for env files and key material (not relied on alone); gitleaks pre-commit + CI; GitHub secret scanning + push protection; `.env.example` with placeholders only; agents forbidden from printing secrets; CI uses environment-scoped secrets with required reviewers; no secrets in fork PR workflows.
- **Detection:** Secret-scanning alerts.
- **Recovery:** **Rotate immediately** (history rewriting is not sufficient); audit usage of the leaked secret.

### Staff and insiders

#### T-46 Admin compromise
- **Threat:** Attacker obtains admin session/credentials via phishing, malware, or session theft.
- **Impact:** High. **Likelihood:** Medium.
- **Mitigation:** [Identity §10](docs/design/identity.md#10-staff-account-lifecycle-resolves-r-04) / ARCHITECTURE §9.4: dedicated invitation-only staff accounts; ≥ 2 WebAuthn authenticators; WebAuthn-assured sessions; action-bound step-up; two-person admin grants, elevation and recovery; bootstrap and break-glass by operator CLI only, with no standing super-admin credential (flag + CLI are technical controls, two-person only under the owner's procedural control P-13); no impersonation; audit and decisions not editable; emergency suspension by any admin; alerts on new devices and role changes.
- **Detection:** Staff anomaly alerts; audit review.
- **Recovery:** Revoke sessions and factors; break-glass procedure; review and supersede actions taken.

#### T-47 Moderator abuse
- **Threat:** A moderator publishes biased/bribed findings, suppresses legitimate signals, leaks reporter identities or private evidence.
- **Impact:** High. **Likelihood:** Medium.
- **Mitigation:** Revision-bound approvals: the human roles are author and approver, and **publication is a system transition** caused by an approval of the exact revision and content hash, in the same transaction. Severe and severe-replacement revisions need an independent approver who never authored any revision (replacement approvers are also non-participants of the current public revision). Suspending a severe finding alerts all admins; conflicts are checked at every step; severe appeals are decided by non-participants (internal or external appeal reviewer); emergency suspensions are reviewed within 72 h; suppressions are visible publicly; decision-pattern analytics; least privilege.
- **Detection:** Reversal rates per moderator; unusual evidence-access volume; suppression volume.
- **Recovery:** Revoke role; re-review that moderator's decisions; correction notices.

#### T-48 Insider threats (operators/developers/agents)
- **Threat:** Direct database or infrastructure access used to alter data, read private data, or plant backdoors.
- **Impact:** High. **Likelihood:** Low.
- **Mitigation:** Production access restricted and logged; no shared accounts; migrations via reviewed PRs only; append-only grants; code review (owner + Codex) for security-sensitive paths; AI agents have no production credentials.
- **Detection:** Cloud audit logs; audit-chain verification; DB connection monitoring.
- **Recovery:** Revoke access; forensic review; restore from backups if needed.

#### T-49 Audit-log tampering
- **Threat:** Modifying or deleting audit records to hide actions.
- **Impact:** High. **Likelihood:** Low.
- **Mitigation:** The app role can only append (approved function) and a trigger blocks UPDATE/DELETE, which **prevents application-level tampering**. A hash chain plus a daily verification job **detect** accidental or partial alteration. **A complete rewrite by a database administrator is not prevented or reliably detected** unless an independent checkpoint exists (O-13, decided with hosting). Named, MFA-protected DB administrator access; encrypted backups.
- **Detection:** Chain verification failure alert.
- **Recovery:** Restore from backup/anchors; incident investigation.

### Privacy and data

#### T-50 Privacy leakage
- **Threat:** Private data exposed via public DTOs, search, caching, logs, error messages, notifications, wallet-link disclosure, reporter identity, or evidence metadata (EXIF GPS).
- **Impact:** High. **Likelihood:** Medium.
- **Mitigation:** Private tables separated; public DTO allowlists with contract tests; public assessment explanations reference only published, redacted artifacts; pending reports have no public representation; `no-store` for personalized responses; telemetry uses route templates and never stores search terms or addresses with an actor or session; error-tracker scrubbing; EXIF stripping; reporter identity hidden; erasable actor identity map in audit.
- **Detection:** DTO contract tests; periodic privacy review; bug bounty (Post-launch).
- **Recovery:** Hotfix; purge caches; notify affected users and regulators as legally required.

#### T-51 Scraping
- **Threat:** Bulk harvesting of public research data, findings, or user profiles.
- **Impact:** Medium. **Likelihood:** High.
- **Mitigation:** Public data is public by design, but private data never in public responses; rate limits and edge bot management; profile pages minimal; future public API offers a sanctioned channel with terms.
- **Detection:** Request-pattern analytics.
- **Recovery:** Block at edge; legal terms enforcement.

#### T-52 Notification abuse
- **Threat:** Spamming users via shares/invites/responses that trigger notifications; injecting phishing content into notifications/emails.
- **Impact:** Medium. **Likelihood:** Medium.
- **Mitigation:** V1 notifications concern only the user's own items; payloads contain IDs and static templates; emails contain no user-generated content; notifications re-check that their trigger is still current before sending; Post-V1 invitations require acceptance and are rate-limited.
- **Detection:** Notification volume per source.
- **Recovery:** Disable sender; purge notifications.

### Other

#### T-53 Verification abuse / badge laundering (Post-V1)
- **Threat:** Expired domains re-registered by scammers keep "verified" status; proxies upgraded after verification; scammers advertise Blacklist verification.
- **Impact:** High. **Likelihood:** Medium.
- **Mitigation:** Verified claims expire and are re-checked; code-bound claims tied to bytecode hash; ownership changes revoke claims; no embeddable badges; verification scope always shown; verification never reduces risk.
- **Detection:** Re-check failures; proxy-upgrade monitoring.
- **Recovery:** Revoke claims; notify watchers.

#### T-54 Prompt injection against AI features (Future)
- **Threat:** Malicious text in reports/evidence/token metadata manipulates AI outputs.
- **Impact:** Medium. **Likelihood:** High (once AI exists).
- **Mitigation:** AI has no write permissions or tools that change state; outputs labelled `ai_observation`, capped by Moderate ceiling, reviewed by humans; inputs delimited and treated as data; model/prompt versions recorded.
- **Detection:** Output review sampling.
- **Recovery:** Disable model path; discard observations.

#### T-55 Address poisoning of Blacklist users
- **Threat:** Attackers send zero-value or dust transfers from lookalike addresses so users copy the wrong address from Blacklist's history views.
- **Impact:** High. **Likelihood:** Medium.
- **Mitigation:** Lookalike detection and highlighting; zero-value transfer markers; copy buttons copying the exact canonical address; full-address reveal on hover/tap.
- **Detection:** Lookalike pattern metrics.
- **Recovery:** Improve heuristics; user education.

#### T-56 Legal / takedown weaponization
- **Threat:** Scammers use legal threats, fraudulent takedown notices, or data-protection requests to remove legitimate findings.
- **Impact:** High. **Likelihood:** Medium.
- **Mitigation:** Documented legal-request process (verify authenticity, legal review); evidence retention with legal holds; factual finding language; appeals as the primary correction path; legal counsel before launch.
- **Detection:** Legal-request log.
- **Recovery:** Counsel-guided responses; transparency reporting (Post-V1).

#### T-57 Data loss / destructive attack
- **Threat:** Ransomware, accidental deletion, destructive migration, provider account takeover.
- **Impact:** High. **Likelihood:** Low.
- **Mitigation:** Managed Postgres PITR + periodic logical backups to separate account; object versioning/immutability for evidence; migrations reviewed and forward-only; least-privilege infrastructure credentials with MFA.
- **Detection:** Backup monitoring; anomaly alerts on mass deletes.
- **Recovery:** Restore drill rehearsed before launch (RPO ≤ 15 min, RTO ≤ 4 h).

---

## 8. Security invariants (must be covered by automated tests)

1. No route (any method) is reachable without a declared authorization policy, and no Better Auth HTTP endpoint is mounted.
2. Private resources are never returned to non-owners; non-owner access returns 404.
3. Public DTOs never contain email, IPs, session data or token fields, reporter identity, draft or pending report data, unpublished evidence, standing claims, internal moderation references, or the **numeric risk score**. Public assessment explanations reference only published, redacted artifacts.
4. Registration, reset, email-change and invitation tokens are stored only as hashes, never appear in job payloads, dead-letter queues, logs or error reports, and become redeemable **only after `accepted_for_delivery`**. Session authentication follows E-1 mitigations M1–M10: no bearer, JWT or conversion plugin; no raw-token authentication; expired, revoked, forged, unsigned, wrong-secret and raw-stored tokens all fail.
5. No user, credential, session or authenticator exists before a mailbox-token holder completes registration. Tokens work once, for one purpose, before expiry, and only via POST.
6. Staff permissions are unavailable in sessions without WebAuthn assurance. Dangerous staff actions require a valid action-bound step-up. Staff roles exist only on invitation-created staff accounts with ≥ 2 authenticators.
7. No assessment has band `severe` without a public severe finding whose system publication was caused by a valid approval from a distinct, non-author, non-conflicted approver (or an activated authoritative designation).
8. An approval authorizes only the revision and content hash it names; system publication happens only in the approval's transaction. Replacing a public severe revision without independent approval fails.
9. **No weak-tier signal is active in V1.** If a future ADR enables them, they never add to strong evidence and alone never exceed 49.
10. Incoming transfers and transfers with `unknown` authorization never create risk signals. V1 creates no association signals.
11. Unreviewed reports never affect any public output (bands, counts, DTO fields).
12. Delayed or reordered jobs never publish or resurrect non-authoritative state, and never move a current-assessment pointer backwards.
13. Replaying a stored assessment's input snapshot with its stored ruleset reproduces the stored result.
14. The audit log cannot be updated or deleted by the application role, and its hash chain verifies. This is tamper evidence, not immutability against administrators.
15. Evidence originals are immutable and never rendered in any UI. Only PNG/JPEG/WebP are accepted, processed only in the isolated processor, and served only as derivatives from the separate download domain.
16. State-changing requests with a missing, `null` or non-matching `Origin` are rejected.
17. Wallet challenges are single-use and bound to purpose, case, session, chain and address. The code never requests `eth_sign`, typed-data or transaction signatures.
18. Non-final chain data is never pinned or scored. Verification reports `agree` only for receipts at the **identical** snapshot (including the identical Solana context slot) from different independence groups.
19. Severe appeals and standing decisions are never decided by a participant of the finding or a conflicted staff member.
20. Password reset, password change and email change are each a single atomic transition. No state exists in which credentials changed but old sessions remain valid or cooling is missing. Sessions whose `security_version` is stale, or that lack a `session_policy_state` row, are rejected.
21. At most one reset token per account (and one token per other security entity) is redeemable at any time; concurrent issuance or redemption cannot produce two valid tokens or two successful resets.

## 9. Accepted and residual risks

| Risk | Status |
|---|---|
| V1 members have no second factor: a mailbox compromise enables takeover via reset, and private drafts and reports are then readable | Accepted for V1; cooling period; member MFA is the first Post-V1 identity item |
| Session tokens stored plainly by the auth library (HMAC-signed cookies) | **E-1 accepted with mitigations M1–M10** (owner 2026-10-04). DB + secret compromise = account-session compromise |
| Complete audit-log rewrite by a database administrator | Residual until the O-13 independent-checkpoint decision |
| Image-decoder exploit inside the isolated processor | Contained: no credentials, scoped egress, disposable |
| Screenshot forgery cannot be fully detected | Accepted; screenshots never sufficient alone |
| Correlated provider errors across independence groups | Residual; invalidation records and correction notices |
| Defamation and other legal claims | Residual; qualified legal review is a pre-launch blocker |
| Staff shortage delays severe publication or appeals | Accepted by design: independence is never relaxed; escalation to the owner |
| One operator holding both break-glass technical controls | Procedural control P-13 (owner); audit, notification and mandatory review |
| Synced staff passkeys sharing fate | Guidance for independent failure domains; recovery assumes shared fate |
| Out-of-order or duplicate security emails | Only the latest generation is redeemable; the UI explains it |
| Single-region outage | Accepted for V1 |

## 10. When to update this threat model

Update on: new trust boundary (new external service, new fetcher), new user-generated content type, new authentication method, new role/permission, any feature that publishes data, AI features, public API, new chains with different finality/signature schemes, or any security incident.

## 11. Incident response outline (to be expanded before launch)

1. Triage and severity (owner notified for High).
2. Contain (revoke sessions/keys, disable feature flags, edge blocks).
3. Preserve evidence (logs, audit chain, DB snapshots).
4. Eradicate and recover (patch, rotate, restore).
5. Notify (users, regulators where legally required).
6. Post-incident review → ADR/threat-model updates.

## Render/Vercel restricted staging preparation (2026-10-13)

Owner-accepted [ADR0015](docs/adr/0015-staging-database-operator-execution.md) permits temporary, separate Free Render Docker operator phases; Claude independent review remains pending. T-45/T-48/T-49 controls: credential-free immutable build; protected runtime secret file excluded from Docker context/layers; fixed staging host/database/roles and verified native TLS; non-root execution; provisioner removed before migrator/runtime verification phase; no provider keys in either container. Only entrypoint execution can perform work, with bounded child/container lifetimes and no automatic retries. Public health is liveness only, never database success; status requires an independent constant-time checked token and allowlisted counts/flags. An unlinked operator-only Render environment group retains the original role credentials for interruption recovery and must never be linked to applications/builds. Existing API/worker remain suspended, receive only the verified app URL after authenticated proof, and never run DDL. Temporary-service cleanup preserves database/journal/credentials; unexpected populated targets, roles or hashes fail closed. Owner reports no saved payment method; quota exhaustion must stop execution without any upgrade or paid fallback.

The owner selected free Render API and a separate web-hosted worker, Neon PostgreSQL 18 in Frankfurt, Vercel Authentication for the frontend, and Resend HTTPS mail. The owner explicitly accepted authenticated public Neon TLS for restricted staging; this is not a production networking decision. This records authorized infrastructure preparation, not an executed deployment or production-readiness decision. Current provider/account/cost blockers are in [the deployment runbook](docs/operations/render-staging.md).

- **T-07, T-04, T-12:** the Vercel frontend preserves the same-origin `/api/v1` proxy, exact Origin/JSON checks, host-only signed Secure/HttpOnly/SameSite cookies and existing route/domain authorization. A separate staging ingress token restricts the public Render API; it never replaces authentication or grants permissions. Client-supplied staging headers are overwritten and are not returned to the browser. Vercel Authentication must be independently verified before a usable staging deployment is enabled. Public GET/HEAD health exposes only status after a DB probe.
- **T-05, T-18, T-24, T-42:** the worker's Resend adapter uses the existing delivery interface, a fixed HTTPS destination, no redirects, a bounded receipt/time limit and validated accepted-message UUID. Provider errors never activate tokens or expose bodies; the existing SMTP path remains available with its TLS checks. Unit-controlled responses and local mail tests do not prove real provider acceptance, deliverability, tracking or retention; account/sender verification is still required.
- **T-09, T-44, T-45, T-49, T-50:** a separate operator provisions DDL/DML roles; the unchanged seven reviewed migrations run only through the migrator. Runtime credentials remain DML-only, PG18 is required, cloud URL driver overrides are rejected, and TLS certificate/hostname verification is mandatory in the deployment wrappers. The worker gets no cookie signer/internal/staging token; the frontend gets no database credential/signer/mail key. Runtime services must never be configured with operator secrets. Child-process allowlists are configuration hygiene, not OS isolation from a compromised parent process. Raw secret values and private records never enter repository evidence.
- **T-48, T-57:** creating paid services, broadening ingress, changing production Vercel settings, scaling or enabling external telemetry needs separate owner authorization. Free Render services sleep after 15 idle minutes; the optional worker health listener exposes only status after a DB probe, never user actions. Manual test-window wake-up does not guarantee continuous jobs. Neon compute/egress/history limits and provider recovery remain unverified in the actual account. Local logical restore tests do not establish managed disaster recovery. SQL-created roles avoid the privileged Neon console/API role; direct, non-pooler endpoints preserve timeout options and session advisory locks. No automatic keepalive, TLS bypass or production data import is introduced.

No new chain data, uploads, evidence processor, public findings, scoring, appeals backend or mock production success is introduced. Existing moderation/revision/reversal/privacy/provenance/risk invariants and unresolved recovery barriers remain in force. The baseline coverage/dependency/browser failures and independent review remain visible.

## Owner-authorized public foundation exposure — 2026-10-13

For the subsequent SSR repair, a disabled-by-default expiring operator header may disclose only private ingress-peer metadata, forwarding-probe booleans and bounded nonpersistent internal-viewer connection observations on existing safe health/viewer routes. It requires an independent diagnostic key plus the existing internal/staging keys, a maximum30minute fixed deadline, private socket classifier, allowlisted method/path and no-store. No public client IP, raw header, secret, record or new HTTP route; no automatic trust assignment. Private classification never authorizes a caller. Only measured exact peers may be configured after spoofing checks; internal/session/role checks remain unchanged. Remove temporary settings after measurement; expiry remains effective across restarts. See the ingress measurement review and latest handoff for actual results.

The owner explicitly authorized PR8 merge, activation of the existing Free services and removal of project-level Vercel visitor Authentication. The site is now public; this supersedes the earlier restricted-visitor hosting requirement for this deployment only. T-04/T-07/T-12/T-45 protections remain: server-only API ingress/internal credentials, signed host-only cookies, exact-Origin JSON checks, DML-only verified-TLS database, default-deny role/resource/staff/session/version policies and response/log redaction. No actor authority is granted by public website access. Follow-up bounded measurement configured one exact private peer and verified anonymous internal SSR200, with spoofed forwarding rejected and diagnostic settings removed. Unknown changed peers remain fail closed; no broad proxy range or actor authority added. Signed-in identity flows remain untested. Actual health/denial checks and remaining coverage/audit/recovery/sender/log-review limits are recorded in `docs/evidence/2026-10-13-public-foundation-activation.json`. No new business phase or production readiness claim.

## Owner-directed public registration repair — 2026-10-13

ADR0016 records the explicit8code-point owner policy and its smaller minimum password search space. NFKC/128code-point/512byte limits, controls rejection, Argon2id bounds, HIBP and a bundled common-password fallback (currently only 20 entries; review CR-05), mailbox proof, expiry/replay/purpose/revision/security-version/cooling, resource roles and staff WebAuthn remain. Current UI now displays breached/policy password errors without fake success or private account disclosure.

ADR0017 is owner-accepted: after actual committed202registration/forgot responses only, an optional staging/API-only fixed validated public Render health URL receives one asynchronous secretless HTTPS GET, redirects disabled, one in-flight operation/90second cap/shutdown abort. No payload/headers/identity/token, no scheduler/retry/keepalive, no direct API mail delivery or worker actor endpoint; queue/worker remain authoritative. Generic liveness errors only. Existing request throttles/Origin/validation run first. T-03/T-10/T-42/T-48: user-request quota consumption and Free cold starts remain disclosed; health is never delivery acceptance.

## Phase 8 chain research — 2026-10-14 (merged to `main`; research off by default)

- **T-10/T-36/T-40/T-41/T-42:** fixed candidate HTTPS origins and read-method allowlist, redirect refusal, Zod JSON-RPC identity/result/error validation, fatal UTF8, lossless integer tokens, streamed size/deadline limits, sanitized failures, provider credential reflection rejection, bounded retries/circuits/failover. No metadata URI or provider-supplied URL fetch. Mainnet identity is checked; Ethereum state is canonical-block-hash bound; transaction receipts/logs/indices must match. Reorganized reads fail safely. Solana exact signature/slot and returned context slots govern comparison; a lower-bound request is not agreement.
- **T-23/T-13/T-15:** single-process per-key attempt budgets and request concurrency; bounded shared flights/cache/pagination; encrypted authenticated cursors bind provider/network/address/direction/limit/snapshot/expiry and restart on failover without transferring raw provider page keys. Worker RPC allocation remains zero. Restarts reset lifetime quotas; no monthly cost guarantee or independent-source claim. SSR gateway prefix is shared until client-prefix propagation is verified, so current protection can throttle several visitors together. *2026-10-15: fixed in code by verified client-IP forwarding (review CR-01), active once `CLIENT_IP_FORWARDING_TOKEN` is set on web and API. Total RPC budgets now reset per configured window.*
- **T-09/T-11/T-12/T-49/T-50:** only public chain GET/HEAD research reads; internal peers/tokens remain mandatory, no private activity/identity/wallet-link associations in shared caches. Existing account/staff/CSRF/role/resource boundaries are retained. Parameterized repositories write receipts/verification/cache atomically; DB failure returns sanitized503 and rolls back. Append-only grants/triggers and snapshot/finality/digest/independence/pin/transfer guards prevent runtime mutation, fabricated agreement and transfer-row divergence. Privileged full rewrites/provider authenticity are not cryptographically prevented or claimed.
- **T-31/T-35/T-55:** EVM fake/unclassified asset logs remain `observed_log`/`unknown`; direct/delegated/protocol movement authority is separate from direction and fee payer. Token names render escaped and untrusted. No association signal, scam accusation, score computation, finding, auto-pin or zero-findings inference. Unsupported metadata/history/extensions and missing independent verification remain explicit. Public DTOs reject unavailable sections carrying risk verdicts or hidden records.
- **T-43/T-44/T-45/T-48/T-57:** approved pinned server-only SDKs and unchanged supply-chain/security thresholds; provider keys excluded from web/worker/build environment. Source and browser bundles are scanned. Additive new migrations are disposable-PG tested; existing migration bytes retained. No cloud SQL, production-data change, paid plan, automatic preview deployment, merge or live Phase8 rollout. O-3/Claude/provider-plan/credential validation and Phase7 coverage/audit/hosted identity/managed restore blockers remain open; see the implementation report for actual checks.

The owner identified blacklist-web-eta.vercel.app as the intended public site; default deployment lacked backend bindings. Repair uses protected server-only gateway/internal settings with existing staging DB and exact canonical API Origin/RP/worker email links. Optional web canonical-origin redirects validate fixed HTTPS configuration, preserve path/query without resolving caller-selected hosts, exclude APIs/mutations, and use no-store/no-referrer with no fragment in Location. Browser fragment inheritance preserves valid old links; actual expired/replayed tokens are never revived. Auth browser waiting is bounded90seconds for observed Free startup latency, other data requests20seconds. No CORS broadening, unsigned/shared-user cookies, DB/signer/mail/operator keys on web or production-data changes. Claude review and existing coverage/development audit/recovery/launch gaps remain.
