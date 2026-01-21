# Task 1.6: Clean Up Old VM Documentation

**Type:** Manual - Documentation
**Performer:** User
**Phase:** 1 - Local Development Simplification
**Dependencies:** Tasks 1.10, 1.11, 1.12 (Docs updated by AI)
**Estimated Time:** 5 minutes

---

## What

Review the updated documentation files (CLAUDE.md, README.md, etc.) to ensure all Multipass VM and Coolify local setup references have been removed and replaced with docker-compose instructions.

---

## Objective

Ensure documentation accurately reflects Implementation 3 architecture:
- No stale VM setup instructions
- No outdated IP addresses or VM commands
- Clear docker-compose workflow documented
- No confusion between old and new approaches

This prevents future developers from following outdated instructions.

---

## How to Do

### Step 1: Review Updated Documentation

The AI (Claude) will have updated these files in tasks 1.10-1.12. Review each for:

**CLAUDE.md:**
```bash
cat CLAUDE.md | grep -i multipass
cat CLAUDE.md | grep -i "vm"
cat CLAUDE.md | grep "192.168"
```

**Expected:** No matches (or only in historical context like "Implementation 2 used...").

**README.md:**
```bash
cat readme.md | grep -i multipass
cat readme.md | grep -i coolify
```

**Expected:** No matches for local setup section.

### Step 2: Check Spec Documents

```bash
# Should find no VM references in Implementation 3 specs
grep -r "multipass" specs/implementation-3/
grep -r "coolify-local" specs/implementation-3/
```

**Expected:** No matches (or only in "Migration from Impl-2" historical context).

### Step 3: Verify Key Sections Updated

**In CLAUDE.md, look for:**
- [x] "Commands" section mentions `pnpm docker:up`
- [x] "Development Workflow" describes docker-compose
- [x] "Environment Configuration" shows `localhost` URLs
- [x] "Local VM" section removed or moved to historical notes

**In README.md, look for:**
- [x] Setup instructions mention Docker Desktop
- [x] No Multipass installation steps
- [x] Database URLs use `localhost`

### Step 4: Scan for IP Addresses

```bash
# Find any hardcoded VM IPs
grep -r "192.168" . --include="*.md" --exclude-dir=node_modules
```

**Review matches:**
- Remove VM IPs from current instructions
- Keep if in historical context (Implementation 2 section)

### Step 5: Check Scripts

```bash
# Look for VM-related scripts
ls scripts/ | grep -i multipass
ls scripts/ | grep -i vm
```

**If found:** Decide whether to:
- Delete (if only for VM setup)
- Update (if still useful but needs docker-compose)
- Archive (move to `scripts/archive/`)

### Step 6: Verify Example Environment File

```bash
cat .env.example | grep -E "DATABASE_URL|REDIS_URL"
```

**Expected:**
```
DATABASE_URL="postgresql://postgres:password@localhost:5432/priceMonitor"
REDIS_URL="redis://localhost:6379"
```

**Not:**
```
DATABASE_URL="postgresql://postgres:password@192.168.64.x:5432/priceMonitor"
```

---

## Technical Specifications

### Documentation Standards

**Acceptable VM Mentions:**
1. Historical context: "Implementation 2 used Multipass VM..."
2. Comparison tables: "Before (VM) vs After (docker-compose)"
3. Migration guides: "If migrating from Impl-2, remove VM..."

**Unacceptable VM Mentions:**
1. Current setup instructions
2. Troubleshooting guides (should be docker-compose specific)
3. Environment configuration examples

### Files to Review

**Primary Documentation:**
- `CLAUDE.md` - Project guide for AI
- `README.md` - Setup instructions for developers
- `.env.example` - Environment template
- `specs/implementation-3/*.md` - Implementation specs

**Secondary Files:**
- `package.json` - Should have docker scripts (Task 1.8)
- `scripts/*.sh` - Check for VM-related scripts
- Other markdown files in root

---

## Deliverables

- [ ] CLAUDE.md reviewed and VM-free (except historical context)
- [ ] README.md reviewed and VM-free
- [ ] .env.example has localhost URLs
- [ ] No stale VM references in docs
- [ ] Scripts directory cleaned up (if applicable)

---

## Verification Steps

### 1. Grep for Common VM Terms

```bash
# Run from project root
grep -ri "multipass" --include="*.md" . | grep -v implementation-2 | grep -v node_modules
grep -ri "coolify-local" --include="*.md" . | grep -v node_modules
grep -r "192.168" --include="*.md" . | grep -v node_modules
```

**Expected:** Only matches in historical sections (Implementation 2 specs, migration notes).

### 2. Test Documentation Accuracy

Follow the setup steps in README.md mentally:
- Do they mention Docker Desktop?
- Do they use `pnpm docker:up`?
- Do they reference localhost URLs?
- Are the steps clear and complete?

### 3. Check for Contradictions

Look for sections that mention both VM and docker-compose:
```bash
grep -A 5 -B 5 "multipass" CLAUDE.md | grep -i docker
```

**Review context:** Ensure it's comparing old vs new, not mixing instructions.

---

## Success Criteria

- [x] No Multipass/VM references in current setup instructions
- [x] .env.example uses localhost URLs
- [x] CLAUDE.md "Development Workflow" describes docker-compose
- [x] README.md setup mentions Docker Desktop
- [x] All docker-compose commands documented
- [x] No IP addresses (192.168.x.x) in current instructions
- [x] Scripts directory contains no VM-only scripts

---

## Notes

### Historical Context is OK

It's fine to mention the VM in historical context:
- "Implementation 2 used Multipass VM..."
- "Previous setup required VM installation..."
- "Migrating from Impl-2: remove VM first"

**Key:** Make it clear this is the OLD approach.

### Version Control

This task is the final review before committing. If you find issues:
1. Note them down
2. Fix directly (small changes) or ask AI to update
3. Re-review after fixes

### Documentation Consistency

Ensure consistency across all docs:
- Same port numbers everywhere (5432, 6379)
- Same credentials (postgres/password)
- Same commands (`pnpm docker:up`, not `docker-compose up`)
- Same terminology ("docker-compose", not "Docker Compose" or "docker compose")

---

## Troubleshooting

### Found VM References in Current Instructions

**Action:** Decide if it should be:
1. **Removed** - Stale instruction
2. **Updated** - Replace with docker-compose equivalent
3. **Moved** - Move to "Implementation 2 (Historical)" section

**Example fixes:**
```markdown
<!-- OLD (remove): -->
Start the VM: `multipass start coolify-local`

<!-- NEW: -->
Start services: `pnpm docker:up`
```

### Conflicting Information

**Symptom:** One section says VM, another says docker-compose

**Solution:**
1. Determine which is correct (should be docker-compose for Impl-3)
2. Update or remove the incorrect section
3. Add a note if historical context is useful

### Unclear Migration Path

**Symptom:** Doc doesn't explain how to move from VM to docker-compose

**Solution:** Add migration section:
```markdown
## Migrating from Implementation 2

If you were using the Multipass VM setup:
1. Stop and remove VM: `multipass delete coolify-local && multipass purge`
2. Install Docker Desktop
3. Update .env URLs to `localhost`
4. Start services: `pnpm docker:up`
```

### Scripts Still Reference VM

**Example:** `scripts/setup-vm.sh`

**Options:**
1. **Delete:** If only for VM setup
2. **Archive:** Move to `scripts/archive/implementation-2/`
3. **Update:** Rewrite for docker-compose

---

## Next Steps

After completing this task:
1. Proceed to **Task 1.14: Verify Code and Commit Changes**
2. All manual tasks complete!
3. Documentation is clean and accurate

**Note:** Tasks 1.7-1.13 are AI tasks and will be completed by Claude.

---

**Task Status:** Ready for execution (after AI updates docs in tasks 1.10-1.12)
