# Task 1.14: Remove Old Vercel Cron Endpoint

**Type:** AI Generation
**Performer:** AI
**Phase:** 1 - Local VM + CICD

---

## Objective

Remove the old Vercel Cron endpoint (`/api/cron/check-all`) and related configuration as it's being replaced by BullMQ Repeatable Jobs managed by the worker.

---

## Context

In Implementation 1, scheduling was handled by:
```
Vercel Cron (every 30 mins) → GET /api/cron/check-all → Enqueues jobs
```

In Implementation 2, scheduling is handled by:
```
Worker startup → Read schedule from DB → Register BullMQ Repeatable Job
```

The Vercel Cron endpoint is no longer needed and should be removed to avoid confusion.

---

## Files to Remove/Modify

### 1. API Route File
**Location (likely):** `apps/web/app/api/cron/check-all/route.ts`

This file handles the cron endpoint. It should be deleted entirely.

**Alternative locations to check:**
- `apps/web/pages/api/cron/check-all.ts` (if using Pages Router)
- `apps/web/app/api/cron/` directory

### 2. Vercel Configuration
**Location:** `vercel.json` (if exists in project root or `apps/web/`)

Look for cron configuration like:
```json
{
  "crons": [{
    "path": "/api/cron/check-all",
    "schedule": "*/30 * * * *"
  }]
}
```

**Actions:**
- If `vercel.json` only contains cron config → Delete entire file
- If `vercel.json` contains other config → Remove only cron section

### 3. Related Imports and References

Search codebase for references to `/api/cron/check-all`:
- Import statements
- API client calls
- Documentation mentions
- Comments referencing the endpoint

**Remove all references.**

---

## Implementation Steps

1. **Locate the cron endpoint file:**
   - Search for `check-all` in `apps/web/app/api/` or `apps/web/pages/api/`
   - Delete the file and parent directory if empty

2. **Check for vercel.json:**
   - Search for `vercel.json` in project root and `apps/web/`
   - Remove cron configuration or delete file

3. **Search for references:**
   ```bash
   # Search for references in codebase
   grep -r "check-all" apps/web/
   grep -r "/api/cron" apps/web/
   ```
   - Remove any import statements
   - Remove any API calls to this endpoint
   - Update comments if needed

4. **Update documentation:**
   - Remove mentions of Vercel Cron in CLAUDE.md
   - Remove mentions of the endpoint in README.md
   - Update architecture diagrams or descriptions

---

## What NOT to Remove

**Keep these related files:**
- Manual digest trigger functionality (used by UI button)
- Settings API for email schedule configuration
- Any shared utilities used by digest email
- BullMQ job definitions

**Only remove:**
- The automatic cron endpoint
- Vercel cron configuration
- References to Vercel-based scheduling

---

## Deliverables

1. **Deleted Files:**
   - API route file for `/api/cron/check-all`
   - `vercel.json` (if it only contained cron config)

2. **Modified Files:**
   - `vercel.json` (if it has other config, remove just cron section)
   - Any files that imported or referenced the cron endpoint

3. **Updated Documentation:**
   - CLAUDE.md (remove Vercel Cron references)
   - README.md (remove Vercel Cron references)
   - Comments mentioning Vercel Cron scheduling

---

## Verification Steps

1. **File deletion confirmed:**
   ```bash
   # Should not find the cron endpoint
   find . -name "*check-all*" -type f
   ```

2. **No broken imports:**
   ```bash
   # Build should succeed
   pnpm --filter @price-monitor/web build
   ```

3. **No references remain:**
   ```bash
   # Search for lingering references
   grep -r "check-all" apps/ packages/
   grep -r "vercel.*cron" apps/ packages/
   ```

---

## Success Criteria

- [ ] `/api/cron/check-all` endpoint file deleted
- [ ] Vercel cron configuration removed from `vercel.json`
- [ ] `vercel.json` deleted (if it only had cron config)
- [ ] No import errors from deleted files
- [ ] No broken references in codebase
- [ ] Documentation updated (CLAUDE.md, README.md)
- [ ] Build succeeds: `pnpm --filter @price-monitor/web build`
- [ ] No mentions of Vercel Cron in docs
- [ ] Manual digest trigger still works (not removed)

---

## Notes

- This task only removes the **automated** Vercel Cron endpoint
- Manual digest trigger (UI button) should remain functional
- The actual digest logic is being moved to worker's BullMQ Repeatable Jobs
- Be careful not to break the manual trigger functionality
