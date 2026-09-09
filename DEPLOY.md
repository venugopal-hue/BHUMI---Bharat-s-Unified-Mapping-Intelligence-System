# BHUMI — Deployment Guide

Stack: **Railway** (API + workers + DB + Redis) · **Cloudflare Pages** (frontend) · **Cloudflare R2** (storage)

---

## 1. Cloudflare R2 — Object Storage

1. Go to **Cloudflare Dashboard → R2 → Create bucket**
   - Create `bhumi-documents`
   - Create `bhumi-models`

2. Go to **R2 → Manage R2 API Tokens → Create API Token**
   - Permissions: `Object Read & Write`
   - Copy the **Access Key ID** and **Secret Access Key**

3. Note your **Account ID** (right sidebar on Cloudflare dashboard)

4. Your R2 endpoint will be:
   ```
   https://<ACCOUNT_ID>.r2.cloudflarestorage.com
   ```

---

## 2. Railway — Backend (API + Worker + Beat + Postgres + Redis)

### 2a. Create the project

1. Go to [railway.app](https://railway.app) → **New Project → Deploy from GitHub repo**
2. Select this repo (`SIH26018`)
3. Railway will auto-detect `railway.toml` and build the **API** service

### 2b. Add database and cache

In the Railway project, click **+ New** and add:
- **PostgreSQL** plugin → Railway auto-sets `DATABASE_URL`
- **Redis** plugin → Railway auto-sets `REDIS_URL`

### 2c. Set environment variables for the API service

In Railway → API service → **Variables**, add:

| Variable | Value |
|---|---|
| `SECRET_KEY` | Generate with `python -c "import secrets; print(secrets.token_hex(32))"` |
| `ENVIRONMENT` | `production` |
| `DEBUG` | `false` |
| `DATABASE_URL` | *(auto-set by Railway Postgres plugin)* |
| `SYNC_DATABASE_URL` | *(change `asyncpg` → `psycopg` in the Railway Postgres URL)* |
| `REDIS_URL` | *(auto-set by Railway Redis plugin)* |
| `CELERY_BROKER_URL` | Same as `REDIS_URL` but with `/1` at end |
| `CELERY_RESULT_BACKEND` | Same as `REDIS_URL` but with `/2` at end |
| `S3_ENDPOINT_URL` | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` |
| `S3_PUBLIC_ENDPOINT_URL` | Same as above |
| `S3_ACCESS_KEY` | R2 Access Key ID |
| `S3_SECRET_KEY` | R2 Secret Access Key |
| `S3_REGION` | `auto` |
| `CORS_ORIGINS` | `https://bhumi.pages.dev` *(add your custom domain later)* |

### 2d. Add Celery Worker service

1. In the Railway project → **+ New → GitHub Repo** (same repo)
2. Go to service Settings → **Build** → set Dockerfile path to `infra/docker/worker.Dockerfile`
3. Set Start Command to:
   ```
   celery -A worker.celery_app worker --loglevel=INFO --concurrency=2 -Q pipeline,publish,learning
   ```
4. Add the **same environment variables** as the API service
   (use Railway's "Reference Variable" feature to share `DATABASE_URL`, `REDIS_URL`, etc.)

### 2e. Add Celery Beat service (scheduler)

Same as 2d but Start Command:
```
celery -A worker.celery_app beat --loglevel=INFO
```

### 2f. Get the API URL

After deploy, Railway gives a public URL like:
```
https://bhumi-api-production.up.railway.app
```
Note this — you need it for step 3.

---

## 3. Cloudflare Pages — Frontend

### 3a. Connect repo

1. Go to **Cloudflare Dashboard → Pages → Create a project → Connect to Git**
2. Select this repo
3. Set **Build settings**:
   - Framework preset: `Next.js`
   - Build command: `cd apps/web && npm install && npm run build`
   - Build output directory: `apps/web/.next`
   - Root directory: `/` *(leave as repo root)*

### 3b. Set environment variables

In Pages project → **Settings → Environment Variables**, add:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://bhumi-api-production.up.railway.app` |
| `NODE_ENV` | `production` |

Set these for both **Production** and **Preview** environments.

### 3c. Add custom domain (optional)

Pages → **Custom domains → Add domain** → enter your domain → Cloudflare auto-configures DNS.

Then update `CORS_ORIGINS` in Railway to include your custom domain.

---

## 4. After first deploy — seed the database

SSH into the Railway API service shell (Railway → API service → Shell):
```bash
python -m bhumi.scripts.seed
```
This creates the default admin user and sample jurisdiction data.

Default admin credentials (change immediately):
- Username: `admin`
- Password: `Bhumi@2026`

---

## 5. Verify everything is working

- API health: `https://<your-railway-api-url>/health` → `{"status":"ok"}`
- API docs: `https://<your-railway-api-url>/api/docs`
- Frontend: `https://bhumi.pages.dev` → should load the login page
- Login with admin credentials → dashboard should show real data (not demo mode)

---

## Local development (no Docker needed)

```bash
# Terminal 1 — Frontend
cd apps/web
npm install
npm run dev

# Terminal 2 — Backend (needs Postgres + Redis running)
cd services/api
pip install -r requirements.txt
uvicorn bhumi.main:app --reload

# Terminal 3 — Worker
celery -A worker.celery_app worker --loglevel=INFO
```

Copy `.env.example` to `.env` and fill in local values.
