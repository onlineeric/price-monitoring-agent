# Task 2.12: Final Configuration Updates

**Type:** AI Generation
**Performer:** AI
**Phase:** 2 - Production Deployment

---

## Objective

Review all configuration files for production readiness, remove hardcoded localhost references, ensure proper error handling, and configure production-specific logging.

---

## Context

This is the final code review task before production deployment. It ensures:
- No development-only code in production
- Proper error handling for production
- Logging configured for debugging
- No security issues
- Clean, production-ready codebase

---

## Review Checklist

### 1. Localhost References

**Search For:**
```bash
grep -r "localhost" apps/ packages/ --exclude-dir=node_modules
grep -r "127.0.0.1" apps/ packages/ --exclude-dir=node_modules
grep -r "192.168" apps/ packages/ --exclude-dir=node_modules
```

**Actions:**
- Replace hardcoded localhost with environment variables
- Ensure URLs are configurable via env vars
- Remove any development-only hardcoded URLs

**Example Fix:**
```typescript
// Bad
const apiUrl = "http://localhost:3000/api";

// Good
const apiUrl = process.env.API_URL || "http://localhost:3000/api";
```

### 2. Error Handling

**Check:**
- All API endpoints have try-catch blocks
- Database queries handle failures gracefully
- Worker job handlers catch errors
- Errors are logged (not silently swallowed)
- User-facing errors are friendly (not technical stack traces)

**Example:**
```typescript
// API Route
export async function POST(request: Request) {
  try {
    // ... logic
    return Response.json({ success: true });
  } catch (error) {
    console.error("API error:", error);
    return Response.json(
      { success: false, error: "Failed to process request" },
      { status: 500 }
    );
  }
}
```

### 3. Production Logging

**Implement/Verify:**
- Console logs for important events
- Structured logging format
- Log levels (info, warn, error)
- No excessive debug logs in production

**Add logging to:**
- Worker startup
- Job processing (start, success, failure)
- Scheduler registration
- Database connections
- Redis connections
- Email sending

**Example:**
```typescript
console.log("[WORKER] Starting worker...");
console.log("[WORKER] Connected to Redis");
console.log("[SCHEDULER] Registered repeatable job: 0 9 * * *");
console.error("[WORKER] Job failed:", error);
```

### 4. Environment Variables

**Verify all environment variables have:**
- Default values where appropriate
- Validation on startup
- Clear error messages if missing required vars

**Example:**
```typescript
// Validate required environment variables on startup
const requiredEnvVars = [
  'DATABASE_URL',
  'REDIS_URL',
  'AI_PROVIDER',
  'RESEND_API_KEY',
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}
```

### 5. Security

**Check for:**
- No API keys in code (only env vars)
- No sensitive data in logs
- SQL injection prevention (Drizzle handles this)
- XSS prevention in Next.js (React handles this)
- CORS configured if needed

**Verify:**
- Database connection uses parameterized queries (Drizzle ORM ✓)
- User input is validated
- No `eval()` or `Function()` with user input

### 6. Performance

**Review:**
- Database queries are optimized
- Indexes on frequently queried columns
- Connection pooling configured
- No N+1 query problems

### 7. Next.js Production Configuration

**Check `next.config.ts`:**
```typescript
const nextConfig = {
  output: 'standalone', // ✓ Required for Docker
  // Add production optimizations
  reactStrictMode: true,
  swcMinify: true,
};
```

---

## Implementation Tasks

### Task 1: Remove Localhost References

Search and replace any hardcoded localhost URLs with environment variables.

### Task 2: Add Environment Variable Validation

Create a startup validation function:

**File:** `apps/worker/src/utils/validateEnv.ts`

```typescript
export function validateEnv() {
  const required = [
    'DATABASE_URL',
    'REDIS_URL',
    'AI_PROVIDER',
    'RESEND_API_KEY',
  ];

  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    console.error('Missing required environment variables:');
    missing.forEach(key => console.error(`  - ${key}`));
    process.exit(1);
  }

  console.log('✓ All required environment variables present');
}
```

Call this in worker startup:
```typescript
// apps/worker/src/index.ts
import { validateEnv } from './utils/validateEnv';

validateEnv(); // Validate before doing anything else
```

### Task 3: Enhance Error Logging

Add structured error logging:

**Example for Worker:**
```typescript
// Job processor
worker.on('failed', (job, err) => {
  console.error('[JOB FAILED]', {
    jobId: job?.id,
    jobName: job?.name,
    error: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });
});
```

### Task 4: Production Logging

Add key lifecycle logs:

**Worker:**
```typescript
console.log('[WORKER] Starting Price Monitor Worker');
console.log('[WORKER] Environment:', process.env.NODE_ENV);
console.log('[WORKER] Connecting to Redis...');
// ... after connection
console.log('[WORKER] ✓ Connected to Redis');
console.log('[WORKER] ✓ Connected to Database');
console.log('[WORKER] Listening for jobs...');
```

**Scheduler:**
```typescript
console.log('[SCHEDULER] Starting digest scheduler');
console.log('[SCHEDULER] Reading schedule from database...');
console.log('[SCHEDULER] Registered repeatable job with pattern:', cronPattern);
```

### Task 5: Error Handling Review

Review all try-catch blocks and ensure:
- Errors are logged
- User-facing errors are friendly
- Critical errors exit gracefully

### Task 6: Configuration Documentation

Update any changed configurations in comments or documentation.

---

## Deliverables

1. **Updated Code:**
   - No localhost references
   - Environment variable validation added
   - Enhanced error handling
   - Production logging implemented

2. **Documentation:**
   - Note any configuration changes
   - Document new logging format

---

## Verification Steps

1. **Search for localhost:**
   ```bash
   grep -r "localhost" apps/ packages/ --exclude-dir=node_modules
   # Should return minimal or zero results
   ```

2. **Test environment validation:**
   ```bash
   # Remove a required env var
   unset DATABASE_URL
   pnpm --filter @price-monitor/worker dev
   # Should exit with clear error message
   ```

3. **Build succeeds:**
   ```bash
   pnpm --filter @price-monitor/web build
   pnpm --filter @price-monitor/worker build
   # Should build without errors
   ```

4. **Logs are clear:**
   - Run worker
   - Check logs show structured output
   - No excessive debug logs

---

## Success Criteria

- [ ] No hardcoded localhost references
- [ ] All URLs configurable via environment variables
- [ ] Environment variable validation on startup
- [ ] Clear error messages for missing vars
- [ ] Production error handling in all API routes
- [ ] Structured logging in worker
- [ ] Key lifecycle events logged
- [ ] No sensitive data in logs
- [ ] Build succeeds for both apps
- [ ] No security issues identified
- [ ] Configuration documented

---

## Notes

- Focus on production readiness
- Prioritize user experience (friendly errors)
- Ensure debugging is possible (good logs)
- Don't over-engineer - keep it simple
- Document any breaking changes
