# Task 1.9: Update .env.example

**Type:** AI - Configuration
**Performer:** Claude
**Phase:** 1 - Local Development Simplification
**Dependencies:** Task 1.7 (docker-compose.yml created)
**Estimated Time:** 2 minutes

---

## What

Update `.env.example` file to use `localhost` URLs for PostgreSQL and Redis instead of VM IP addresses, reflecting the docker-compose setup.

---

## Objective

Provide a template that:
- Shows correct DATABASE_URL format for docker-compose
- Shows correct REDIS_URL format for docker-compose
- Documents all required environment variables
- Serves as a starting point for developers' `.env` files

---

## How to Do

### Changes Required

Locate `.env.example` in project root and update:

#### 1. DATABASE_URL

**Old (VM-based):**
```env
DATABASE_URL="postgresql://postgres:password@192.168.64.x:5432/priceMonitor"
```

**New (localhost):**
```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/priceMonitor"
```

#### 2. REDIS_URL

**Old (VM-based):**
```env
REDIS_URL="redis://192.168.64.x:6379"
```

**New (localhost):**
```env
REDIS_URL="redis://localhost:6379"
```

### Full .env.example Structure

Ensure the file includes all necessary variables:

**Database & Redis:**
```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/priceMonitor"
REDIS_URL="redis://localhost:6379"
```

**AI Provider Configuration:**
```env
# AI Provider (options: openai, google, anthropic)
AI_PROVIDER="anthropic"

# API Keys (add your keys)
OPENAI_API_KEY="your-openai-api-key-here"
GOOGLE_GENERATIVE_AI_API_KEY="your-google-api-key-here"
ANTHROPIC_API_KEY="your-anthropic-api-key-here"
```

**Email Service:**
```env
RESEND_API_KEY="your-resend-api-key-here"
```

**Application Config:**
```env
NODE_ENV="development"
ENABLE_SCHEDULER="false"
```

**Optional Debug Flags:**
```env
# Force AI extraction even if selectors work (for testing)
# FORCE_AI_EXTRACTION="true"
```

### Comments and Documentation

Add helpful comments:
- Explain what each variable does
- Provide examples where helpful
- Note which variables are optional
- Link to documentation for API keys

---

## Technical Specifications

### File Location

```
/home/onlineeric/repos/price-monitoring-agent/.env.example
```

### Variable Formats

**DATABASE_URL:**
- Protocol: `postgresql://`
- Format: `postgresql://user:password@host:port/database`
- Local dev: `localhost:5432`
- Production: Coolify internal DNS (different file)

**REDIS_URL:**
- Protocol: `redis://`
- Format: `redis://host:port`
- Local dev: `localhost:6379`
- No authentication (local only)

**API Keys:**
- Placeholder format: `your-provider-api-key-here`
- Clear that these need to be replaced

**ENABLE_SCHEDULER:**
- Type: String boolean ("true" or "false")
- Local dev: "false" (no scheduled jobs)
- Production: "true" on ONE worker only

---

## Deliverables

- [ ] .env.example updated with localhost URLs
- [ ] DATABASE_URL uses localhost:5432
- [ ] REDIS_URL uses localhost:6379
- [ ] All required variables documented
- [ ] Helpful comments added
- [ ] Placeholder values clear (need replacement)

---

## Verification Steps

### 1. Check Database URL

```bash
grep "DATABASE_URL" .env.example
```

**Expected:**
```
DATABASE_URL="postgresql://postgres:password@localhost:5432/priceMonitor"
```

### 2. Check Redis URL

```bash
grep "REDIS_URL" .env.example
```

**Expected:**
```
REDIS_URL="redis://localhost:6379"
```

### 3. Verify No VM IPs

```bash
grep "192.168" .env.example
```

**Expected:** No matches (or only in comments explaining old setup).

### 4. Check All Required Variables Present

```bash
grep -E "DATABASE_URL|REDIS_URL|AI_PROVIDER|ANTHROPIC_API_KEY|RESEND_API_KEY|NODE_ENV|ENABLE_SCHEDULER" .env.example
```

**Expected:** All 7 variables present.

---

## Success Criteria

- [x] .env.example exists in project root
- [x] DATABASE_URL uses localhost (not VM IP)
- [x] REDIS_URL uses localhost (not VM IP)
- [x] All required environment variables included
- [x] Comments explain each variable's purpose
- [x] Placeholder values are clearly marked
- [x] File follows consistent formatting

---

## Notes

### .env.example vs .env

- **.env.example:** Template, committed to git, no secrets
- **.env:** Actual config, NOT committed (in .gitignore), contains real API keys

**Developer workflow:**
```bash
# Copy template
cp .env.example .env

# Add real API keys
nano .env  # or vim, code, etc.
```

### Why localhost?

docker-compose exposes ports directly on the host:
- Container port 5432 → Host port 5432
- Container port 6379 → Host port 6379

Applications running on the host (via `pnpm dev`) connect to `localhost`.

**Alternative:** Use service names (postgres, redis) if apps ran in containers too, but Implementation 3 runs apps on host.

### Port Customization

If default ports conflict, users can:
1. Change ports in docker-compose.yml
2. Update .env URLs accordingly

**Example:** Use 5433 for PostgreSQL:
```yaml
# docker-compose.yml
ports:
  - "5433:5432"
```
```env
# .env
DATABASE_URL="postgresql://postgres:password@localhost:5433/priceMonitor"
```

### Credentials

**Default credentials:**
- User: `postgres`
- Password: `password`
- Database: `priceMonitor`

**OK for local dev** (no security risk).

**Production:** Use strong passwords, managed via Coolify secrets.

---

## Troubleshooting

### File Not Found

**Symptom:** .env.example doesn't exist

**Solution:** Create it from scratch with the structure above.

### Variable Name Typos

**Symptom:** Apps can't find config

**Common typos:**
- `DATABASE_URL` (correct) vs `DATABASE_URI`
- `REDIS_URL` (correct) vs `REDIS_URI`
- `ANTHROPIC_API_KEY` (correct) vs `CLAUDE_API_KEY`

**Solution:** Verify exact names match what apps expect.

### URL Format Errors

**Common errors:**
- Missing protocol: `localhost:5432` (missing `postgresql://`)
- Wrong protocol: `postgres://...` (should be `postgresql://`)
- Missing port: `postgresql://localhost/db` (should include `:5432`)

**Correct format:**
```
postgresql://user:password@host:port/database
redis://host:port
```

---

## Next Steps

After completing this task:
1. Proceed to **Task 1.10: Update CLAUDE.md**
2. Users will copy .env.example to .env in their setup
3. Document this step in README.md (Task 1.11)

---

## Reference: Complete .env.example

```env
# ===========================
# Database & Cache
# ===========================

# PostgreSQL connection (running via docker-compose)
DATABASE_URL="postgresql://postgres:password@localhost:5432/priceMonitor"

# Redis connection (running via docker-compose)
REDIS_URL="redis://localhost:6379"

# ===========================
# AI Provider Configuration
# ===========================

# Which AI provider to use: openai, google, or anthropic
AI_PROVIDER="anthropic"

# OpenAI API Key (if using AI_PROVIDER=openai)
OPENAI_API_KEY="your-openai-api-key-here"

# Google Gemini API Key (if using AI_PROVIDER=google)
GOOGLE_GENERATIVE_AI_API_KEY="your-google-api-key-here"

# Anthropic Claude API Key (if using AI_PROVIDER=anthropic)
ANTHROPIC_API_KEY="your-anthropic-api-key-here"

# ===========================
# Email Service
# ===========================

# Resend API Key for sending digest emails
# Get one at: https://resend.com/api-keys
RESEND_API_KEY="your-resend-api-key-here"

# ===========================
# Application Config
# ===========================

# Node environment: development or production
NODE_ENV="development"

# Enable scheduled jobs (set to "true" on ONE worker only in production)
ENABLE_SCHEDULER="false"

# ===========================
# Optional Debug Flags
# ===========================

# Force AI extraction even if selectors work (for testing)
# FORCE_AI_EXTRACTION="true"
```

**Note:** This is for reference. Actual file may have additional variables.

---

**Task Status:** Ready for execution
