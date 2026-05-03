# Contract: `GET /health`

**Feature**: 006-mcp-http-transport
**Endpoint**: `GET /health` (HTTP mode only)
**Transport**: Same Node `http.Server` as `/mcp`. Routed by
`apps/mcp-server/src/transports/http.ts`. **Not delegated to the SDK** —
this is a server-owned endpoint.

This endpoint exists so an orchestrator (Coolify, Docker, a future load
balancer) can confirm the MCP process is alive without speaking the MCP
protocol. It is also useful for human smoke tests during deploys
(`curl http://price-monitor-mcp-prod:3001/health`).

## Request

| Aspect | Value |
|---|---|
| Method | `GET` |
| Path | `/health` |
| Headers | None required. |
| Body | None. |
| Authentication | None. |

```http
GET /health HTTP/1.1
Host: price-monitor-mcp-prod:3001
```

## Successful Response

| Aspect | Value |
|---|---|
| Status | `200 OK` |
| Content-Type | `application/json; charset=utf-8` |
| Body | A JSON object with the four fields below. |

| Field | Type | Source | Notes |
|---|---|---|---|
| `status` | `"ok"` | Constant | If the process can answer the request at all, it is "ok" by definition. Future health checks (e.g., DB ping) would extend this enum to include `"degraded"` etc., out of scope here. |
| `uptime` | `number` (seconds) | `(Date.now() - startedAtMs) / 1000` | Fractional seconds; serialized as a JSON number. |
| `version` | `string` | The `version` field from `apps/mcp-server/package.json` | Lets operators confirm which release answered the probe. |
| `transport` | `"http"` | Literal | Always `"http"` because this endpoint exists only in HTTP mode. Useful when triaging "did the right transport boot?" |

### Example response

```http
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8
Content-Length: 75

{"status":"ok","uptime":142.317,"version":"1.0.0","transport":"http"}
```

## Error Responses

| Condition | Status | Body |
|---|---|---|
| `POST /health` (or any non-`GET` method) | `405 Method Not Allowed` + `Allow: GET` | `Method Not Allowed` (text) |

There are no other documented failure modes for this endpoint. If the
process is unresponsive (the orchestrator scenario this endpoint exists
to detect), the TCP connection itself will fail or hang — that is the
signal the orchestrator acts on.

## Performance

- SC-003: response MUST arrive within **50 ms** on `localhost`. The handler
  reads no I/O — it returns a small JSON object built from in-memory
  values — so this is comfortably achievable.

## Logging

Per FR-013a, `GET /health` requests MUST NOT be logged (orchestrator
probes would otherwise dominate the log stream).

## Behavior in stdio mode

This endpoint **does not exist** when `MCP_TRANSPORT` is unset or set to
`stdio`. No HTTP listener is opened in stdio mode (FR-002), so any
attempt to reach `/health` on the documented port will fail at the TCP
layer (connection refused). This is intentional — orchestrators are not
expected to probe a stdio-mode process.

## Cross-Reference

- Field shape: spec.md FR-006, data-model.md §2.
- Latency target: spec.md SC-003.
- Probe-spam exclusion: spec.md FR-013a.
- Stdio non-existence: spec.md FR-002.
