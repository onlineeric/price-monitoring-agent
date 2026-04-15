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

This list is the resumable guideline. Each sub-task is sized to be independently testable and small enough to learn in one sitting. After each coding sub-task is implemented, the assistant will stop and explain the change in detail before moving on.

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
- [ ] 1.4 **[Code]** Add root-level scripts (`pnpm mcp:dev`, `pnpm mcp:build`) and a README in `apps/mcp-server/` documenting MCP Inspector usage
- [ ] 1.5 **[Manual]** Run MCP Inspector (`npx @modelcontextprotocol/inspector`) against the local server and verify the `ping` tool returns `"pong"`
- [ ] 1.6 **[Manual]** Register the server in VSCode/Cursor's MCP config so it appears in the IDE

### Phase 2 — Real MCP Tools Backed by the Database
Goal: Replace the hello-world tool with the real toolset defined in section 2.1, each with Zod-validated inputs and Drizzle-backed queries.

- [ ] 2.1 **[Code]** Wire `@price-monitor/db` into `apps/mcp-server/` (workspace dep, env loading, shared DB client)
- [ ] 2.2 **[Code]** Implement `search_products` tool (input: query string; Drizzle `ILIKE` over `products.name`; returns id, name, url, currentPrice)
- [ ] 2.3 **[Code]** Implement `get_product_history` tool (input: productId, optional range; returns priceRecords ordered by scrapedAt)
- [ ] 2.4 **[Code]** Implement `get_price_summary` tool (input: productId, window days; returns current, min, max, avg, trend direction)
- [ ] 2.5 **[Code]** Implement `add_product` tool (input: URL; enqueues a `check-price` BullMQ job so the existing pipeline creates/updates the product)
- [ ] 2.6 **[Code]** Centralize tool error handling: shared wrapper that catches exceptions and returns a structured `{ error: { code, message } }` shape to the MCP client

### Phase 3 — MCP Client + Chatbot UI in Next.js
Goal: A dedicated chatbot page that streams responses, uses tool-calling via the MCP server, and keeps multi-turn context.

- [ ] 3.1 **[Manual]** Install `ai`, `@ai-sdk/openai` (or equivalent provider), and MCP client deps in `apps/web/`
- [ ] 3.2 **[Code]** Build MCP client wrapper in `apps/web/src/lib/mcp/` that spawns/connects to `apps/mcp-server` via stdio and lists available tools
- [ ] 3.3 **[Code+Speckit]** Create `/api/chat` streaming route using Vercel AI SDK `streamText` with MCP tools — streaming format, multi-step tool calls (`maxSteps`), error handling, and provider abstraction deserve a spec
- [ ] 3.4 **[Code]** Add system prompt enforcing domain restriction (products / prices / monitor features only; politely decline off-topic)
- [ ] 3.5 **[Code+Speckit]** Build `/dashboard/chat` page with streaming chat UI — message list, input, loading state, markdown rendering, tool-call display; UI structure + Zustand/React state design warrants a spec
- [ ] 3.6 **[Code]** Add multi-turn chat history (client-side first via Zustand; DB persistence deferred)
- [ ] 3.7 **[Code]** Display tool-call traces in the UI (which tool, what args, what result) — high demo value

### Phase 4 — Semantic Search with pgvector (RAG)
Goal: Users query in natural language; the chatbot retrieves relevant products via vector similarity.

- [ ] 4.1 **[Manual]** Enable `pgvector` extension in the local Docker Postgres image (update `docker-compose.yml` image or init script) and document for prod
- [ ] 4.2 **[Code+Speckit]** Design the embedding pipeline end-to-end — table shape (`productEmbeddings` with vector column, dimension choice, index type HNSW vs IVFFlat), what text to embed, which provider model, re-embed triggers — produces the spec that Drizzle schema + later tasks follow
- [ ] 4.3 **[Code]** Drizzle schema + migration for the embedding table (follows 4.2's spec)
- [ ] 4.4 **[Code]** Embedding service in `packages/db` or `apps/web/src/lib/embeddings/` using Vercel AI SDK `embed` / `embedMany`
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