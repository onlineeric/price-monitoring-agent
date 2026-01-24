# Production Environment Variables

This document lists all environment variables required for production deployment of the Price Monitor AI Agent.

## Overview

Environment variables are set in the Coolify dashboard for each application:
- **Web Application:** Contains UI and API
- **Worker Application:** Processes background jobs

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
- [ ] NODE_ENV (`production`)
- [ ] FORCE_AI_EXTRACTION (`false` or omit)

### Worker Application

- [ ] DATABASE_URL (Coolify internal DNS)
- [ ] REDIS_URL (Coolify internal DNS)
- [ ] AI_PROVIDER (`anthropic`)
- [ ] ANTHROPIC_API_KEY (your key)
- [ ] ANTHROPIC_MODEL (`claude-haiku-4-5`)
- [ ] RESEND_API_KEY (your key)
- [ ] ENABLE_SCHEDULER (`true`)
- [ ] NODE_ENV (`production`)
- [ ] FORCE_AI_EXTRACTION (`false` or omit)

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
