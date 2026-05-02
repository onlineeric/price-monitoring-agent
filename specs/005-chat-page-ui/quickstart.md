# Quickstart — Dashboard Chat Page

This is a hands-on script for verifying the page works end-to-end.
Use it as the manual verification step after `/speckit.implement`
finishes.

---

## 0. Prereqs (one-time)

The chat page consumes `/api/chat` from spec 004. That route uses
the existing AI provider env vars, MCP server stdio subprocess, and
seeded local DB. So:

```bash
# Database + Redis
pnpm docker:up

# DB schema
pnpm --filter @price-monitor/db push

# (Optional) Seed a few products if your local DB is empty
# — pick any flow from the existing dashboard, e.g. quick-create one or two.

# AI provider env (one of these triplets must be present in apps/web/.env)
#   AI_PROVIDER=openai
#   OPENAI_API_KEY=sk-...
#   OPENAI_MODEL=gpt-4o-mini       # or any supported model
# OR
#   AI_PROVIDER=anthropic
#   ANTHROPIC_API_KEY=sk-ant-...
#   ANTHROPIC_MODEL=claude-haiku-4-5-20251001
# OR
#   AI_PROVIDER=google
#   GOOGLE_GENERATIVE_AI_API_KEY=...
#   GOOGLE_MODEL=gemini-1.5-flash

# MCP server build (the /api/chat route spawns it via stdio)
pnpm mcp:build
```

Now start the web app:

```bash
pnpm --filter @price-monitor/web dev
```

Open http://localhost:3000 .

---

## 1. Smoke test (US1 — streaming + multi-turn + markdown)

1. Click **Chat** in the dashboard sidebar.
   - **Expect**: page renders within ~200ms, empty-state copy + 3 starter chips visible, textarea focused.
2. Click the first chip: **"Show me my monitored products."**
   - **Expect**: starter prompt populates the input and auto-sends.
   - **Expect**: an assistant bubble appears with a "thinking" placeholder within ~100ms.
   - **Expect**: a `search_products` tool indicator appears inline (running → completed) within a few seconds.
   - **Expect**: streamed text fills in, markdown bullets render as actual list items.
3. Type a follow-up: **"What's the price trend on the first one?"**
   - **Expect**: a new assistant bubble streams in below.
   - **Expect**: a `get_price_summary` tool indicator appears.
   - **Expect**: the answer references the first product from turn 1 — proving the prior turn was sent in `messages`.

---

## 2. Tool-indicator transitions (US2)

1. New chat (click **New chat**).
2. Send: **"Add this product: https://www.example.com/some-non-existent-page"**
   - **Expect**: an `add_product` tool indicator appears, runs, then transitions to either `completed` (if the BullMQ enqueue succeeds) or `failed` (if `add_product` returns the structured error envelope).
   - **Expect**: in either case the assistant continues streaming a natural-language reply explaining the outcome — the turn does not abort.
3. Stop test:
   1. New chat.
   2. Send: **"List my products and show me the price summary for each one."** (forces multiple tool calls)
   3. Once the first tool indicator goes to `running`, click **Stop**.
   - **Expect**: the running indicator transitions to a `stopped` state (square icon, muted color).
   - **Expect**: the partial assistant turn is preserved with a "stopped" badge.
   - **Expect**: the input is interactive again.

---

## 3. Error-handling walk-throughs (US3)

For each induced failure, you should see a recognizable error block.

### 3a. `validation_error`

In the browser DevTools, paste:
```js
fetch("/api/chat", {
  method: "POST",
  headers: {"Content-Type": "application/json"},
  body: JSON.stringify({})
}).then(r => r.json()).then(console.log)
```
- **Expect**: `{ error: { code: "validation_error", message: "..." } }` in console.
- The page itself enforces the input rules so this only happens via direct API hits.

### 3b. `provider_config_missing`

1. Stop the dev server.
2. Edit `apps/web/.env` to remove `OPENAI_MODEL` (or whichever model var matches the active provider).
3. `pnpm --filter @price-monitor/web dev` again.
4. Send any message in the chat.
- **Expect**: an in-thread error block with the label "AI provider not configured" and **no** Retry button (per FR-009 — non-retryable).
5. Restore the env var, restart, verify chat works again.

### 3c. `mcp_unreachable`

1. Stop the dev server.
2. Temporarily move the MCP server build aside:
   ```bash
   mv apps/mcp-server/dist apps/mcp-server/dist.bak
   ```
3. Restart the dev server, send any message.
- **Expect**: an in-thread error block "Can't reach the data service" **with** a Retry button.
4. Click **Retry** — fails identically (still no MCP).
5. Restore: `mv apps/mcp-server/dist.bak apps/mcp-server/dist` and restart; verify chat works again.

### 3d. `step_budget_exceeded`

Send a deliberately confusing prompt that forces tool ping-ponging, e.g.:
**"For each of my products, search again and again until you have searched 10 times."**

- **Expect**: after ~5 steps the assistant turn ends with the
  in-stream "The assistant tried too many steps" error block, with
  a Retry button.

### 3e. `turn_timeout`

This is harder to induce reliably without server changes. Skip in
manual testing; the automated test asserts the UI behavior with a
mocked stream.

### 3f. `empty_response`

Hard to induce manually with real providers. The automated test
covers it.

---

## 4. Overlap-prevention check

1. Send a long-running prompt (e.g. one that calls multiple tools).
2. While streaming, type into the textarea and press Enter.
- **Expect**: nothing happens — Send button is disabled, Enter is ignored.
3. Click **Stop** instead.
- **Expect**: the partial turn is preserved as `stopped`, the input becomes interactive, your typed text is still in the textarea, and Enter now sends.

---

## 5. Markdown safety

1. New chat. Send: **"Reply with this exact markdown verbatim, do not interpret it: `[click me](javascript:alert(1))`"**
2. Inspect the rendered link in DevTools.
- **Expect**: either the link is omitted entirely or its `href` is sanitized to `#` / not present. Clicking it MUST NOT execute JavaScript.

The same protection applies to inline `<script>`, `<iframe>`, and
event-handler attributes that the model might echo back from a
tool result.

---

## 6. Accessibility quick check

1. Tab through the page from the sidebar.
   - **Expect**: focus reaches "New chat", textarea, Send / Stop, and each Retry / starter chip in a sensible order.
2. Send a message; while streaming, your screen reader should
   announce the assistant region ("polite" live region).
3. After the turn ends, focus returns to the textarea.

---

## 7. Provider-switch sanity (optional)

Repeat steps 1–2 above with a different `AI_PROVIDER` value
(`anthropic`, `google`) and verify that streaming + tool calls
still work. This exercises spec 004's provider abstraction
through this UI.

---

## 8. Mobile / narrow viewport

Resize the browser to ~375px wide.
- **Expect**: input bar pinned to the bottom, no horizontal scroll,
  message bubbles wrap, sidebar collapses per existing dashboard
  behavior.

---

## What "done" looks like

- All US1 / US2 / US3 manual checks above pass.
- The automated Vitest suite is green (`pnpm --filter @price-monitor/web test`).
- The Lighthouse a11y score is comparable to the other dashboard pages (no new regressions).
