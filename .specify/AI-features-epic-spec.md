# AI Features Epic Specification

## 1. Epic Summary

This epic expands the idea in `.specify/AI-features-idea-spec.md` into a delivery plan that fits the current monorepo and existing product-monitoring architecture.

The target outcome is an AI assistant inside the dashboard that can:

- answer product and price-monitoring questions through a chat UI
- use a local MCP server for controlled tool access
- use RAG over monitored product data
- enhance digest emails with AI-generated deal insights

This epic is intentionally phased so each step can be built, tested, and shipped independently without forcing a full end-to-end rollout in one change.

## 2. Current Codebase Analysis

### 2.1 What already exists

- `packages/db` contains the shared Drizzle schema and database client.
- `apps/web` already owns the dashboard UI and API route layer.
- `apps/worker` already owns:
  - AI provider usage for extraction fallback
  - product trend calculation
  - digest orchestration and email rendering
- Product CRUD currently lives directly inside Next.js route handlers.
- Trend summary logic currently lives inside the worker, not in a shared package.

### 2.2 Current constraints that affect this epic

- The database currently stores only:
  - `products`
  - `price_records`
  - `run_logs`
  - `settings`
- There is no existing vector storage, chat storage, MCP app, or AI tool audit model.
- There is no user/auth model in active use today, so AI features are effectively single-tenant/admin-scoped unless auth is added separately.
- The current AI configuration is extraction-oriented and worker-oriented:
  - `AI_PROVIDER`
  - provider API keys
  - provider model env vars
- RAG quality is currently limited by stored data. Today the product model mostly has:
  - URL
  - name
  - image
  - price history

### 2.3 Codebase-fit implications

- The MCP server should be a new monorepo app, not embedded inside `apps/web`.
- Shared product/trend logic should be extracted out of route handlers and worker-only modules before MCP write tools are added.
- The web app is the correct place for the MCP client and chat API orchestration.
- The worker is the correct place for embedding backfills, incremental indexing, and digest insight generation.
- Chat, embeddings, and summarization should not overload the existing extraction-only AI config. They need their own config surface.

## 3. Epic Goals

- Add a dashboard chatbot that can answer questions about monitored products and prices.
- Introduce an MCP server with strict tool boundaries and validated inputs.
- Introduce an MCP client in the web backend that exposes those tools to the AI SDK.
- Add vector-based retrieval for natural-language product discovery.
- Add AI-generated insight text to digest emails.

## 4. Non-Goals

- No direct Text-to-SQL generation.
- No unrestricted database access from the model.
- No browser-to-MCP direct communication.
- No general-purpose assistant behavior outside product-monitoring scope.
- No autonomous write actions without explicit confirmation.
- No full multi-user chat history design in this epic unless auth is added separately.
- No replacement of the existing scrape pipeline; this epic builds on top of it.

## 5. Recommended Architecture Shape

### 5.1 New runtime app

- `apps/mcp-server`
  - standalone MCP server
  - supports `stdio` transport for local development and IDE integration
  - can be spawned by the web backend as a child process in the current self-hosted deployment model

### 5.2 Recommended shared packages

- `packages/ai-core`
  - AI env/config validation
  - model/provider selection for chat, embeddings, and summarization
  - prompt guardrails
  - MCP tool schemas and shared types
- `packages/product-domain`
  - shared product queries
  - shared product mutation services
  - trend summary services
  - RAG document builder and search helpers

If package naming changes later, the architectural split should still hold: keep domain logic shared, keep runtime process concerns in apps.

### 5.3 Database additions

Recommended initial additions:

- `product_documents`
  - one or more searchable documents per product
  - stores normalized text content, document type, metadata, content hash
- `product_document_embeddings`
  - stores vector embedding, model info, embedded timestamp
- `ai_tool_audit_logs`
  - stores tool name, action type, status, request summary, error summary, timestamp

Optional later addition:

- `chat_threads` and `chat_messages`
  - only if durable cross-refresh chat history becomes a requirement before auth lands

### 5.4 Guardrail rules

- All tool inputs must be validated with shared Zod schemas before domain logic runs.
- All write-capable tools must use shared mutation services, not hand-written database queries inside tool handlers.
- All database access should continue to use Drizzle query builder APIs.
- If `pgvector` support requires raw SQL for extension setup or similarity operators, isolate it to the smallest possible repository layer.
- The system prompt must refuse off-topic requests and explain the available scope.

## 6. Cross-Cutting Assumptions

- Initial rollout is for the existing admin/dashboard context, not public unauthenticated consumer chat.
- Initial chat history is session-scoped and passed through the web app; durable per-user history is deferred.
- The current deployment is Node-based and self-hosted, so `stdio` MCP process spawning is acceptable for MVP.
- Embeddings will likely need a dedicated provider/model configuration separate from the current extraction provider.
- RAG MVP will mainly retrieve from existing product fields and computed price summaries; richer product metadata can be added later.

## 7. Phase Overview

| Phase | Outcome | Can Ship Independently | Depends On |
| --- | --- | --- | --- |
| 1 | Shared AI and domain foundations | Yes | None |
| 2 | `pgvector` and AI data schema | Yes | 1 |
| 3 | Embedding and retrieval pipeline | Yes | 2 |
| 4 | Read-only MCP server | Yes | 1, 3 |
| 5 | MCP client and chat API | Yes | 4 |
| 6 | Dashboard chat UI MVP | Yes | 5 |
| 7 | Write-capable MCP tools with confirmation | Yes | 1, 4, 6 |
| 8 | Smart deal analyzer in digest emails | Yes | 1, 3 |
| 9 | Hardening and rollout readiness | Yes | 4, 5, 6, 7, 8 |

## 8. Detailed Phase Plan

### Phase 1: Shared Foundations and Contracts

**Goal:** Create the shared architectural seams required so MCP, web, and worker features do not duplicate business logic.

**Scope**

- Add shared package boundaries for AI config and product domain logic.
- Extract product read/write rules out of `apps/web` route handlers into shared services.
- Extract trend summary logic out of worker-only placement into shared services.
- Define shared schemas for:
  - MCP tool inputs and outputs
  - chat request and citation metadata
  - off-topic refusal policy
- Define separate AI config for:
  - extraction
  - chat
  - embeddings
  - digest summarization

**Tasks**

1. Create shared package scaffolding and TypeScript project wiring.
2. Move product mutation validation into shared domain services.
3. Move product history and trend summary queries into shared domain services.
4. Add shared Zod contracts for tool definitions and chat metadata.
5. Add AI env validation for distinct model roles instead of reusing extraction-only settings.

**Acceptance Criteria**

- Web routes still behave the same after logic extraction.
- Worker digest/trend flow can consume shared domain services without regression.
- Tool schemas exist in one shared place and are reusable by MCP server and web client.

**Test Strategy**

- Unit tests for shared domain services and schema validation.
- Existing product API tests remain green.
- Trend summary outputs before/after refactor match for representative fixtures.

### Phase 2: Database and `pgvector` Foundation

**Goal:** Add the minimum persistent data model required for RAG and tool auditing.

**Scope**

- Enable the PostgreSQL `vector` extension.
- Add Drizzle schema for:
  - `product_documents`
  - `product_document_embeddings`
  - `ai_tool_audit_logs`
- Add repository helpers for document CRUD and similarity lookup.
- Document local and production database requirements for `pgvector`.

**Tasks**

1. Add migration support for `CREATE EXTENSION IF NOT EXISTS vector`.
2. Add document and embedding tables to `packages/db`.
3. Add repository methods for:
  - upserting documents
  - upserting embeddings
  - querying nearest documents
4. Add audit log repository helpers for future write-tool tracing.
5. Update environment and setup docs for local and production `pgvector` enablement.

**Acceptance Criteria**

- A clean local database can be pushed/migrated successfully with `pgvector` enabled.
- A sample product document and embedding can be inserted and queried.
- Audit log records can be written without affecting existing app flows.

**Test Strategy**

- Migration smoke test on a fresh local database.
- Repository integration tests for document upsert and similarity query.
- Manual Drizzle Studio validation of new tables.

### Phase 3: Embedding and Retrieval Pipeline

**Goal:** Keep searchable product documents synchronized with live product data.

**Scope**

- Build a product document generator using current stored data:
  - product name
  - merchant/domain
  - URL
  - latest known price/currency
  - trend summary text
  - optional future metadata fields
- Add embedding generation service.
- Add backfill tooling for existing products.
- Add incremental re-index triggers for product create, update, and successful price refresh.
- Add semantic retrieval service returning ranked matches with scores.

**Tasks**

1. Create document-builder logic from current product and price history.
2. Add embedding provider/model config and generation service.
3. Add a backfill script or queue-driven batch job for existing products.
4. Trigger re-indexing after:
   - product creation
   - product update
   - successful price-check save
5. Add retrieval helpers for top-N semantic search results.

**Acceptance Criteria**

- Existing products can be backfilled into vector documents.
- A changed product or new price data causes the relevant document to be refreshed.
- A semantic query like "cheap gaming monitor" returns ranked results when matching data exists.

**Test Strategy**

- Unit tests for document content generation.
- Integration tests for re-index triggers.
- Manual semantic-search smoke tests against seeded products.

### Phase 4: MCP Server MVP (Read-Only)

**Goal:** Introduce a safe standalone MCP server that exposes read-only product and trend tools.

**Scope**

- Create `apps/mcp-server` with `stdio` transport.
- Implement read-only tools first:
  - `search_products`
  - `semantic_search_products`
  - `get_product_history`
  - `get_price_summary`
  - optional `get_product_details`
- Use shared domain services and shared Zod schemas.
- Add structured error responses and audit logging for tool calls.

**Tasks**

1. Scaffold the new app and runtime scripts.
2. Implement tool registry and tool handlers.
3. Add parameter validation and output normalization.
4. Add audit logging for tool usage and failures.
5. Add a local inspector/test harness workflow for stdio testing.

**Acceptance Criteria**

- The server can be launched locally and discovered by an MCP inspector/client.
- Each read-only tool returns stable structured output.
- Invalid tool arguments are rejected before any database access occurs.

**Test Strategy**

- Unit tests for each tool handler.
- Integration test with stdio tool discovery and invocation.
- Manual smoke test from a local MCP-capable client.

### Phase 5: MCP Client and Chat API MVP

**Goal:** Let the web backend orchestrate grounded AI chat using MCP tools.

**Scope**

- Add a server-only MCP client adapter in `apps/web`.
- Add chat API route(s) using the Vercel AI SDK.
- Stream responses to the frontend.
- Include:
  - tool discovery/loading
  - message history passing
  - off-topic refusal rules
  - citation/tool metadata in responses
- Keep the MCP boundary on the server side only.

**Tasks**

1. Add AI SDK dependencies to the web app where needed.
2. Implement a server-side MCP client wrapper that spawns or connects to `apps/mcp-server`.
3. Create a streaming chat route with shared request/response schemas.
4. Add refusal behavior for off-topic or unsupported requests.
5. Include response metadata so the UI can show sources and tool activity.

**Acceptance Criteria**

- A chat request can trigger MCP read-only tool calls and stream a grounded answer.
- Off-topic prompts are declined consistently.
- The browser never gets direct MCP access or database credentials.

**Test Strategy**

- Route tests with mocked MCP responses.
- Prompt-policy tests for allowed and disallowed prompts.
- Manual API smoke test with streamed responses.

### Phase 6: Dashboard Chat UI MVP

**Goal:** Ship a usable in-dashboard assistant page backed by the new chat API.

**Scope**

- Add a new dashboard page and sidebar entry for AI chat.
- Build a chat interface with:
  - streaming assistant messages
  - multi-turn local session history
  - starter prompts
  - loading and retry states
  - source/tool activity display
- Keep the UI read-only in this phase.

**Tasks**

1. Add navigation entry and route.
2. Build chat layout and message list components.
3. Wire the composer to the streaming chat API.
4. Render citations and tool activity in a user-readable way.
5. Add local session persistence for current thread context if needed.

**Acceptance Criteria**

- A dashboard user can ask product and price questions from the UI and receive grounded answers.
- Chat remains coherent across multiple turns in the same session.
- The UI exposes enough source/tool context for the response to be auditable.

**Test Strategy**

- Component tests for submit, stream, retry, and error states.
- Manual end-to-end chat smoke test in local dev.
- Sidebar/navigation regression check.

### Phase 7: Write-Capable MCP Tools with Explicit Confirmation

**Goal:** Allow the assistant to help with product mutations without creating unsafe autonomous writes.

**Scope**

- Add write-capable tools:
  - `add_product`
  - `update_product`
- Reuse the same validation and business rules currently used by product APIs.
- Add a confirmation workflow so the assistant can propose a write, but execution only happens after explicit user confirmation in the UI.
- Persist audit logs for write proposals and confirmed executions.

**Tasks**

1. Finalize shared mutation services so HTTP routes and MCP tools use the same code path.
2. Implement write-tool handlers in the MCP server.
3. Add dry-run or preview payloads for proposed writes.
4. Add a confirmation token/step in chat backend and UI.
5. Record audit log entries for proposal, confirmation, success, and failure.

**Acceptance Criteria**

- The assistant can propose adding or updating a product.
- No write occurs until the user explicitly confirms.
- Duplicate URL checks and existing API validation rules still apply.

**Test Strategy**

- Unit tests for shared mutation services.
- Integration tests for confirmation-gated write execution.
- Manual test that confirms proposed and canceled actions behave correctly.

### Phase 8: Smart Deal Analyzer for Digest Emails

**Goal:** Add short AI-generated deal commentary to the existing digest flow without making email delivery fragile.

**Scope**

- Add a summarization service that consumes current trend data and optional retrieved product context.
- Integrate it into the digest flow after price checks and trend calculation.
- Update the email template to render per-product insights.
- Add graceful fallback if summarization fails or is disabled.

**Tasks**

1. Build summarization prompt input from existing trend data.
2. Add a cheap, bounded summarization model config.
3. Integrate summarization into `apps/worker/src/jobs/sendDigest.ts` flow.
4. Update `PriceDigest` email template with insight text.
5. Add feature flag or config switch for AI digest insights.

**Acceptance Criteria**

- A manual digest run can include short AI insight text per product.
- Digest delivery still succeeds when the model is unavailable or rate-limited.
- Insight text stays bounded, product-specific, and on-topic.

**Test Strategy**

- Unit tests for summarization input shaping and fallback behavior.
- Email render/snapshot tests.
- Manual digest trigger verification from the dashboard.

### Phase 9: Hardening, Observability, and Rollout

**Goal:** Make the new AI features production-safe and operable.

**Scope**

- Add feature flags and kill switches.
- Add timeouts, rate limits, and token-budget controls.
- Add logs and diagnostics for:
  - chat requests
  - tool calls
  - retrieval/indexing jobs
  - summarization failures
- Update deployment docs for new services, env vars, and local setup.
- Add rollout and rollback checklist.

**Tasks**

1. Add structured logging and failure categorization.
2. Add timeout and retry boundaries per AI workflow.
3. Add environment/config documentation for web, worker, and MCP server.
4. Update deployment setup for the new app/runtime expectations.
5. Create release checklist and rollback plan.

**Acceptance Criteria**

- AI features can be disabled independently if needed.
- Failures are diagnosable from logs without attaching a debugger.
- Local setup and production deployment steps are documented end to end.

**Test Strategy**

- Manual failure-path tests for disabled AI, missing MCP process, and model errors.
- Config validation tests.
- Rollout checklist dry run in local or staging-like environment.

## 9. Dependencies and Ordering Notes

- Phase 1 must happen before serious MCP or chat work, otherwise product logic will be duplicated across web, worker, and MCP layers.
- Phase 2 and Phase 3 should land before read-only RAG-based chat, otherwise semantic search is mostly placeholder behavior.
- Phase 4 and Phase 5 can deliver a backend-only MVP before the full UI ships.
- Phase 7 should not start before the confirmation design is settled.
- Phase 8 can proceed in parallel with late chat work once shared AI config and retrieval foundations exist.

## 10. Key Risks

- **Provider mismatch risk:** the current recommended extraction provider may not be the right embedding provider, so embeddings need separate configuration.
- **Data richness risk:** current product data may be too sparse for high-quality semantic retrieval until product documents are enriched.
- **Architecture drift risk:** if product mutation and trend logic stay split across apps, MCP tools will diverge from HTTP behavior.
- **Security risk:** without explicit confirmation, write tools would be too permissive for an admin-facing assistant.
- **Operational risk:** a child-process MCP server is acceptable for current self-hosted deployment, but future serverless hosting would require a different transport strategy.

## 11. Definition of Epic Done

This epic is complete when:

- the dashboard has a working AI chat page
- the web backend uses an MCP client to access a local MCP server
- the MCP server exposes validated, bounded product tools
- semantic retrieval works against vectorized product documents
- digest emails can include safe AI-generated deal insights
- write-capable assistant actions require explicit confirmation
- deployment and runbook documentation cover the new AI surface area
