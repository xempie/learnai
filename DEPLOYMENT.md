# Acadu - Deployment

## Architecture

```
learnai.data-corner.com.au
        |  DNS (CNAME at Webcentral/Netregistry)
        v
CloudFront E2HNTR9A1BAQ5D  -- ACM cert in us-east-1
        |  https-only to origin
        v
App Runner "acadu"  ------- VPC connector --> RDS PostgreSQL 16 (private)
        |                                        acadu-postgres
        |  image pull
        v
ECR 606196119385.dkr.ecr.ap-southeast-2.amazonaws.com/acadu
```

Everything is in `ap-southeast-2` except the ACM certificate, which CloudFront
requires in `us-east-1`.

### Resources

| Resource | Identifier |
|---|---|
| CloudFront | `E2HNTR9A1BAQ5D` -> `d2mx68beq1nvfg.cloudfront.net` |
| ACM certificate (us-east-1) | `b267d2b2-f9bf-4b88-955e-e7e0998e662a` |
| App Runner service | `acadu` -> `rxenekavaf.ap-southeast-2.awsapprunner.com` |
| ECR repository | `acadu` |
| RDS instance | `acadu-postgres` (db.t4g.micro, PG 16, 20 GB gp3, encrypted) |
| VPC connector | `acadu-vpc` (default VPC, 3 subnets) |
| DB security group | `sg-08c408b786e410015` - 5432 from the VPC CIDR only |
| App Runner SG | `sg-0deb9377c16711bb9` - egress only |
| IAM roles | `AcaduAppRunnerECRAccess`, `AcaduAppRunnerInstance` |
| S3 (old static site) | `learnai-data-corner` - no longer served |

Nothing has the database open to the internet. The instance is marked publicly
accessible so it can be reached from inside the VPC by DNS, but the security
group only admits `172.31.0.0/16`.

---

## How a deploy works

```powershell
docker build --platform linux/amd64 -t acadu:latest .
docker tag acadu:latest 606196119385.dkr.ecr.ap-southeast-2.amazonaws.com/acadu:latest
aws ecr get-login-password --region ap-southeast-2 | docker login --username AWS --password-stdin 606196119385.dkr.ecr.ap-southeast-2.amazonaws.com
docker push 606196119385.dkr.ecr.ap-southeast-2.amazonaws.com/acadu:latest
aws apprunner start-deployment --region ap-southeast-2 --service-arn <arn>
```

`--platform linux/amd64` is not optional. App Runner will not run an arm64
image, and a Mac builds arm64 by default.

CloudFront caches nothing at the default behaviour, so a deploy needs no
invalidation. Only `/_next/static/*` is cached, and those filenames carry a
content hash.

Verify afterwards:

```bash
bash scripts/verify-live.sh https://learnai.data-corner.com.au
```

### Converting the distribution from static to dynamic

Four settings had to change, and three of them fail in ways that look like an
application bug:

| Setting | Was | Now | Symptom if wrong |
|---|---|---|---|
| `DefaultRootObject` | `index.html` | *(empty)* | **`/` returns 404.** CloudFront silently fetches `/index.html`, which the app has no route for. |
| Allowed methods | GET, HEAD | all seven | every API write returns 403 from the edge |
| Cache policy | CachingOptimized | CachingDisabled | sessions cached and served to the wrong user |
| Origin request policy | *(none)* | AllViewerExceptHostHeader | cookies never reach the origin, so nobody stays logged in |

The `learnai-url-rewrite` function is also detached - it appended `index.html`
to pretty URLs, which would mangle API routes. It still exists and is harmless
unless reattached.

`AllViewerExceptHostHeader` rather than `AllViewer`: App Runner rejects a Host
header that is not its own domain.

### Boot sequence

`scripts/start.ts` is the container entrypoint and runs before the server
accepts traffic:

1. Builds the connection string - see below.
2. Takes a Postgres advisory lock, so two instances starting together cannot
   run the same DDL twice.
3. Applies any pending Drizzle migrations.
4. Seeds **only if the `topics` table is empty**. A restart never duplicates
   content or resurrects rows an admin deleted.
5. Releases the lock and starts Next.js.

This is why the image is not a Next.js `standalone` build: standalone traces
only what the request path imports and would drop tsx, the migrator and the SQL
files.

---

## Credentials

No database password is stored in a config file, a task definition, or anyone's
shell history.

RDS was created with `--manage-master-user-password`, so AWS generates the
password and keeps it in Secrets Manager, rotating it on its own schedule. App
Runner injects secrets into the container at runtime by ARN, and
`src/db/connection-string.ts` assembles the URL from the injected JSON plus the
plain host/port/name variables.

| Secret | Purpose |
|---|---|
| `rds!db-...` (AWS-managed) | database master credentials |
| `acadu/auth-session-secret` | session cookie signing key - rotating it signs everyone out |
| `acadu/seed-admin-password` | initial password for `admin@data-corner.com.au` |
| `acadu/seed-learner-password` | the two seeded demo learner accounts |

Read one when you need it:

```powershell
aws secretsmanager get-secret-value --region ap-southeast-2 --secret-id acadu/seed-admin-password --query SecretString --output text
```

Locally, `DATABASE_URL` still works exactly as before and takes precedence.

### Resetting the admin password

The database is only reachable from inside the VPC, so there is no psql session
to fix a lost admin login from. The boot sequence handles it instead:

1. Put the new password in a secret, e.g. `acadu/admin-password-reset`.
2. Add `ADMIN_PASSWORD_RESET` to the service's `RuntimeEnvironmentSecrets`,
   pointing at that ARN, and deploy.
3. The next boot logs `password reset for <email>`.
4. **Remove the variable and deploy again.** Leaving it set re-applies the same
   password on every restart, which quietly undoes any later change.

It only ever updates an existing credential row, so it cannot grant access to
an address that was never provisioned.

### Seeded passwords are not logged in deployed environments

The seed prints the accounts it creates, which is useful locally and dangerous
in production - stdout goes to CloudWatch, where a live admin credential would
persist and remain searchable long after the password itself changed. It now
prints real values only when the passwords are the throwaway defaults already
published in the README.

---

## Not yet configured

The site runs without these; the features they gate are inert rather than
broken.

| Feature | State | To enable |
|---|---|---|
| Email (signup codes, resets) | Logs to stdout instead of sending | Set `SMTP_USER` / `SMTP_PASS` for the data-corner.com.au mailbox. **Needs internet egress - see below.** |
| Google + Cognito sign-in | Dev auth: PBKDF2 hashes in `auth_credentials` | Set `COGNITO_USER_POOL_ID` and friends |
| Stripe | Billing routes return `501 NOT_CONFIGURED` | Set `STRIPE_SECRET_KEY` and the webhook secret |
| Video upload / playback | `USE_LOCAL_UPLOADS=true`, container-local and ephemeral | Create the buckets, add a CloudFront key group, set `USE_LOCAL_UPLOADS=false` |

### The egress constraint

App Runner egress is either "through your VPC" or "straight to the internet" -
never both. It is set to VPC so the service can reach the private database.
The consequence is that the container currently has **no outbound internet
access**, which is why SMTP and Stripe cannot work yet even with credentials.

Three ways out, cheapest first:

1. **NAT instance** (t4g.nano, about US$4/month) in a public subnet, with the
   private route table pointing at it. Cheapest, but a single point of failure.
2. **NAT Gateway** (about US$45/month in ap-southeast-2 plus data). Managed and
   highly available. The standard answer.
3. **Move the database to a managed provider reachable over TLS** (Neon,
   Supabase; US$0-25/month), then switch App Runner egress back to the
   internet and delete the VPC connector, the NAT question, and the RDS bill
   at once. `DATABASE_URL` is the only setting that changes.

Option 3 is the best fit for a pilot at this traffic level.

---

## Cost

Roughly, per month, at pilot traffic:

| | US$ |
|---|---|
| App Runner (1 vCPU / 2 GB, 1 instance) | ~25 |
| RDS db.t4g.micro + 20 GB gp3 | ~15 |
| CloudFront, ECR, Secrets Manager | ~2 |
| **Total** | **~42** |

App Runner bills provisioned memory even while idle, so the floor is real.
Scaling to zero is not something App Runner does.

---

## Environment variables

`.env.example` is the authoritative list. Set in production:

```
DATABASE_HOST / DATABASE_PORT / DATABASE_NAME    # plain
DATABASE_SECRET                                  # injected from Secrets Manager
AUTH_SESSION_SECRET                              # injected from Secrets Manager
NEXT_PUBLIC_APP_URL=https://learnai.data-corner.com.au
USE_LOCAL_UPLOADS=true                           # until S3 + CloudFront signing is set up
PREVIEW_EPISODE_COUNT=2
MIN_COHORT_DISPLAY=5
```

Nothing secret goes in a `NEXT_PUBLIC_*` variable - those are compiled into the
client bundle.

---

## Rolling back

Images are tagged `latest` plus a build tag. To go back:

```powershell
docker pull 606196119385.dkr.ecr.ap-southeast-2.amazonaws.com/acadu:<previous>
docker tag  ... acadu:latest
docker push ...
aws apprunner start-deployment --region ap-southeast-2 --service-arn <arn>
```

The old static S3 bundle is still in `learnai-data-corner` and `deploy.ps1`
still builds it, but `next.config.ts` no longer sets `output: "export"`, so
that path only works by reverting the config first.

Two deploy gotchas observed in practice:

- **Windows PowerShell 5.1 corrupts the ECR login pipe.** `aws ecr
  get-login-password | docker login --password-stdin ...` fails with
  `400 Bad Request` (and the script continues to a doomed `403` push, because
  the login's exit code isn't checked). Run that one login command from Git
  Bash instead, then `./deploy.ps1 -SkipBuild` after pushing manually — or run
  the whole script from pwsh 7+.
- **`NEXT_PUBLIC_*` values are baked into the client bundle at `docker build`
  time** (`NEXT_PUBLIC_FREE_PLATFORM`, `NEXT_PUBLIC_CALCOM_HANDLE`, ...).
  Setting them in App Runner's env at runtime does nothing for client code —
  changing one requires a rebuild and redeploy. Keep the runtime
  `FEATURE_FREE_PLATFORM` and build-time `NEXT_PUBLIC_FREE_PLATFORM` in
  agreement, or the server will paywall content while the client has no
  billing UI to escape it.

---

## Pre-launch checklist

- [x] Migrations applied to the production database
- [x] Seed run once (categories, admin, starter catalogue)
- [x] Admin password is a generated secret, not the documented default
- [ ] Admin password changed after first login
- [ ] Outbound internet for the container (NAT or option 3 above)
- [ ] SMTP credentials set, verification email tested end to end
- [ ] Cognito pool live, Google provider tested end to end
- [ ] Stripe webhook receiving events, replay tested
- [ ] Video upload -> playback tested against real S3 and CloudFront
- [ ] Security headers and CSP nonces enabled
- [ ] WAF attached with managed rule sets and a rate rule
- [ ] Sentry configured with PII scrubbing in `beforeSend`
- [ ] AWS Budget alert at 50/80/100% of the agreed ceiling
- [ ] Real-device smoke test on iOS Safari and Android Chrome
- [ ] 17,000-contact consent audit resolved before any marketing send
