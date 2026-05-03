# Contract: `POST /mcp` (and other methods on `/mcp`)

**Feature**: 006-mcp-http-transport
**Endpoint**: `POST /mcp` (HTTP mode only)
**Transport**: Node `http.Server` listening on `MCP_HTTP_PORT` (default
`3001`), bound to `0.0.0.0`. Routed by `apps/mcp-server/src/transports/
http.ts` and delegated to `StreamableHTTPServerTransport.handleRequest()`.

This endpoint is the on-the-wire representation of the MCP protocol. It is
NOT a custom JSON API; it carries the same JSON-RPC 2.0 frames the stdio
transport carries today, just over HTTP. Spec FR-007 guarantees the tool
set, schemas, and result shapes are identical across both transports —
this contract documents only the wire behavior the new HTTP path adds.

## Request

| Aspect | Value |
|---|---|
| Method | `POST` |
| Path | `/mcp` |
| Content-Type | `application/json` (required) |
| Accept | `application/json` and/or `text/event-stream` (the SDK may upgrade to SSE for streamed responses; clients typically send both) |
| Body | A JSON-RPC 2.0 request frame. Examples below. |
| `Mcp-Session-Id` header | NOT used. The server runs in stateless mode (`sessionIdGenerator: undefined`); any value sent by the client is ignored, and no session ID is returned. |
| Authentication | None (network boundary provides access control per spec.md Assumptions). |

### Example: `tools/list`

```http
POST /mcp HTTP/1.1
Host: price-monitor-mcp-prod:3001
Content-Type: application/json
Accept: application/json, text/event-stream

{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/list",
  "params": {}
}
```

### Example: `tools/call` for `ping`

```http
POST /mcp HTTP/1.1
Host: price-monitor-mcp-prod:3001
Content-Type: application/json
Accept: application/json, text/event-stream

{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "ping",
    "arguments": { "count": 3 }
  }
}
```

## Successful Response

| Aspect | Value |
|---|---|
| Status | `200 OK` |
| Content-Type | `application/json` (or `text/event-stream` if SDK chose SSE) |
| Body | A JSON-RPC 2.0 response frame produced by the SDK and the registered tool. Identical to what the stdio transport would write to stdout for the same request (FR-007). |

### Example: `tools/list` response

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "tools": [
      { "name": "search_products", "description": "...", "inputSchema": { ... } },
      { "name": "get_product_history", "description": "...", "inputSchema": { ... } },
      { "name": "get_price_summary", "description": "...", "inputSchema": { ... } },
      { "name": "add_product", "description": "...", "inputSchema": { ... } },
      { "name": "ping", "description": "...", "inputSchema": { ... } }
    ]
  }
}
```

### Example: `tools/call` for `ping` response

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "content": [{ "type": "text", "text": "pong pong pong" }]
  }
}
```

## Error Responses

The MCP server distinguishes three layers of failure.

### Layer 1 — HTTP-level errors (router)

| Condition | Status | Body |
|---|---|---|
| Request to a path other than `/mcp` or `/health` | `404 Not Found` | `Not Found` (text) |
| `POST /health` (wrong method on `/health`) | `405 Method Not Allowed` | `Method Not Allowed` (text), `Allow: GET` header |
| `POST /mcp` body that is not valid JSON | `400 Bad Request` | `Invalid JSON-RPC body` (text) |
| Internal panic in our router (unexpected) | `500 Internal Server Error` | `Internal Server Error` (text) |
| Per-request timeout fired (30 s elapsed without response) | `504 Gateway Timeout` | JSON envelope (see below, code `request_timeout`) |
| Server is shutting down (rare race) | `503 Service Unavailable` | `Server shutting down` (text) |

**Note**: HTTP methods on `/mcp` other than `POST` (e.g., `GET`, `DELETE`)
are NOT pre-intercepted by our router — they are delegated to
`StreamableHTTPServerTransport.handleRequest()` which returns the protocol-
correct response for stateless mode (Decision 7).

### Layer 2 — JSON-RPC protocol errors (SDK)

The SDK's `StreamableHTTPServerTransport` may produce JSON-RPC error
responses with HTTP status `200` (per JSON-RPC convention) — for example,
when the client sends a JSON-RPC frame with an unknown `method`. These
are passed through unchanged.

```json
{
  "jsonrpc": "2.0",
  "id": 99,
  "error": { "code": -32601, "message": "Method not found" }
}
```

### Layer 3 — Tool-level errors (existing `_wrap.ts` envelope)

When a registered tool throws, `withErrorHandling` returns a `CallToolResult`
with `isError: true` and a `text` content block containing the existing
envelope. Behavior unchanged from stdio mode (FR-008).

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "isError": true,
    "content": [{
      "type": "text",
      "text": "{\n  \"error\": {\n    \"code\": \"INTERNAL_ERROR\",\n    \"message\": \"...\"\n  }\n}"
    }]
  }
}
```

### Per-request timeout (Layer 1, code `request_timeout`)

When a request handler does not finish within 30 seconds (FR-011a), the
server aborts the in-flight processing and writes:

```http
HTTP/1.1 504 Gateway Timeout
Content-Type: application/json
```

```json
{ "error": { "code": "request_timeout", "message": "MCP request exceeded 30s timeout" } }
```

This intentionally matches the `_wrap.ts` envelope shape so chat-side
error handling needs no special case for timeouts.

## Concurrency

Multiple `POST /mcp` requests may be in flight at the same time. The HTTP
server creates an isolated `IncomingMessage` / `ServerResponse` pair per
request, and the SDK's stateless transport processes each request
independently. There is no shared mutable state across requests in our
code (FR-014).

## Connection Lifecycle During Shutdown

On `SIGTERM`/`SIGINT`:

1. `httpServer.close()` is called immediately — no new connections
   accepted; existing keep-alive connections are allowed to finish their
   current request but are not assigned new ones.
2. In-flight requests run to completion within the 10 s grace window.
3. If 10 s elapse with requests still pending, `process.exit(0)` is called.

A new TCP connection that arrives after `httpServer.close()` will be
refused at the OS level (connection reset). A request that arrives on an
already-open keep-alive connection during shutdown is responded to with
`503 Service Unavailable`.

## Cross-Reference

- Stdio behavioral parity: spec.md FR-007.
- Stateless mode rationale: research.md Decision 1.
- Per-request timeout behavior: spec.md FR-011a, research.md Decision 5.
- Shutdown semantics: spec.md FR-011, research.md Decision 8.
