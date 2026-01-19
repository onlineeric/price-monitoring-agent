# Task 1.11: Update README.md

**Type:** AI - Documentation
**Performer:** Claude
**Phase:** 1 - Local Development Simplification
**Dependencies:** Tasks 1.7, 1.8 (docker-compose and scripts created)
**Estimated Time:** 5 minutes

---

## What

Update `README.md` to replace Multipass VM setup instructions with docker-compose workflow, providing clear and concise setup instructions for new developers.

---

## Objective

Ensure README.md:
- Shows docker-compose setup (not VM)
- Provides quick start instructions
- Documents all docker commands
- Guides users through first-time setup
- Serves as the entry point for new developers

---

## How to Do

### Sections to Update

#### 1. Prerequisites Section

**Update to:**

```markdown
## Prerequisites

- **Node.js** 18+ and **pnpm** 8+
- **Docker Desktop** (or Docker Engine with docker-compose)
- **API Keys:**
  - Anthropic API key (or OpenAI/Google)
  - Resend API key for email
```

**Remove:**
- Multipass installation requirement
- VM-related prerequisites

#### 2. Getting Started / Setup Section

**Replace with streamlined setup:**

```markdown
## Getting Started

### 1. Clone and Install

```bash
git clone <repository-url>
cd price-monitoring-agent
pnpm install
```

### 2. Start Local Services

Start PostgreSQL and Redis using docker-compose:

```bash
pnpm docker:up
```

This starts:
- PostgreSQL 15 on `localhost:5432`
- Redis 7 on `localhost:6379`

**Verify services are healthy:**
```bash
docker ps
# Both containers should show (healthy)
```

### 3. Configure Environment

Copy the environment template and add your API keys:

```bash
cp .env.example .env
```

Edit `.env` and add:
- Your Anthropic API key (or OpenAI/Google)
- Your Resend API key

**Database and Redis URLs are already configured for localhost.**

### 4. Set Up Database

Push the database schema:

```bash
pnpm --filter @price-monitor/db push
```

### 5. Start Development Servers

Open two terminal windows:

**Terminal 1 - Web App:**
```bash
pnpm --filter @price-monitor/web dev
```

**Terminal 2 - Worker:**
```bash
pnpm --filter @price-monitor/worker dev
```

### 6. Access the Application

Open http://localhost:3000 in your browser.

### 7. Stop Services When Done

```bash
pnpm docker:down
```
```

#### 3. Docker Commands Section (New)

**Add new section:**

```markdown
## Docker Commands

Manage local PostgreSQL and Redis services:

```bash
# Start services (detached)
pnpm docker:up

# Stop services (preserves data)
pnpm docker:down

# Stop and remove volumes (fresh start)
pnpm docker:clean

# View service logs
pnpm docker:logs

# Check service status
docker ps
```

**Troubleshooting:**

- **Port conflicts:** If 5432 or 6379 is already in use, stop conflicting services or change ports in `docker-compose.yml`
- **Services won't start:** Ensure Docker is running: `docker --version`
- **Connection errors:** Verify services are healthy: `docker ps` (should show "healthy" status)
```

#### 4. Development Commands Section

**Update existing commands** to include docker:

```markdown
## Development Commands

```bash
# Services
pnpm docker:up                          # Start PostgreSQL and Redis
pnpm docker:down                        # Stop services

# Development
pnpm install                            # Install dependencies
pnpm --filter @price-monitor/web dev    # Start Next.js (port 3000)
pnpm --filter @price-monitor/worker dev # Start worker

# Database
pnpm --filter @price-monitor/db push    # Push schema changes
pnpm --filter @price-monitor/db studio  # Open Drizzle Studio

# Code Quality
pnpm lint                               # Run linter (Biome)
pnpm --filter @price-monitor/web build  # Build for production
```
```

#### 5. Architecture / Project Structure Section

**Update if it mentions VM.**

**Simplified architecture diagram:**

```markdown
## Architecture

**Local Development:**
```
WSL Ubuntu / macOS / Linux
├── Docker (docker-compose)
│   ├── PostgreSQL 15
│   └── Redis 7
├── Next.js Web App (localhost:3000)
└── BullMQ Worker
```

**Production (Future):**
```
DigitalOcean Droplet
└── Coolify
    ├── PostgreSQL
    ├── Redis
    ├── Web App (Docker)
    └── Worker (Docker)
```
```

#### 6. Environment Variables Section

**Add or update:**

```markdown
## Environment Variables

Copy `.env.example` to `.env` and configure:

### Required

```env
# Database (docker-compose services)
DATABASE_URL="postgresql://postgres:password@localhost:5432/priceMonitor"
REDIS_URL="redis://localhost:6379"

# AI Provider (choose one)
AI_PROVIDER="anthropic"  # or "openai" or "google"
ANTHROPIC_API_KEY="your-key-here"

# Email Service
RESEND_API_KEY="your-key-here"
```

### Optional

```env
NODE_ENV="development"
ENABLE_SCHEDULER="false"  # Set to "true" in production worker only
```

**Getting API Keys:**
- Anthropic: https://console.anthropic.com/
- Resend: https://resend.com/api-keys
```

#### 7. Troubleshooting Section

**Add Docker troubleshooting:**

```markdown
## Troubleshooting

### Docker Services

**Problem:** Containers won't start

**Solutions:**
1. Ensure Docker is running: `docker ps`
2. Check for port conflicts: `sudo lsof -i :5432` and `:6379`
3. View logs: `pnpm docker:logs`
4. Try fresh start: `pnpm docker:clean && pnpm docker:up`

**Problem:** Can't connect to database

**Solutions:**
1. Verify services are healthy: `docker ps` (should show "healthy")
2. Check .env has correct URL: `postgresql://postgres:password@localhost:5432/priceMonitor`
3. Test connection: `docker exec -it price-monitor-postgres psql -U postgres -d priceMonitor`

### Application

**Problem:** Web app won't start

**Solutions:**
1. Check dependencies installed: `pnpm install`
2. Verify .env file exists and has required keys
3. Check PostgreSQL is running: `docker ps | grep postgres`
```

---

## Technical Specifications

### File Location

```
/home/onlineeric/repos/price-monitoring-agent/README.md
```

### Key Updates Summary

| Section | Action | Focus |
|---------|--------|-------|
| Prerequisites | Update | Docker, not Multipass |
| Getting Started | Rewrite | docker-compose workflow |
| Docker Commands | Add | New section for pnpm scripts |
| Development Commands | Update | Include docker commands |
| Architecture | Simplify | Show docker-compose |
| Environment Variables | Update | localhost URLs |
| Troubleshooting | Add | Docker-specific issues |

### Tone and Style

README.md is for **human developers**:
- Clear, step-by-step instructions
- Beginner-friendly explanations
- Practical examples
- Links to external resources
- Quick reference for common tasks

---

## Deliverables

- [ ] README.md updated with docker-compose setup
- [ ] VM setup instructions removed
- [ ] Clear getting started guide
- [ ] Docker commands documented
- [ ] Environment variables section updated
- [ ] Troubleshooting covers common Docker issues
- [ ] File is well-formatted and readable

---

## Verification Steps

### 1. Check for VM References

```bash
grep -i "multipass" README.md
grep -i "vm" README.md
```

**Expected:** No matches (or only in historical context).

### 2. Check Docker Commands Present

```bash
grep "pnpm docker:" README.md
```

**Expected:** Multiple matches in setup and commands sections.

### 3. Check localhost URLs

```bash
grep "localhost:5432" README.md
grep "localhost:6379" README.md
```

**Expected:** Found in environment variables section.

### 4. Test Instructions (Optional)

Mentally walk through the Getting Started steps:
- Are they complete?
- Is the order logical?
- Are commands correct?
- Would a new developer succeed?

---

## Success Criteria

- [x] README.md reflects docker-compose setup
- [x] VM references removed from setup instructions
- [x] Getting Started section is clear and complete
- [x] All docker commands documented
- [x] Environment variables use localhost
- [x] Troubleshooting covers Docker issues
- [x] File is formatted consistently
- [x] Instructions are beginner-friendly

---

## Notes

### README vs CLAUDE.md

**README.md:**
- For human developers
- Setup-focused
- Quick reference
- Links to resources

**CLAUDE.md:**
- For AI assistants
- Comprehensive guide
- Architecture details
- Development practices

Both should be consistent but with different audiences.

### Keep It Concise

README should be scannable:
- Use headers for navigation
- Code blocks for commands
- Short paragraphs
- Bullet points for lists

### Links to Documentation

Consider linking to:
- Docker installation: https://docs.docker.com/get-docker/
- API key signup pages
- Project specs in `specs/` directory

---

## Troubleshooting

### Too Much Detail

**Symptom:** README becomes a novel

**Solution:** Move detailed info to:
- `docs/` directory for deep dives
- `CLAUDE.md` for AI-specific guidance
- Inline comments in code

Keep README high-level and actionable.

### Inconsistent Commands

**Symptom:** Some sections use `docker-compose`, others use `pnpm docker:`

**Solution:** Standardize on `pnpm docker:*` scripts (user-friendly).

Mention direct commands in parentheses for reference:
```markdown
pnpm docker:up  # or: docker-compose up -d
```

### Missing Prerequisites

**Symptom:** User follows steps but hits errors

**Solution:** Ensure Prerequisites section covers:
- System requirements (OS, RAM)
- Required software (Node, pnpm, Docker)
- Required accounts (API keys)

---

## Next Steps

After completing this task:
1. Proceed to **Task 1.12: Remove Multipass References**
2. README serves as primary onboarding document
3. User will review in Task 1.6

---

**Task Status:** Ready for execution
