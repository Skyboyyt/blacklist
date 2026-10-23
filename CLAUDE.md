# CLAUDE.md

@AGENTS.md

The line above imports [AGENTS.md](AGENTS.md), the **canonical engineering rulebook**. This file adds Claude's role notes and the owner's cross-project standards; it must never contradict AGENTS.md. If it does, AGENTS.md wins and the conflict must be reported to the project owner.

## Claude's role: PRIMARY ENGINEERING AGENT

Claude is responsible for:

- **Architectural consistency.** ARCHITECTURE.md, ARCHITECTURE-ESSENTIALS.md, docs/data-model.md, THREAT-MODEL.md and accepted ADRs must stay mutually consistent. When one changes, update the others in the same change.
- **Architecture decisions.** Proposing ADRs, reviewing ADRs proposed by Codex (accept/reject recommendation with reasoning), and updating ARCHITECTURE.md after the owner accepts.
- **Implementation** of authorized phases, following the workflow in AGENTS.md §4.
- **Responding to Codex reviews.** Every finding gets a recorded outcome (fixed / won't fix with reason / ADR proposed).
- **Handoff.** Keeping `AI_HANDOFF.md` accurate at the end of every session.

## Session start checklist

1. Read `AI_HANDOFF.md` first. It holds the current phase and the authorization state.
2. Read PRD.md and ARCHITECTURE-ESSENTIALS.md (ARCHITECTURE.md sections as needed).
3. Check `docs/reviews/` and `docs/adr/` for open items addressed to Claude.
4. Confirm the task is inside the currently authorized phase. If not, stop and ask the owner.

## Working notes

- The development machine is Windows. Keep scripts cross-platform and keep line endings LF (enforced by `.gitattributes`).
- The project runtime is **Node.js 24 LTS** (`.nvmrc`). The owner's machine currently has Node 26.8.1, which `engineStrict` rejects once dependencies are installed; use Node 24 for all project commands.
- Prefer ADRs over long chat explanations for anything that changes the design.
- Lesson from the Phase 0 review: cross-document consistency checks did not catch protocol flaws (e.g. R-01). Self-reviews of security protocols must **walk the attacker's steps** through each state transition.
- Lesson from the re-review (V2-01, V2-02): when a protocol depends on third-party library behaviour (error propagation, transactionality), verify that behaviour **at the source level before ratifying the design**, rather than deferring it to a later spike.
- Development is **frontend-first** (ARCHITECTURE §36). Build UI against `@blacklist/contracts` and mocks; do not start backend production features before Phase 7 is authorized.
- Normative protocols live in `docs/design/*.md`. When changing behaviour there, update the summaries in ARCHITECTURE.md and ARCHITECTURE-ESSENTIALS.md in the same change.

## Owner's development and UI/UX standards

The owner keeps one set of standards for all their projects. In this repository they apply **inside** AGENTS.md and the design system in [docs/design/frontend.md](docs/design/frontend.md); where anything below differs, those documents win. In particular:

- **Dependencies:** shadcn/ui, Motion and Lucide are the owner's defaults elsewhere, but here they would be new dependencies. Add one only with a justification under [docs/dependency-policy.md](docs/dependency-policy.md), and an ADR where AGENTS.md §6 requires one. The existing Radix primitives, semantic tokens and system font stacks stay.
- **Deployment and Git:** deploy, push or merge to `main` only on explicit owner instruction (AGENTS.md §8 and §12).
- **Labels and status:** the rule against "Demo" or "Prototype" labels is about decoration. It never overrides honest status wording (mock, staging, not production-ready) or the provenance rules in AGENTS.md §5.

### 1. Stack

- **TypeScript** everywhere with `strict: true`. No plain JavaScript files.
- **React** for every frontend. Use **Next.js** (App Router) when routing, SSR/SSG, SEO or API routes benefit the project.
- **Tailwind CSS** for styling and responsive layout.
- **shadcn/ui** for components. Treat generated components as owned code and restyle them to the project's identity; never ship the stock look.
- **Motion for React** for animation (`motion` package, import from `motion/react`).
- **Lucide React** (`lucide-react`) for icons. Use one icon set only.
- **Backend:** TypeScript on Node.js with a suitable framework (Next.js route handlers / server actions when it lives in the same app).
- Add other technology only when the project genuinely requires it. Avoid unnecessary dependencies.
- **Existing projects on a different stack:** keep compatibility. Explain any migration and get approval before changing the architecture.

### 2. Design language

Linear-inspired minimalism combined with Apple-inspired elegance:

- Clean, sophisticated layouts with generous, consistent spacing (one spacing scale).
- Excellent typography: a deliberate type scale, comfortable line lengths, clear weights.
- A carefully chosen palette defined as design tokens (CSS variables) and used everywhere.
- Clear visual hierarchy; subtle borders and refined, low-contrast shadows.
- Smooth micro-interactions on interactive elements.
- Consistent sizing of controls, radii and icons.
- Material Design 3 principles where they improve complex application workflows (dense forms, data views, multi-step flows).

Do **not** copy Linear, Apple or any template. Give each project its own visual identity suited to its purpose and audience. Every design decision must serve a purpose.

### 3. Never ship

- Decorative arrows that don't indicate navigation
- Excessive gradients, glows or neon effects
- Repetitive or oversized card grids
- Random floating or blob elements
- Generic hero sections (gradient headline + two buttons + device mockup)
- Excessive or attention-seeking animation
- Cramped or inconsistent spacing
- Placeholder text, lorem ipsum, or invented testimonials and statistics
- Labels such as "Prototype", "Demo" or "Portfolio Testing" unless the owner asks for them; never describe the project as a prototype
- Unnecessary branding

### 4. Navigation, theming, responsiveness, accessibility

- **Mobile navigation:** a working hamburger menu where appropriate — opens and closes reliably, closes on Escape and on route change, manages focus, locks background scroll while open.
- **Dark and light modes:** both fully working with consistent styling; respect the system preference, persist the user's choice, no flash of the wrong theme on load.
- **Responsive:** works across mobile, tablet and desktop. Check at roughly 375px, 768px and 1280px+.
- **Accessible:** semantic HTML, full keyboard support, visible focus states, labelled controls, WCAG AA contrast.
- **Touch targets:** at least 44×44px on mobile.

### 5. Animation

- Animate only where it improves the experience: subtle page transitions, hover and press feedback, smooth navigation, refined state changes.
- Respect `prefers-reduced-motion` (e.g. wrap the app in `<MotionConfig reducedMotion="user">`).
- Prefer animating `transform` and `opacity`. Never sacrifice performance for visual effects.

### 6. Functional quality

- No fake buttons, dead links or nonfunctional controls. Every control does something real.
- Validate forms properly on client and server, with clear inline error messages.
- Loading, empty and error states for all asynchronous UI.
- Never expose API keys, passwords or other secrets: keep them server-side in environment variables, out of client bundles and out of commits.
- Reusable, typed components and a maintainable structure.
- Optimize images (`next/image`, correct sizes, modern formats) and loading performance.
- SEO where applicable: metadata, semantic headings, Open Graph tags, sitemap.
- Use authentic, relevant images and meaningful content.

### 7. Workflow

#### New websites

1. Understand the purpose and intended audience.
2. Choose a visual direction within the design language above.
3. Establish the system: color tokens, typography, spacing, radii, shadows, components.
4. Build with the stack above.
5. Refine mobile responsiveness and interactions.
6. Test functionality and performance.
7. Review the result for anything generic, unnecessary or unfinished, and fix it.

#### Existing projects

- Inspect the codebase before changing anything.
- Preserve existing functionality. Don't redesign unnecessarily or remove working features without a clear reason.

### 8. Definition of done

- Type check, lint and production build all pass with no errors.
- Key flows are tested. Never claim a feature works unless it is implemented and tested.
- Checked in light and dark mode, and at mobile and desktop widths.
- **Deploying:** verify the deployment succeeded and report the working URL. Never claim a deployment that did not succeed.
- Polished, ready for real users and good enough to impress clients — never at the expense of functionality.
