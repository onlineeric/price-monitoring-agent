# Idea Specification: Price Monitor AI Agent & MCP Integration

## 1. Overview
We are integrating an end-to-end AI Agent into our Price Monitor app. The goal is to provide a conversational interface for users to interact with their monitored products and to enhance our existing email reports with AI-driven market insights. The system will use the Model Context Protocol (MCP) to ensure secure, standardized, and scalable AI integration.

## 2. Architecture & Core Components

### 2.1 Custom MCP Server (`price-monitor-mcp-server`)
- **Location:** A new, independent project within our existing monorepo.
- **Function:** Acts as the secure bridge between the AI Agent and our PostgreSQL database. 
- **Tool Calling:** Exposes predefined tools for the AI to use. **Direct SQL access (Text-to-SQL) is strictly prohibited** to prevent SQL injection.
- **Expected Tools:** - `search_products`: Search for monitored products.
  - `get_product_history`: Retrieve historical price data.
  - `get_price_summary`: Get a summary of a product's price trend.
  - `add_product`: Add a new product to the monitor list.
- **DX (Developer Experience):** Must be accessible via standard input/output (`stdio`) so it can be integrated with VSCode and Cursor for local development and testing.

### 2.2 MCP Client
- **Location:** Implemented in our web server backend (Next.js API routes).
- **Function:** Acts as the communication layer, retrieving available tools from the MCP Server and passing them to the AI SDK.

## 3. Key Features

### 3.1 AI Chatbot UI & Logic
- **Interface:** A dedicated chatbot page on our web app.
- **Framework:** Built using the **Vercel AI SDK** for seamless streaming and state management.
- **Context Awareness:** Maintains chat history so users can have continuous, multi-turn conversations.

### 3.2 Semantic Search (RAG)
- **Database:** Utilize the `pgvector` extension in our PostgreSQL DB.
- **Embeddings:** Store product metadata (names, specs, categories) as vector embeddings.
- **User Flow:** Users can search using natural language (e.g., "Find me a cheap gaming monitor"). The chatbot uses Retrieval-Augmented Generation (RAG) to fetch relevant products from pgvector and formulate an answer.

### 3.3 Smart Deal Analyzer
- **Integration:** Enhances our existing scheduled Email Price Monitor Report.
- **Logic:** For each product, an LLM analyzes the current price against historical data to generate a short, human-readable insight.
- **Examples:**
  - *"This Sony monitor is currently 15% off, the lowest price in the past 60 days. Based on past trends, this is a Strong Buy opportunity."*
  - *"This energy drink price has been stable for the past 30 days, no significant price changes."*
  - *"This product price has been increasing steadily for the past 90 days. The current price is at an average level."*

## 4. Security & Guardrails

- **Strict Tool Boundaries:** The AI can only perform actions explicitly defined in the MCP Server tools. 
- **Domain Restriction:** The chatbot's System Prompt will restrict it to app-related topics (products, prices, monitor features). It must politely decline off-topic questions or general chit-chat to prevent misuse and token abuse.
- **Data Validation:** All parameters passed by the AI to the MCP Server tools must be strictly validated before executing any database operations.

---

## 5. Implementation Roadmap (Task List)

This list is the resumable guideline. Each sub-task is sized to be independently testable and small enough to learn in one sitting. 
After each coding sub-task is implemented, the AI assistant will stop and explain the change in detail before moving on, **help the developer (me) to fully understand** what have been done, what are they, how they works, in a simple, easy to understand way, so I can fully understand and learn about what we did.

### Legend

Status: `[ ]` not started · `[~]` in progress · `[x]` done

Task type tag (placed at the start of each task):

- **[Code]** — Claude implements directly. This roadmap, plus the context in sections 1–4, contains enough technical detail for Claude to perform the task without a speckit workflow. User just says "do task X.Y".
- **[Code+Speckit]** — Coding task substantial enough (multi-file, architectural decisions, design alternatives worth documenting) to justify the full speckit workflow (`/speckit.specify` → `/speckit.plan` → `/speckit.tasks` → `/speckit.implement`). Speckit will produce a dedicated `specs/<feature>/` folder for the task.
- **[Manual]** — User performs. Covers dependency installs, tool/IDE config, running migrations, infrastructure setup, and end-to-end verification. Claude may provide the exact command or config to paste, but execution is the user's.

### Phase 1 — MCP Server Foundation (stdio + hello-world tool)
Goal: Prove the plumbing. A minimal MCP server exposing one trivial tool, inspectable via MCP Inspector, runnable from VSCode/Cursor.

- [x] 1.1 **[Code]** Scaffold `apps/mcp-server/` package (pnpm workspace wiring, `package.json`, `tsconfig.json`, folder structure, placeholder `src/index.ts`)
- [x] 1.2 **[Manual]** Install `@modelcontextprotocol/sdk` and `zod` in `apps/mcp-server/` (`pnpm --filter @price-monitor/mcp-server add @modelcontextprotocol/sdk zod`)
- [x] 1.3 **[Code]** Implement stdio MCP server exposing a single `ping` tool that returns `"pong"` (uses the SDK's `Server` + `StdioServerTransport`)
- [x] 1.4 **[Code]** Add root-level scripts (`pnpm mcp:dev`, `pnpm mcp:build`) and a README in `apps/mcp-server/` documenting MCP Inspector usage
- [x] 1.5 **[Manual]** Run MCP Inspector (`npx @modelcontextprotocol/inspector`) against the local server and verify the `ping` tool returns `"pong"`
- [x] 1.6 **[Manual]** Register the server in VSCode/Cursor's MCP config so it appears in the IDE

### Phase 2 — Real MCP Tools Backed by the Database
Goal: Replace the hello-world tool with the real toolset defined in section 2.1, each with Zod-validated inputs and Drizzle-backed queries.

- [x] 2.1 **[Code]** Wire `@price-monitor/db` into `apps/mcp-server/` (workspace dep, env loading, shared DB client)
- [x] 2.2 **[Code]** Implement `search_products` tool (input: query string; Drizzle `ILIKE` over `products.name`; returns id, name, url, currentPrice)
- [x] 2.3 **[Code]** Implement `get_product_history` tool (input: productId, optional range; returns priceRecords ordered by scrapedAt)
- [x] 2.4 **[Code]** Implement `get_price_summary` tool (input: productId, window days; returns current, min, max, avg, trend direction)
- [x] 2.5 **[Code]** Implement `add_product` tool (input: URL; enqueues a `check-price` BullMQ job so the existing pipeline creates/updates the product)
- [x] 2.6 **[Code]** Centralize tool error handling: shared wrapper that catches exceptions and returns a structured `{ error: { code, message } }` shape to the MCP client

### Phase 3 — MCP Client + Chatbot UI in Next.js
Goal: A dedicated chatbot page that streams responses, uses tool-calling via the MCP server, and keeps multi-turn context.

- [x] 3.1 **[Manual]** Install `ai`, all three provider adapters (`@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/google` — matching `apps/worker/`), and MCP client deps in `apps/web/`. The active provider is selected at runtime via the existing `AI_PROVIDER` env var (`openai` | `anthropic` | `google`), consistent with the worker.
- [x] 3.2 **[Code]** Build MCP client wrapper in `apps/web/src/lib/mcp/` that spawns/connects to `apps/mcp-server` via stdio and lists available tools
- [x] 3.3 **[Code+Speckit]** Create `/api/chat` streaming route using Vercel AI SDK `streamText` with MCP tools — streaming format, multi-step tool calls (`maxSteps`), error handling, and provider abstraction deserve a spec
- [x] 3.4 **[Code]** Add system prompt enforcing domain restriction (products / prices / monitor features only; politely decline off-topic)
- [x] 3.5 **[Code+Speckit]** Build `/dashboard/chat` page with streaming chat UI — message list, input, loading state, markdown rendering, tool-call display; UI structure + Zustand/React state design warrants a spec
- [x] 3.6 **[Code]** Add multi-turn chat history (client-side first via Zustand; DB persistence deferred)
- [x] 3.7 **[Code]** Display tool-call traces in the UI (which tool, what args, what result) — high demo value
- [x] 3.8 **[Code]** Persist chat history to `localStorage` via Zustand `persist` middleware so a refresh / tab reopen restores the thread; rehydrate sanitizes any mid-stream turns (`streaming` → `stopped`). Per-tab/per-browser stopgap; full DB-backed persistence still deferred.

#### Phase 3 follow-up — Production deployment of MCP server (HTTP transport, separate Coolify app)

Goal: turn the MCP server from a stdio child process of the web app into a standalone, independently observable microservice. Three Coolify apps (`web`, `worker`, `mcp-server`) on the same internal-only network. stdio mode is retained for VSCode/Cursor IDE integration. Sequence: build → local containerized → CI/CD → production Coolify → docs.

- [x] 3.9 **[Code+Speckit]** Add HTTP transport mode to the MCP server. `MCP_TRANSPORT=http` runs `StreamableHTTPServerTransport` on `MCP_HTTP_PORT` (default `3002` — see post-review fix below for why not `3001`), exposes `POST /mcp` and `GET /health`; `MCP_TRANSPORT=stdio` (default) keeps the current behavior so IDE integration is unaffected. Worth a spec because of these decisions: (a) **stateless vs stateful Streamable HTTP** — recommended **stateless** because every tool call is self-contained (no resumable streams, no per-session state), which also makes the service horizontally scalable; (b) `/health` response shape (`{ status, uptime, version, transport }`); (c) graceful shutdown on `SIGTERM` so `docker stop` doesn't drop in-flight requests; (d) **Node built-in `http` vs framework** — recommended `http` (no new dependency, our routing surface is two endpoints); (e) file layout — refactor `src/index.ts` into a transport dispatcher and add `src/transports/stdio.ts` + `src/transports/http.ts`; (f) edge cases — port already in use, malformed JSON-RPC, large response bodies, logging on stdout vs stderr (stdio mode must keep stdout clean).
- [x] 3.10 **[Code]** Update `apps/web/src/lib/mcp/client.ts` to prefer `StreamableHTTPClientTransport` when `MCP_HTTP_URL` is set; fall back to the existing stdio path otherwise. Keep `MCP_SERVER_COMMAND` / `MCP_SERVER_ARGS` as the stdio escape hatches for local IDE-style development. Singleton pattern stays — only the `Transport` instance swaps.
- [x] 3.11 **[Code]** Create `apps/mcp-server/Dockerfile` mirroring `apps/worker/Dockerfile`: `node:20-alpine`, install pnpm, copy workspace + `packages/db`, `pnpm install --frozen-lockfile --shamefully-hoist`, run with `tsx`. Set defaults `MCP_TRANSPORT=http`, `MCP_HTTP_PORT=3002`, `NODE_ENV=production`. `EXPOSE 3002`. No Playwright base needed — MCP server only talks to Postgres + Redis.
- [x] 3.12 **[Code]** Add `mcp-server` service to `docker-compose.yml` under `profiles: ["mcp"]` (so `pnpm docker:up` does **not** start it by default — same opt-in pattern as `worker`). Map `3002:3002` to host so the host-running web dev server can reach it. Wire `DATABASE_URL` / `REDIS_URL` to the local Docker hostnames (`postgres`, `redis`); set `MCP_TRANSPORT=http` and `MCP_HTTP_PORT=3002`.
- [x] 3.13 **[Code]** Add `scripts/dev-mcp.sh` and root-level scripts (`mcp:up`, `mcp:down`, `mcp:logs`, `mcp:restart`, `dev:mcp`) — mirror exactly the `worker:*` / `dev:worker` set. `dev:mcp` flow: stop the Docker MCP container → run the local dev MCP server (`tsx watch`) → restart the Docker container on exit (Ctrl+C). This guarantees you can never have two MCP servers competing for `3002` on the host.
- [x] 3.14 **[Manual]** Local smoke test. (a) `pnpm docker:up && pnpm mcp:up`. (b) `curl http://localhost:3002/health` → expect `200` with `{ status: "ok", ... }`. (c) Set `MCP_HTTP_URL=http://localhost:3002/mcp` in `apps/web/.env.local`, restart web dev, send a chat message that calls a tool. (d) Regression check: unset `MCP_HTTP_URL`, verify VSCode/Cursor stdio integration still works after the 3.9 refactor.
- [x] 3.15 **[Manual]** Verify the `dev:mcp` swap flow: with `pnpm mcp:up` running, run `pnpm dev:mcp` — confirm the Docker container stops, the local dev process starts, and on Ctrl+C the Docker container restarts automatically.
- [x] 3.16 **[Code]** Update `.github/workflows/build-and-push.yml`: add a third **Build and push mcp-server image** step (uses `apps/mcp-server/Dockerfile`, tags `ghcr.io/<repo>/mcp-server:<tag>`) and a fourth **Trigger Production Deployment (MCP)** step that fires the `COOLIFY_WEBHOOK_MCP_PROD` webhook on `main` (mirrors the existing web/worker webhook steps).
- [x] 3.17 **[Manual]** Add `COOLIFY_WEBHOOK_MCP_PROD` to GitHub repository secrets — the value is the deploy webhook URL from the Coolify app you'll create in 3.18.
- [x] 3.18 **[Manual]** Create a new Coolify production app `price-monitor-mcp-prod` pointing at `ghcr.io/<repo>/mcp-server:latest`. Configure env vars (`DATABASE_URL`, `REDIS_URL` — same internal-DNS values as the worker; `MCP_TRANSPORT=http`, `MCP_HTTP_PORT=3002`, `NODE_ENV=production`, `AI_PROVIDER`, the matching API key — even though we don't use AI inside MCP today, it's already the convention shared with web/worker; plus `SCHEDULER_TIMEZONE` for any date-based tools). Configure a health check on `GET /health`. Keep it **internal-only** — no public domain, no HTTPS termination. Copy the deploy webhook URL for 3.17.
- [x] 3.19 **[Manual]** Add `MCP_HTTP_URL=http://price-monitor-mcp-prod:3002/mcp` to the production web app env in Coolify and redeploy the web app.
- [x] 3.20 **[Manual]** Production end-to-end verification. Open the chat page → send a message that triggers a tool call (e.g., "list my products"). In Coolify confirm: (a) `price-monitor-mcp-prod` app status is "running" with healthy `/health`; (b) MCP logs show `[mcp-server] ready on http :3002` plus per-request lines for the chat tool calls; (c) `web` logs no longer surface `mcp_unreachable`; (d) chat response renders correctly in the browser.
- [x] 3.21 **[Code]** Update `docs/production-env.md` with the new MCP server section (its env vars + Coolify config) and `MCP_HTTP_URL` on the web app. Update `CLAUDE.md` Architecture section to reflect the three-app topology (`web`, `worker`, `mcp-server`) and the **dev/prod transport split** (stdio for IDE, HTTP for app-to-app runtime). Mention statelessness as a deliberate scalability choice — useful framing for portfolio/interview narrative.

#### Phase 3 follow-up — Post-review fixes (PR #47 code review)

Three issues surfaced during the PR #47 code review of the 3.9–3.16 work. Resolved in the same PR; behavior changes are summarized here so the spec docs (`specs/006-mcp-http-transport/`) remain a faithful record of the original 3.9 design and any future reader can see why the operational defaults differ.

- [x] 3.22 **[Code]** **`MCP_HTTP_URL` semantic mismatch.** Both the web's MCP client (`apps/web/src/lib/mcp/client.ts`) and the web's MCP-health proxy route (`apps/web/src/app/api/mcp-server/health/route.ts`) read the same `MCP_HTTP_URL` env var, but they wanted different shapes — the client expects the `/mcp` JSON-RPC endpoint URL, the health route was appending `/health` and so needed a base URL. With the documented `MCP_HTTP_URL=http://localhost:3001/mcp`, the health probe was hitting `/mcp/health` → `404` → permanent `mcp-server: offline` in the sidebar. **Fix**: add a `GET /mcp/health` alias on the MCP server alongside the existing `GET /health`. Both paths return the same JSON. The web app uses `${MCP_HTTP_URL}/health` (→ `/mcp/health`); orchestrator probes (Coolify) keep using `GET /health` so 3.18's health-check wiring is unchanged.
- [x] 3.23 **[Code]** **`MCP_TEST_TOOLS=1` exposed test tools in production.** The `slow_ping` (sleeps up to 60 s) and `throw_test` tools registered in `apps/mcp-server/src/server.ts` were gated only on `process.env.MCP_TEST_TOOLS === "1"`. A stray env var copied between environments would silently expose them. **Fix**: hard-gate on `NODE_ENV !== "production"` so a prod image cannot register them regardless of what `MCP_TEST_TOOLS` is set to. Test workflows (Vitest) keep working because `NODE_ENV` is `test` by default in that runner.
- [x] 3.24 **[Code]** **Default port collision with worker.** Both the worker's health server (`WORKER_PORT`, default `3001`) and the new MCP server (`MCP_HTTP_PORT`, default `3001`) wanted port `3001` on the host. Running `pnpm dev:worker` and `pnpm dev:mcp` simultaneously failed with `EADDRINUSE`; the docker-compose `mcp-server` service published `3001:3001` to the same host port the worker dev process wanted. **Fix**: move the MCP HTTP default to `3002`. Updated: `apps/mcp-server/src/config.ts` (default), `Dockerfile` (`ENV MCP_HTTP_PORT=3002`, `EXPOSE 3002`), `package.json` (`dev:tsx`), `README.md`, `docker-compose.yml` (`3002:3002` mapping), `.env.example` (`MCP_HTTP_URL=http://localhost:3002/mcp`), `apps/web/src/app/api/mcp-server/health/route.ts` fallback, `scripts/dev-mcp.sh` comment, and the stdio-transport "no listener bound" test. Tasks 3.18 (Coolify env) and 3.19 (`MCP_HTTP_URL`) above were updated to use `3002` accordingly.

### Phase 4 — Semantic Search with pgvector (RAG)
Goal: Users query in natural language; the chatbot retrieves relevant products via vector similarity.

**Decisions locked before 4.2 (rationale recorded here so the spec and later tasks stay consistent):**

- **Embedding model — LOCAL via Transformers.js.** Use `@huggingface/transformers` running `all-MiniLM-L6-v2` (**384-dim**, quantized int8) **on-box in the mcp-server process**, lazy-loaded on first use. Chosen over a paid API because: (a) zero cost, (b) zero external dependency / fully private, (c) strongest portfolio/interview story, (d) it **fits the production droplet** — 14-day RAM history shows a stable 67–69% / 72% peak on the $24/mo 2 vCPU · 4 GB DigitalOcean droplet (peak already includes daily Playwright runs), and MiniLM adds ~300 MB resident → ~76% baseline / ~79–82% peak, leaving ~750–850 MB free. No upgrade needed.
- **NOT the Vercel AI SDK `embed()` for the default path.** Transformers.js is called **directly** (it is not a Vercel AI SDK provider). The AI SDK `embed`/`embedMany` is only relevant if/when the API fallback is used.
- **Provider abstraction — `EMBEDDING_PROVIDER` env** (mirrors the existing `AI_PROVIDER` pattern): `local` (default) · `openai` (`text-embedding-3-small`, 1536-dim) · `google` (`text-embedding-004`, 768-dim). Switching providers is supported but **NOT a free runtime toggle**: vectors from different models live in different spaces and have different dimensions, so a switch requires (1) change env, (2) Drizzle migration resizing the `vector(N)` column, (3) re-run the backfill script to re-embed all products, (4) rebuild the HNSW index. Cheap on our small dataset (~10–15 min scripted), but a deliberate operation.
- **Vector dimension is fixed by the chosen model** — `vector(384)` for the `local` default.

- [x] 4.1 **[Manual]** Enable `pgvector` extension in the local Docker Postgres image (update `docker-compose.yml` image or init script) and document for prod
- [ ] 4.2 **[Code+Speckit]** Design the embedding pipeline end-to-end — table shape (`productEmbeddings` with vector column, dimension choice, index type HNSW vs IVFFlat), what text to embed, re-embed triggers — produces the spec that Drizzle schema + later tasks follow. (Embedding model + provider decided above.)
- [ ] 4.3 **[Code]** Drizzle schema + migration for the embedding table (follows 4.2's spec)
- [ ] 4.4 **[Code]** Embedding service (default: local Transformers.js `all-MiniLM-L6-v2` called directly; behind the `EMBEDDING_PROVIDER` abstraction with optional Vercel AI SDK `embed`/`embedMany` API providers as fallback)
- [ ] 4.5 **[Code]** Backfill script (`scripts/backfill-embeddings.ts`) that embeds every existing product once
- [ ] 4.6 **[Code]** Auto-embed hook: regenerate embedding on product create / name update (extension point in the existing product save path)
- [ ] 4.7 **[Code]** Add `semantic_search_products` MCP tool — vector similarity query via Drizzle `sql` template using `<=>` cosine distance operator
- [ ] 4.8 **[Manual]** End-to-end test: ask the chatbot a natural-language query ("cheap gaming monitor") and verify relevant products are returned

### Phase 5 — Smart Deal Analyzer in Email Digest
Goal: Enhance the existing scheduled digest with an AI-generated insight per product.

- [ ] 5.1 **[Code]** Define analyzer prompt + Zod output schema (`verdict`: strong_buy|buy|hold|skip, `reason`: string, `confidence`: number)
- [ ] 5.2 **[Code]** Build `analyzeDeal(product, priceHistory)` function in `apps/worker/` using Vercel AI SDK `generateObject`
- [ ] 5.3 **[Code+Speckit]** Integrate analyzer into `send-digest` worker + update React Email template + decide parallelism/error-handling strategy — multi-file change with failure-mode decisions worth spec-ing
- [ ] 5.4 **[Manual]** Trigger digest manually and verify the sent email contains AI insights per product

### Phase 6 — Production Hardening (decide after Phases 1–3 are working)
Scope and ordering to be revisited once the core features are live.

- [ ] 6.1 **[Code+Speckit]** Evals harness: scored test set for tool-calling accuracy and RAG retrieval quality
- [ ] 6.2 **[Manual]** Create Langfuse (or equivalent) account and obtain API keys
- [ ] 6.3 **[Code]** Integrate Langfuse tracing across all LLM + tool calls
- [ ] 6.4 **[Code+Speckit]** Prompt-injection guardrails — input sanitization strategy for scraped content entering any prompt
- [ ] 6.5 **[Code]** Cost optimization for Deal Analyzer (cache insights, skip re-run unless price moves >X%)
- [ ] 6.6 **[Code]** Rate limiting + auth on `/api/chat` route

---

## 6. Working Agreement (Collaboration Mode)

- The assistant implements **[Code]** tasks; the user performs **[Manual]** tasks; **[Code+Speckit]** tasks go through the speckit workflow before implementation.
- After each **[Code]** or **[Code+Speckit]** sub-task is implemented, the assistant **stops and explains** what was built, how it works, and how it connects to the broader architecture — before moving to the next sub-task.
- Tasks may be re-broken into even smaller pieces during implementation if a piece turns out to be too large to learn at once.
- Progress is tracked by updating the checkboxes in section 5 as each sub-task is completed.