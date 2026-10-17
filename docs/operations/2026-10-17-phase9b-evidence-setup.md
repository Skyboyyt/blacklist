# Runbook: switch on image evidence on staging (Phase 9b)

| Field | Value |
|---|---|
| Prepared by | Claude, 2026-10-17 |
| Decision | [ADR 0020](../adr/0020-phase9b-evidence-hosting-on-staging.md), accepted for staging: **test images only** |
| Who | The owner. About 45 minutes |
| Cost | None if the storage provider's free allowance needs no card (check in Part B) |
| Status | **Not yet done** |

## What you are setting up

- **File storage:** three private folders ("buckets") at Backblaze B2. One holds new uploads, one holds originals, and one holds cleaned copies.
- **The image checker:** a third free Render service, `blacklist-staging-evidence`. It holds **no passwords at all**.
- **Settings:** eight new settings on the Render API, the same eight plus one more on the worker, and a database update in Neon.

**Golden rule:** never paste a key, password or connection string into the chat. Copy them only into the boxes this guide names.

## Order

Do the parts in this order: **A → B → C → D → E → F**. The database update (A) must happen before the API is redeployed (E).

---

## A. Database update (Neon), about 5 minutes

1. Merge the Phase 9b pull request on GitHub first.
2. In Neon, open the project **blacklist-staging**, then **SQL Editor**.
3. At the top, check the branch says **`staging`** and the database says **`blacklist_staging`**. Last time a script went to the wrong branch; check twice.
4. On GitHub, open the file `docs/operations/2026-10-17-apply-0011-evidence.sql` on `main`. Click **Raw**, select everything and copy it.
5. Paste it into the SQL Editor and click **Run**. It should finish without an error.
   - If it says **"already applied; nothing changed"**, it was done before. That's fine.
   - If it says **"ledger is not at the expected 20 entries"**, stop and tell Claude the message.
6. Check it worked. Replace the editor's contents with this and click **Run**:
   ```sql
   SELECT (SELECT count(*) FROM blacklist_migrations.applied) AS ledger,
          (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'blacklist') AS tables;
   ```
   Expected: **ledger 22, tables 80**. Send those two numbers to Claude.

## B. File storage (Backblaze B2), about 15 minutes

1. Go to **backblaze.com**, choose **B2 Cloud Storage**, and sign up with your own email.
   - **Check:** does it ask for a payment card? If it does, stop and tell Claude before adding one.
   - Choose the **EU Central** region if you are asked.
2. Create three buckets. Click **Buckets**, then **Create a Bucket**, three times:

   | Bucket | Name (must be unique worldwide; add your own random letters at the end) | Files in bucket | Object Lock |
   |---|---|---|---|
   | New uploads | `blacklist-stg-quarantine-xxxx` | **Private** | **Off** |
   | Originals | `blacklist-stg-evidence-xxxx` | **Private** | **Off** |
   | Cleaned copies | `blacklist-stg-derivatives-xxxx` | **Private** | **Off** |

   Object Lock stays off on staging: it would stop the automatic clean-up of abandoned test uploads. Production decides this separately.
3. Write down the three names exactly.
4. For each bucket, open **Lifecycle Settings**:
   - **New uploads** bucket: choose a custom rule that **hides files 30 days after upload and deletes them 1 day after hiding**. This clears out leftovers automatically.
   - **The other two buckets:** choose **"Keep only the last version of the file"**, so a deletion really removes the file.
5. Open any bucket's details and find **Endpoint**. It looks like `s3.eu-central-003.backblazeb2.com`. Write down:
   - **endpoint:** `https://` followed by that text, for example `https://s3.eu-central-003.backblazeb2.com`;
   - **region:** the middle part, for example `eu-central-003`.
6. Create a key. Click **Application Keys**, then **Add a New Application Key**:
   - Name: `blacklist-staging`.
   - Allow access to bucket(s): **All**. Your account must contain only these three buckets.
   - Type of access: **Read and Write**.
   - Click **Create New Key**. Backblaze shows a **keyID** and an **applicationKey** once. Keep the page open for Parts D and E. **Don't** copy them anywhere else, and never into chat.

## C. The image checker service (Render), about 10 minutes

1. In Render, click **New**, then **Web Service**, and choose the **blacklist** GitHub repository.
2. Fill in:

   | Field | Value |
   |---|---|
   | Name | `blacklist-staging-evidence` |
   | Branch | `main` |
   | Region | Frankfurt |
   | Runtime | Node |
   | Build Command | `node infrastructure/render/build.mjs processor` |
   | Start Command | `node infrastructure/render/run.mjs processor` |
   | Instance Type | **Free** |
   | Health Check Path | `/healthz` |

3. Under **Environment Variables**, add exactly these five, and **nothing else**:

   | Key | Value |
   |---|---|
   | `NODE_VERSION` | `24.21.0` |
   | `DEPLOYMENT_ENV` | `staging` |
   | `EVIDENCE_STORAGE_ORIGIN` | the endpoint from B5, e.g. `https://s3.eu-central-003.backblazeb2.com` |
   | `S3_BUCKET_QUARANTINE` | your new-uploads bucket name |
   | `S3_BUCKET_DERIVATIVES` | your cleaned-copies bucket name |

   **Do not** add the keyID or applicationKey here. If any password-like setting is present, this service refuses to start, and that's deliberate.
4. Click **Create Web Service** and wait for **Live**.
5. Open `https://blacklist-staging-evidence.onrender.com/healthz` in your browser. Expected: `{"status":"ok"}`. If Render gave the service a different address, use that one and tell Claude.

## D. API settings (Render), about 5 minutes

Open **blacklist-staging-api**, then **Environment**, and add:

| Key | Value |
|---|---|
| `EVIDENCE_ENABLED` | `true` |
| `S3_ENDPOINT` | the endpoint from B5. It must be **exactly the same text** as `EVIDENCE_STORAGE_ORIGIN` in C3 |
| `S3_REGION` | the region from B5 |
| `S3_ACCESS_KEY_ID` | the **keyID** from B6 |
| `S3_SECRET_ACCESS_KEY` | the **applicationKey** from B6 |
| `S3_BUCKET_QUARANTINE` | new-uploads bucket name |
| `S3_BUCKET_EVIDENCE` | originals bucket name |
| `S3_BUCKET_DERIVATIVES` | cleaned-copies bucket name |

Click **Save** (don't deploy yet).

## E. Worker settings (Render), then deploy

1. Open **blacklist-staging-worker**, then **Environment**, and add **the same eight** as in D, plus:

   | Key | Value |
   |---|---|
   | `EVIDENCE_PROCESSOR_URL` | `https://blacklist-staging-evidence.onrender.com` (no `/healthz` on the end) |

2. Save. On the Backblaze page, you can now close the key window.
3. Deploy, in this order:
   1. **blacklist-staging-api**: **Manual Deploy**, then **Deploy latest commit**. Wait for **Live**.
   2. **blacklist-staging-worker**: the same.
   3. **Vercel:** open your project, then **Deployments**, and redeploy the newest `main` deployment (the website changed too).

## F. Test it, about 10 minutes

1. Make a **test image**, for example a screenshot of an empty page. Not a real victim's screenshot: staging takes test images only.
2. Sign in as a **member** (not your staff account) and open `/reports/new` (the "Report a scam" page; also reachable from **Reports → New report**).
3. Fill in the form. Under **Screenshots**, choose your test image. It should say **Uploaded** after a moment.
4. Submit the report.
5. Wait **about 2 minutes**. The worker and the image checker may need to wake up.
6. Sign in as **staff** and open the new case in the moderation queue. Under evidence, the image should show **"Cleaned image W×H"** and a **Download cleaned image** button.
7. Click the button. A cleaned copy of your image should download.
8. **One more test:** upload a test image **larger than 5 MB** (a big photo). Tell Claude whether it said **Uploaded** or **"too large to upload"**. This checks whether Vercel limits upload size.

Tell Claude what you saw at steps 3, 6, 7 and 8.

## If something goes wrong

| What you see | Likely cause | What to do |
|---|---|---|
| The upload box says "Image uploads are not available yet" | `EVIDENCE_ENABLED` not set, or the API not redeployed | Check D, redeploy the API |
| The image stays "being checked" for more than 10 minutes | The worker can't reach the checker or storage | Render, then the worker, then **Logs**: look for lines starting `processor_` or `storage_`, and send them to Claude (they contain no secrets) |
| The image says "not accepted" | The checker refused the file | The staff view shows the reason; try a plain PNG screenshot |
| The checker service won't start, with `processor_must_not_hold_secrets` | A password-like setting was added in C3 | Remove it; keep only the five in C3 |
| The API won't start | A storage setting is missing or mistyped | Check all eight in D; the log names the field, never its value |

## Afterwards

Claude records the results in the launch checklist and AI_HANDOFF. To switch images off again at any time, set `EVIDENCE_ENABLED` to `false` on the API and worker and redeploy. Nothing is deleted.
