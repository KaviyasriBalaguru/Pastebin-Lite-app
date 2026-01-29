# Pastebin-Lite (Next.js + Serverless-friendly storage)

Pastebin-Lite is a minimal Pastebin-like web app that lets you create text pastes and share a URL to view them. Pastes can optionally expire via:

- TTL (time-to-live)
- Max view count

Once any constraint is exceeded, the paste becomes unavailable (404).

## Tech stack

- Next.js (Pages Router)
- REST API routes under `/api/*`
- Storage: **Upstash Redis (serverless-friendly)** for production; **SQLite** for local/dev/tests
- Vitest for end-to-end tests

## Environment variables

### Storage selection

- `DB_DRIVER`:
  - `upstash` (recommended for Vercel/serverless)
  - `sqlite` (default in tests; good for local dev)

### Upstash Redis (production)

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

### SQLite (local/dev/tests)

- `SQLITE_DB_PATH` (optional; defaults to `.data/pastebin.sqlite`)

### Test-mode time control

When `TEST_MODE=1`, the app will honor the request header `x-test-now-ms` as the "current time" **only for expiry logic** (creation + validation). If the header is absent, it falls back to system time.

## Running locally

Install dependencies:

```bash
npm install
```

Run with SQLite storage:

```bash
$env:DB_DRIVER="sqlite"
npm run dev
```

Open the app at `http://localhost:3000`.

## Running tests

Tests run end-to-end by starting a Next dev server and calling real HTTP routes:

```bash
npm test
```

## Deployment to Vercel

### Prerequisites

1. **Upstash Redis account** (free tier available):
   - Sign up at https://upstash.com/
   - Create a Redis database
   - Copy `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`

### Deploy via Vercel Web UI (Recommended)

1. Go to https://vercel.com/new
2. **Import Git Repository**: Select `KaviyasriBalaguru/Pastebin-Lite-app`
3. **Configure Project**:
   - Framework Preset: Next.js (auto-detected)
   - Root Directory: `./` (default)
4. **Environment Variables** (add these):
   - `DB_DRIVER` = `upstash`
   - `UPSTASH_REDIS_REST_URL` = (your Upstash URL)
   - `UPSTASH_REDIS_REST_TOKEN` = (your Upstash token)
5. Click **Deploy**

### Deploy via Vercel CLI

```bash
# Install Vercel CLI (if not installed)
npm install -g vercel

# Login to Vercel
vercel login

# Deploy (from project root)
cd "d:\Paste bin"
vercel --prod
```

When prompted, add the environment variables listed above.

### Post-Deployment

After deployment, your app will be available at `https://your-app.vercel.app`

**Test endpoints:**
- `GET https://your-app.vercel.app/api/healthz`
- `POST https://your-app.vercel.app/api/pastes`
- `GET https://your-app.vercel.app/api/pastes/:id`
- `GET https://your-app.vercel.app/p/:id`

## Design decisions (high-level)

- **Business logic in `src/lib/pasteService.ts`**: All TTL/view-limit rules live in one place and are used by both JSON APIs and the HTML view page.
- **Atomic view decrement**:
  - SQLite uses a transaction.
  - Upstash uses an atomic Redis Lua script to avoid negative views and race issues in serverless concurrency.
- **HTML safety**: Paste content is rendered as plain text inside a `<pre>` element (React escapes by default), preventing script execution.

