# Production Environment Variables

This document lists all environment variables required for production deployment of the Price Monitor AI Agent.

## Overview

Environment variables are set in the Coolify dashboard for each application:
- **Web Application:** Contains UI and API (Next.js, public-facing)
- **Worker Application:** Processes background jobs (BullMQ consumer)
- **MCP Server Application:** Exposes typed tools to the chat agent over HTTP (internal-only, no public domain)

**Important:** Do NOT commit sensitive values to the repository.

---

## Required Variables

### Database Configuration

#### DATABASE_URL

**Description:** PostgreSQL connection string for production database

**Format:** `postgresql://<username>:<password>@<host>:<port>/<database>`

**Production Value (Coolify Internal DNS):**
```
postgresql://postgres:STRONG_PASSWORD_HERE@price-monitor-postgres-prod:5432/priceMonitor
```

**Notes:**
- Use Coolify internal DNS name, not IP address
- Password should be strong (20+ characters, mixed case, numbers, symbols)
- Generated automatically by Coolify, or set custom password

**Where to Set:**
- Coolify → Web App → Environment Variables
- Coolify → Worker App → Environment Variables

#### pgvector Extension (Semantic Search / RAG)

Semantic product search (Phase 4) stores vector embeddings in Postgres using the
[`pgvector`](https://github.com/pgvector/pgvector) extension. The database image
must ship the extension and the extension must be created once in the
`priceMonitor` database.

**Local development** (`docker-compose.yml`):
- Image is `pgvector/pgvector:pg18` (Postgres 18 with pgvector preinstalled).
- `scripts/db-init/01-enable-pgvector.sql` runs `CREATE EXTENSION IF NOT EXISTS vector;`
  automatically on a **fresh** data volume. On an existing volume, run it manually:
  ```bash
  docker compose exec postgres psql -U postgres -d priceMonitor -c "CREATE EXTENSION IF NOT EXISTS vector;"
  ```

> **Note on the alpine → pgvector image swap (existing volumes only):** the old
> `postgres:18-alpine` image is musl-based; `pgvector/pgvector:pg18` is glibc-based.
> The data files are compatible (same PG major version), but if the database has a
> **recorded** collation version (`SELECT datcollversion FROM pg_database WHERE
> datname='priceMonitor'` returns non-empty), rebuild indexes once:
> `REINDEX DATABASE "priceMonitor";`. If `datcollversion` is **empty** (the typical
> case for a DB created under the alpine image), Postgres records no version, emits
> no mismatch warning, and no reindex is needed.

**Production (Coolify):**
- The managed Postgres service must use a pgvector-capable image. Switch the
  Coolify Postgres app's image to `pgvector/pgvector:pg18` (same major version as
  prod — 18) so the data files stay compatible.
- After the DB is up, create the extension once:
  ```bash
  psql "$DATABASE_URL" -c "CREATE EXTENSION IF NOT EXISTS vector;"
  ```
- `CREATE EXTENSION` is idempotent (`IF NOT EXISTS`), so it is safe to re-run and
  safe to include in a future Drizzle migration.

---

### Redis Configuration

#### REDIS_URL

**Description:** Redis connection string for BullMQ queue and caching

**Format:** `redis://<host>:<port>`

**Production Value (Coolify Internal DNS):**
```
redis://price-monitor-redis-prod:6379
```

**Notes:**
- Use Coolify internal DNS name
- No authentication required (internal network)

**Where to Set:**
- Coolify → Web App → Environment Variables
- Coolify → Worker App → Environment Variables

---

### AI Provider Configuration

#### AI_PROVIDER

**Description:** Which AI provider to use for price extraction

**Options:** `openai` | `google` | `anthropic`

**Recommended Value:**
```
anthropic
```

**Where to Set:**
- Coolify → Web App → Environment Variables
- Coolify → Worker App → Environment Variables

#### ANTHROPIC_API_KEY

**Description:** API key for Anthropic Claude

**How to Get:** https://console.anthropic.com/

**Format:** `sk-ant-api03-...`

**Example:**
```
sk-ant-api03-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

**Where to Set:**
- Coolify → Web App → Environment Variables
- Coolify → Worker App → Environment Variables

#### OPENAI_API_KEY (Optional)

**Description:** API key for OpenAI GPT models

**How to Get:** https://platform.openai.com/api-keys

**Format:** `sk-...`

**Where to Set:** Same as ANTHROPIC_API_KEY

#### GOOGLE_GENERATIVE_AI_API_KEY (Optional)

**Description:** API key for Google Gemini models

**How to Get:** https://makersuite.google.com/app/apikey

**Where to Set:** Same as ANTHROPIC_API_KEY

---

### AI Model Configuration

#### ANTHROPIC_MODEL

**Description:** Which Anthropic model to use

**Options:**
- `claude-3-5-haiku-20241022` (recommended for production - fast and cheap)
- `claude-haiku-4-5` (latest haiku model)
- `claude-3-haiku-20240307` (older but stable)

**Recommended Value:**
```
claude-haiku-4-5
```

**Where to Set:** Same as AI provider

#### OPENAI_MODEL (Optional)

**Recommended Value:** `gpt-4o-mini`

#### GOOGLE_MODEL (Optional)

**Recommended Value:** `gemini-2.0-flash`

---

### Email Configuration

#### RESEND_API_KEY

**Description:** API key for Resend email service

**How to Get:**
1. Sign up at https://resend.com
2. Navigate to API Keys
3. Create new API key
4. Copy key value

**Format:** `re_...`

**Example:**
```
re_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

**Where to Set:**
- Coolify → Web App → Environment Variables
- Coolify → Worker App → Environment Variables

#### EMAIL_FROM

**Description:** Sender identity used by both manual report-only sends (web runtime) and worker digest sends

**Format:** `"Display Name <sender@your-domain.com>"`

**Example:**
```
Price Monitor <alerts@your-domain.com>
```

**Where to Set:**
- Coolify → Web App → Environment Variables
- Coolify → Worker App → Environment Variables

#### ALERT_EMAIL

**Description:** Default recipient used by the legacy queue-driven combined and scheduled digest flow

**Format:** Valid email address

**Example:**
```
ops@your-domain.com
```

**Where to Set:**
- Coolify → Worker App → Environment Variables
- Optional in Web App (only needed if you trigger legacy digest flow from web and want explicit parity)

---

### Worker Configuration

#### ENABLE_SCHEDULER

**Description:** Enable BullMQ Repeatable Jobs for scheduled digest emails

**CRITICAL:** Only ONE worker instance should have this set to `true`

**Values:**
- `true` - Enable scheduler (production worker only)
- `false` - Disable scheduler (additional workers)

**Production Value:**
```
true
```

**Where to Set:**
- Coolify → Worker App → Environment Variables
- **NOT** in Web App

**Important Notes:**
- If you scale to multiple workers, only one should have this enabled
- Having multiple schedulers will cause duplicate emails
- Current setup: Single worker with scheduler enabled

#### MCP_REINDEX_URL (feature 008)

**Description:** Full URL of the MCP server's internal reindex endpoint. After a
successful `update-product-info`, the worker enqueues a `reindex-product-embeddings`
job whose handler POSTs `{ productId }` here so the MCP server (the single
embedding authority) rebuilds the product's vectors. The embeddings backfill
enqueues the same job per product.

**Format:** `http://<mcp-host>:<port>/internal/reindex` (a dedicated full URL —
NOT the web app's `MCP_HTTP_URL`, which points at the `/mcp` JSON-RPC endpoint).

**Production Value (Coolify Internal DNS):**
```
http://price-monitor-mcp-prod:3002/internal/reindex
```

**Notes:**
- Default `http://localhost:3002/internal/reindex` (dev). In Docker compose the
  worker uses the service name: `http://mcp-server:3002/internal/reindex`.
- A non-2xx / network error makes the job retry with backoff, so a briefly-down
  MCP server self-heals without failing the metadata/price write.

**Where to Set:**
- Coolify → Worker App → Environment Variables

---

### MCP Server Configuration

The MCP server is the third Coolify application. The web app talks to it over the internal Docker network via HTTP; the IDE-facing stdio transport is **dev-only** and not deployed.

#### MCP_TRANSPORT

**Description:** Selects the wire protocol the MCP server speaks.

**Values:**
- `http` — production (Streamable HTTP, stateless, scales horizontally)
- `stdio` — local development (IDE integration with VSCode / Cursor)

**Production Value:**
```
http
```

**Where to Set:**
- Coolify → MCP App → Environment Variables

#### MCP_HTTP_PORT

**Description:** Port the HTTP listener binds to. The container exposes this port; Coolify's "Ports Exposes" field must match.

**Production Value:**
```
3002
```

**Notes:**
- Default `3002` (chosen to avoid host-port collision with the worker's `3001` health server during local dev).
- Listener binds `0.0.0.0` so the Coolify network proxy can reach it.

**Where to Set:**
- Coolify → MCP App → Environment Variables
- Coolify → MCP App → "Ports Exposes" field (also `3002`)

#### MCP_HTTP_URL

**Description:** Full URL of the `/mcp` endpoint that the **web application** uses to reach the MCP server. Read by `apps/web/src/lib/mcp/client.ts` to switch from stdio to HTTP transport.

**Production Value (Coolify Internal DNS):**
```
http://price-monitor-mcp-prod:3002/mcp
```

**Notes:**
- Hostname is the MCP app's network alias (or its UUID). Both apps must be on the same Coolify network for DNS to resolve.
- If `MCP_HTTP_URL` is empty/unset, the client falls back to stdio (which won't work in prod — there's no `pnpm` and no MCP source in the web image), so this var is **required** in prod.
- Web's MCP-health proxy route (`/api/mcp-server/health`) appends `/health` to this URL — i.e., it probes `http://price-monitor-mcp-prod:3002/mcp/health`. The MCP server exposes both `GET /health` and `GET /mcp/health` (the latter is an alias) so the health proxy and Coolify's container health check both work.

**Where to Set:**
- Coolify → **Web App** → Environment Variables (NOT on the MCP app — this is a client config)

#### MCP Server — DATABASE_URL / REDIS_URL / SCHEDULER_TIMEZONE / NODE_ENV

Use the same values as the worker (Coolify internal DNS for Postgres + Redis, same business timezone, `NODE_ENV=production`). The MCP tools query the DB via Drizzle and `add_product` enqueues a BullMQ job.

`AI_PROVIDER` and the matching API key are **optional** today — no current MCP tool calls an LLM. Add them only when one does.

#### MCP Server — Semantic Search / Embeddings (feature 008)

The MCP server is the **single embedding authority**: it loads the local
`all-MiniLM-L6-v2` model (~300 MB resident, paid once) and serves both
query-time semantic search and write-time reindex. The worker and backfill
never load a model — they enqueue a reindex job that POSTs to the MCP server.

| Variable | Default | Notes |
|---|---|---|
| `EMBEDDING_PROVIDER` | `local` | `local` \| `openai` \| `google`. Only `local` is wired; switching is a deliberate migration (see runbook below). |
| `EMBEDDING_MODEL` | `Xenova/all-MiniLM-L6-v2` | Local model id (384-dim, int8). |
| `EMBEDDING_CACHE_DIR` | `/app/.cache/transformers` | Baked into the image at build time. Leave at the image default in prod. |
| `SEMANTIC_SEARCH_TOP_N` | `5` | Default number of distinct products returned. |
| `SEMANTIC_SEARCH_MAX_DISTANCE` | `0.70` | Cosine-distance relevance cutoff (lower = stricter). Tuned against the real catalog (on-topic ≤0.66, off-topic ≥0.76); re-tune if the catalog mix changes. |

**Offline at runtime:** the Docker image bakes the model weights into
`EMBEDDING_CACHE_DIR` and sets `TRANSFORMERS_OFFLINE=1` / `HF_HUB_OFFLINE=1`;
under `NODE_ENV=production` the code also sets `allowRemoteModels=false`. A
running container never contacts the Hugging Face Hub, so a Hub outage cannot
break search and the first chat search after a deploy is not gated on a download.

**Deliberate provider-switch runbook (`local` → `openai`/`google`):** changing
provider changes the vector dimension (OpenAI 1536, Google 768), so it is a
migration, not a runtime toggle:
1. Install `ai` + the adapter (`@ai-sdk/openai` or `@ai-sdk/google`) in
   `apps/mcp-server` and implement the `embedMany` branch in
   `embeddings/provider.ts`.
2. Migrate the `product_embeddings.embedding` column to `vector(N)` for the new
   dimension.
3. Rebuild the HNSW index for the new column.
4. Re-run the embeddings backfill (`pnpm --filter @price-monitor/worker
   backfill:embeddings`) to repopulate vectors.
5. Set `EMBEDDING_PROVIDER` + the provider API key and redeploy.

---

### Node Environment

#### NODE_ENV

**Description:** Node.js environment mode

**Values:**
- `production` - Production mode (optimizations enabled)
- `development` - Development mode (debug enabled)

**Production Value:**
```
production
```

**Where to Set:**
- Coolify → Web App → Environment Variables
- Coolify → Worker App → Environment Variables

---

### Optional Debug Variables

#### SCHEDULER_TIMEZONE

**Description:** Business timezone for scheduled digests and manual-report daily recipient reset windows

**Fallback Order:** `SCHEDULER_TIMEZONE` → `TZ` → `UTC`

**Where to Set:**
- Coolify → Worker App → Environment Variables
- Coolify → Web App → Environment Variables (recommended for consistent manual-report quota behavior)

#### FORCE_AI_EXTRACTION

**Description:** Force all extractions to use AI (bypass HTML fetcher)

**Values:** `true` | `false`

**Default:** `false`

**When to Use:** Debugging AI extraction issues

**Production Value:**
```
false
```

---

## Environment Variables Checklist

Use this checklist when configuring production environment:

### Web Application

- [ ] DATABASE_URL (Coolify internal DNS)
- [ ] REDIS_URL (Coolify internal DNS)
- [ ] AI_PROVIDER (`anthropic`)
- [ ] ANTHROPIC_API_KEY (your key)
- [ ] ANTHROPIC_MODEL (`claude-haiku-4-5`)
- [ ] RESEND_API_KEY (your key)
- [ ] EMAIL_FROM (sender identity for direct manual sends)
- [ ] NODE_ENV (`production`)
- [ ] MCP_HTTP_URL (`http://price-monitor-mcp-prod:3002/mcp` — required for chat tool calls)
- [ ] SCHEDULER_TIMEZONE (recommended for daily quota reset behavior)
- [ ] FORCE_AI_EXTRACTION (`false` or omit)

### Worker Application

- [ ] DATABASE_URL (Coolify internal DNS)
- [ ] REDIS_URL (Coolify internal DNS)
- [ ] AI_PROVIDER (`anthropic`)
- [ ] ANTHROPIC_API_KEY (your key)
- [ ] ANTHROPIC_MODEL (`claude-haiku-4-5`)
- [ ] RESEND_API_KEY (your key)
- [ ] EMAIL_FROM (sender identity)
- [ ] ALERT_EMAIL (default legacy digest recipient)
- [ ] ENABLE_SCHEDULER (`true`)
- [ ] SCHEDULER_TIMEZONE (scheduler + quota day-boundary timezone)
- [ ] NODE_ENV (`production`)
- [ ] FORCE_AI_EXTRACTION (`false` or omit)
- [ ] MCP_REINDEX_URL (`http://price-monitor-mcp-prod:3002/internal/reindex` — semantic-search reindex)

### MCP Server Application

- [ ] DATABASE_URL (Coolify internal DNS — same as worker)
- [ ] REDIS_URL (Coolify internal DNS — same as worker)
- [ ] MCP_TRANSPORT (`http`)
- [ ] MCP_HTTP_PORT (`3002` — must match Coolify "Ports Exposes")
- [ ] NODE_ENV (`production` — also gates test-only tools off)
- [ ] SCHEDULER_TIMEZONE (recommended for any future date-based tools)
- [ ] Network alias (e.g. `price-monitor-mcp-prod`) so the web app can resolve the hostname
- [ ] Health check path: `/health` on port `3002`
- [ ] Internal-only — no public domain, no HTTPS termination
- [ ] EMBEDDING_PROVIDER (`local`) + EMBEDDING_MODEL / SEMANTIC_SEARCH_TOP_N / SEMANTIC_SEARCH_MAX_DISTANCE (or rely on defaults)
- [ ] EMBEDDING_CACHE_DIR (`/app/.cache/transformers` — image default; weights baked in)

---

## Security Best Practices

1. **Never commit secrets to repository**
   - Use `.env` locally (in `.gitignore`)
   - Set in Coolify dashboard for production

2. **Use strong database passwords**
   - 20+ characters
   - Mix of uppercase, lowercase, numbers, symbols
   - Let Coolify generate if possible

3. **Rotate API keys periodically**
   - Change keys every 90 days
   - Update in Coolify when rotated

4. **Limit API key permissions**
   - Use keys with minimal required scope
   - Don't use admin keys for applications

5. **Monitor API usage**
   - Check Anthropic/OpenAI/Resend dashboards
   - Watch for unexpected usage spikes
   - Set up billing alerts

---

## How to Set Environment Variables in Coolify

1. Open production Coolify dashboard
2. Navigate to the application (Web or Worker)
3. Go to **Settings** → **Environment Variables**
4. Click **Add Variable**
5. Enter variable name and value
6. Click **Save**
7. Redeploy application for changes to take effect

**Note:** Variables are encrypted at rest in Coolify.

---

## Troubleshooting

### Application won't start

**Check:** Environment variables are all set
- Missing required variable causes startup failure
- Check application logs for "Missing environment variable" errors

### Database connection failed

**Check:** DATABASE_URL format
- Ensure using Coolify internal DNS name
- Verify password is correct
- Test connection from Coolify shell

### AI extraction not working

**Check:** API keys and provider
- Verify AI_PROVIDER matches key (e.g., `anthropic` + ANTHROPIC_API_KEY)
- Check API key is valid (not expired or revoked)
- Verify API key has credits/quota remaining

### Emails not sending

**Check:** RESEND_API_KEY
- Verify key is valid
- Check Resend dashboard for errors
- Verify sending domain is verified in Resend

### Duplicate scheduled emails

**Check:** ENABLE_SCHEDULER
- Should be `true` on only ONE worker instance
- If multiple workers, set to `false` on all but one
