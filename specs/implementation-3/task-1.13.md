# Task 1.13: Create Troubleshooting Guide

**Type:** AI - Documentation
**Performer:** Claude
**Phase:** 1 - Local Development Simplification
**Dependencies:** Task 1.7 (docker-compose.yml created)
**Estimated Time:** 10 minutes

---

## What

Create a comprehensive troubleshooting guide (`docs/troubleshooting-docker.md`) that documents common docker-compose issues, their causes, and solutions for local development.

---

## Objective

Provide developers with:
- Quick solutions to common Docker problems
- Diagnostic commands to identify issues
- Step-by-step fix procedures
- WSL-specific troubleshooting (since project targets WSL Ubuntu)

This reduces friction and helps developers self-serve when issues arise.

---

## How to Do

### Document Structure

Create `docs/troubleshooting-docker.md` with these sections:

#### 1. Table of Contents
Quick navigation to common issues.

#### 2. Docker Installation Issues
- Docker command not found
- Docker daemon not running
- Permission denied errors
- WSL integration problems

#### 3. Service Startup Issues
- Containers won't start
- Port already in use
- Image pull failures
- Healthcheck failures

#### 4. Connection Issues
- Can't connect to PostgreSQL
- Can't connect to Redis
- localhost not resolving
- Database authentication errors

#### 5. Data and Volume Issues
- Volume permission errors
- Data not persisting
- Corrupted data
- Disk space errors

#### 6. Network Issues
- Containers can't reach internet
- DNS resolution failures
- Proxy/firewall problems

#### 7. Performance Issues
- Slow container startup
- High CPU/memory usage
- Disk I/O problems

#### 8. WSL-Specific Issues
- Docker Desktop integration
- File system permissions
- Network configuration
- Resource limits

#### 9. Diagnostic Commands
Reference section with useful commands for troubleshooting.

---

## Technical Specifications

### File Location

```
/home/onlineeric/repos/price-monitoring-agent/docs/troubleshooting-docker.md
```

### Format Standards

**For each issue:**

```markdown
### Issue: [Short Description]

**Symptoms:**
- What the user sees
- Error messages
- Unexpected behavior

**Cause:**
Why this happens

**Solution:**
Step-by-step fix

**Verification:**
How to confirm it's fixed
```

### Common Issues to Cover

Must include solutions for:

1. **Port 5432 already in use**
2. **Port 6379 already in use**
3. **Docker daemon not running**
4. **Permission denied on /var/run/docker.sock**
5. **Container exits immediately**
6. **Healthcheck never passes**
7. **Cannot connect to PostgreSQL (ECONNREFUSED)**
8. **Cannot connect to Redis (ECONNREFUSED)**
9. **Database authentication failed**
10. **Volume permission errors in WSL**
11. **Slow Docker performance in WSL**
12. **Containers can't reach internet**

---

## Deliverables

- [ ] `docs/troubleshooting-docker.md` created
- [ ] Table of contents with links
- [ ] All common issues documented
- [ ] Clear symptoms, causes, solutions
- [ ] WSL-specific section included
- [ ] Diagnostic commands reference
- [ ] Examples and code blocks
- [ ] File is well-formatted

---

## Verification Steps

### 1. Check File Created

```bash
ls docs/troubleshooting-docker.md
```

### 2. Check Section Count

```bash
grep "^## " docs/troubleshooting-docker.md | wc -l
```

**Expected:** ~9 major sections.

### 3. Check Issue Count

```bash
grep "^### Issue:" docs/troubleshooting-docker.md | wc -l
```

**Expected:** 10+ issues documented.

### 4. Validate Markdown

```bash
# Check for broken links (if tool available)
markdown-link-check docs/troubleshooting-docker.md
```

---

## Success Criteria

- [x] Troubleshooting guide created in docs/
- [x] Table of contents for navigation
- [x] 10+ common issues documented
- [x] Each issue has symptoms, cause, solution
- [x] WSL-specific issues covered
- [x] Diagnostic commands section included
- [x] Code blocks properly formatted
- [x] File is clear and beginner-friendly

---

## Notes

### Target Audience

**Primary:** Developers new to Docker
**Secondary:** Experienced developers facing edge cases

**Tone:**
- Clear and patient
- Step-by-step instructions
- Explain why, not just how
- Provide context

### Reference Existing Issues

Link to related documentation:
- Docker official docs
- WSL documentation
- Stack Overflow threads (for complex issues)
- Project-specific issues in GitHub

### Keep It Practical

Focus on:
- Issues that WILL happen
- Solutions that HAVE worked
- Commands that ARE tested

Avoid:
- Hypothetical scenarios
- Untested solutions
- Obscure edge cases

---

## Troubleshooting

### Too Comprehensive

**Symptom:** Document becomes overwhelming

**Solution:** Focus on:
1. Issues specific to this project
2. Common Docker/WSL issues
3. Issues raised during testing

Move deep dives to external links.

### Solutions Don't Work

**Symptom:** Documented solution fails

**Action:**
1. Test the solution yourself
2. Provide alternative approaches
3. Link to official documentation
4. Note when to seek help

### Duplicate Content

**Symptom:** Similar issues in multiple sections

**Solution:** Use cross-references:
```markdown
### Issue: Redis Connection Refused

See [Cannot Connect to Redis](#issue-cannot-connect-to-redis) above.
```

---

## Next Steps

After completing this task:
1. Proceed to **Task 1.14: Verify Code and Commit Changes**
2. Link to this guide from README.md
3. Update as new issues are discovered

---

## Reference: Example Issue Format

```markdown
### Issue: Port 5432 Already in Use

**Symptoms:**
- Error when running `pnpm docker:up`:
  ```
  Error starting userland proxy: listen tcp 0.0.0.0:5432:
  bind: address already in use
  ```
- PostgreSQL container fails to start
- `docker ps` shows only Redis running

**Cause:**
Another process (old Multipass VM, system PostgreSQL, another container)
is already using port 5432.

**Solution:**

**Option 1: Stop conflicting service (Recommended)**

```bash
# Find what's using the port
sudo lsof -i :5432

# Example output:
# postgres  12345  user  ... *:5432 (LISTEN)

# Stop system PostgreSQL if found
sudo systemctl stop postgresql

# Or stop old VM if found
multipass stop coolify-local
```

**Option 2: Change docker-compose port**

Edit `docker-compose.yml`:
```yaml
services:
  postgres:
    ports:
      - "5433:5432"  # Use 5433 on host instead
```

Then update `.env`:
```env
DATABASE_URL="postgresql://postgres:password@localhost:5433/priceMonitor"
```

**Verification:**

```bash
# Start services
pnpm docker:up

# Check both containers running
docker ps | grep -E "postgres|redis"

# Should show both as (healthy)
```

**See Also:**
- [Port 6379 Already in Use](#issue-port-6379-already-in-use)
- [Docker Diagnostic Commands](#diagnostic-commands)
```

---

**Task Status:** Ready for execution
