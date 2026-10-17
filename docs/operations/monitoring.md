# Runbook: monitoring and alerts

| Field | Value |
|---|---|
| Prepared by | Claude, 2026-10-17 (Phase 11, workstream 3) |
| Status | **Proposal.** Nothing is set up yet. Signing up for a monitoring service is the owner's choice |
| Launch checklist item | "Uptime monitoring and alerts … with a named person who receives them" |

## What can be checked

| Part | Address to check | A healthy answer |
|---|---|---|
| Website (Vercel) | `https://blacklist-web-eta.vercel.app/` | The home page loads (status 200) |
| API (Render) | `https://<api service>.onrender.com/healthz` | `{"status":"ok"}`. It also checks the database |
| Worker (Render) | `https://blacklist-staging-worker.onrender.com/healthz` | A 200 reply. It also checks the database |

These three addresses are public on purpose. They reveal nothing except "working" or "not working". They need no password or token, so **never** put any secret into a monitoring service.

## The catch on free plans: checks keep things awake

On the free plans, Render services fall asleep after about 15 minutes without visitors, and Neon's database pauses too. A monitor that checks every few minutes keeps them awake all the time, which uses up the monthly free allowances much faster. That concern was raised earlier as review item CR-04.

So the advice is different for staging and for production:

| | Staging (now, free) | Production (later) |
|---|---|---|
| Website | Check every 5 minutes. Vercel doesn't sleep, so this costs nothing | Same |
| API | **Don't** check automatically. Open `/healthz` yourself when testing | Check every 1–5 minutes. Production must not sleep, which means a paid plan (O-4) |
| Worker | **Don't** check automatically | Check every 1–5 minutes |
| Database | Covered by the API and worker checks | Also turn on Neon's own usage alerts |

## Setting up the website check (staging, optional, free)

Any free uptime service works. UptimeRobot and Better Stack are common; both have free plans with email alerts. Signing up creates an outside account, so it's your decision.

1. Create an account with the monitoring service, using your own email.
2. Add a new monitor of type **HTTP(s)**.
3. Address: `https://blacklist-web-eta.vercel.app/`. Interval: **5 minutes**.
4. Alert contact: your email.
5. Save. You should get an email if the site is down for more than a few minutes.

## When an alert arrives

1. Open the address that failed in your browser.
2. If it loads after waiting up to a minute, it was probably waking up. Nothing to do.
3. If it still fails:
   - **Website:** check Vercel → the project → **Deployments**. Is the latest one marked "Ready"?
   - **API or worker:** check Render → the service → **Events** and **Logs**. Look for a failed deploy or repeated `request_failed` lines.
   - **Database:** check Neon → the project. Is it over a usage limit?
4. Tell Claude: what failed, when, and the log lines around that time. Copy log lines only; **never** copy settings or secrets.

## Production (when O-4 is decided)

Production needs:

- the API and worker on plans that don't sleep;
- checks every 1–5 minutes on all three addresses;
- alerts going to at least two people;
- a written decision on who responds, and how fast.

These are part of the production setup (Phase 11 plan, workstream 9).
