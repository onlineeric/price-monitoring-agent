# Task 1.12: Remove Multipass References

**Type:** AI - Documentation
**Performer:** Claude
**Phase:** 1 - Local Development Simplification
**Dependencies:** Tasks 1.10, 1.11 (Main docs updated)
**Estimated Time:** 5 minutes

---

## What

Search the entire codebase for remaining Multipass VM and Coolify local setup references, and remove or update them to reflect docker-compose architecture.

---

## Objective

Ensure no outdated VM instructions remain in:
- Documentation files (markdown)
- Scripts and configuration
- Comments in code
- Spec documents (except historical Implementation 2)

This prevents confusion and ensures documentation consistency.

---

## How to Do

### Step 1: Search for VM References

Use grep to find potential issues:

```bash
# Search markdown files
grep -r "multipass" --include="*.md" . | grep -v implementation-2 | grep -v node_modules

grep -r "coolify-local" --include="*.md" . | grep -v node_modules

grep -r "192.168" --include="*.md" . | grep -v node_modules

# Search scripts
grep -r "multipass" scripts/

# Search for VM mentions in general
grep -ri "virtual machine\|vm" --include="*.md" . | grep -v node_modules | grep -v implementation-2
```

### Step 2: Review Each Match

For each match found, decide:

1. **Remove** - Outdated instruction with no equivalent
2. **Update** - Replace with docker-compose equivalent
3. **Keep** - Historical context (Implementation 2) or valid VM mention (not about local dev)

### Step 3: Update or Remove Content

**Example transformations:**

**REMOVE (no equivalent):**
```markdown
<!-- Before -->
## Starting the Local VM
Run `multipass start coolify-local` to start services.

<!-- After -->
(Section removed entirely)
```

**UPDATE (has equivalent):**
```markdown
<!-- Before -->
Get the VM IP: `multipass info coolify-local | grep IPv4`

<!-- After -->
Services run on localhost (no IP lookup needed).
```

**KEEP (historical context):**
```markdown
<!-- Before (and After - no change) -->
Implementation 2 used Multipass VM for local services...
```

### Step 4: Check Specific Files

**Files likely to have references:**

1. **Root documentation:**
   - `README.md` (updated in Task 1.11)
   - `CLAUDE.md` (updated in Task 1.10)
   - Any `SETUP.md` or `INSTALL.md` files

2. **Scripts directory:**
   - `scripts/setup-vm.sh` (if exists - delete or archive)
   - `scripts/redeploy-local.sh` (may reference VM - update)
   - Any other shell scripts

3. **Docs directory:**
   - `docs/setup.md`
   - `docs/troubleshooting.md`
   - Any deployment guides

4. **Spec documents:**
   - `specs/implementation-3/*` (already should be clean)
   - Other specs outside implementation-2 and implementation-3

5. **Configuration files:**
   - `.env.example` (updated in Task 1.9)
   - Any docker or deployment configs

### Step 5: Handle Edge Cases

**VM IP addresses (192.168.x.x):**
- Remove from .env examples
- Remove from connection strings
- Keep in Implementation 2 historical docs

**Coolify mentions:**
- Remove "coolify-local" entirely
- Keep "Coolify" for production deployment context
- Clarify: "Coolify (production only)"

**VM commands:**
- Remove: `multipass start|stop|list|info`
- Don't replace with docker commands unless direct equivalent

---

## Technical Specifications

### Search Scope

**Include:**
- All `.md` files (except `specs/implementation-2/`)
- All `.sh` scripts
- Root configuration files
- Documentation directories

**Exclude:**
- `node_modules/`
- `.git/`
- `specs/implementation-1/` (archived)
- `specs/implementation-2/` (historical)

### Common VM Terms to Search

- `multipass`
- `coolify-local`
- `192.168.64.` (common Multipass IP range)
- `192.168.205.` (alternate Multipass range)
- `VM` or `virtual machine` (context-dependent)
- `Start the VM`
- `VM IP`

### Safe to Keep

**These mentions are OK:**
- "Implementation 2 used VM" (historical)
- "Coolify" in production context
- "VM" in general software discussions
- "192.168" in network troubleshooting (not as instruction)

---

## Deliverables

- [ ] All VM references found via grep
- [ ] Each reference reviewed and action decided
- [ ] Outdated instructions removed
- [ ] Equivalent instructions updated with docker-compose
- [ ] Scripts archived or updated
- [ ] No VM references in current setup/usage docs

---

## Verification Steps

### 1. Search for VM Terms

```bash
cd /home/onlineeric/repos/price-monitoring-agent

# Should find only historical mentions
grep -r "multipass" --include="*.md" . | grep -v implementation-2 | grep -v node_modules

# Should find only production mentions
grep -r "coolify" --include="*.md" . | grep -vi "coolify-local" | wc -l

# Should find no IP addresses in instructions
grep -r "192.168" --include="*.md" . | grep -v node_modules | grep -v implementation-2
```

### 2. Check Scripts Directory

```bash
ls scripts/
# Look for VM-related scripts
grep -r "multipass" scripts/
```

### 3. Check Key Files

```bash
# Should be clean (updated in previous tasks)
grep "multipass\|coolify-local" README.md CLAUDE.md .env.example
```

**Expected:** No matches (or only in migration/historical sections).

---

## Success Criteria

- [x] All VM references identified via grep
- [x] Outdated VM instructions removed
- [x] docker-compose equivalents documented
- [x] Scripts cleaned up or archived
- [x] No VM references in current setup docs
- [x] Historical context preserved appropriately
- [x] Documentation is consistent across files

---

## Notes

### Preserve History

It's good to keep historical context:

```markdown
## Migration from Implementation 2

Implementation 2 used a Multipass VM for local PostgreSQL and Redis.
Implementation 3 simplifies this with docker-compose.

If migrating from Impl-2:
1. Stop VM: `multipass stop coolify-local`
2. Delete VM: `multipass delete coolify-local && multipass purge`
3. Follow new setup instructions above
```

This helps users understand the change and migrate smoothly.

### Scripts to Handle

**If found:**

1. **scripts/setup-vm.sh**
   - Action: Delete or move to `scripts/archive/implementation-2/`
   - Reason: No longer needed

2. **scripts/redeploy-local.sh**
   - Action: Update if it references VM, or clarify it's for production
   - Reason: May still be useful for local Coolify (if kept)

3. **scripts/get-vm-ip.sh**
   - Action: Delete
   - Reason: Not needed with localhost

### Documentation Structure

Consider organizing old docs:

```
docs/
├── setup.md (current)
├── troubleshooting.md (current)
└── archive/
    └── implementation-2/
        ├── vm-setup.md (historical)
        └── vm-troubleshooting.md (historical)
```

---

## Troubleshooting

### Found Many Matches

**Symptom:** Grep returns dozens of VM references

**Action:** Prioritize by file importance:
1. Root README.md and CLAUDE.md (should already be done)
2. Setup/installation docs
3. Troubleshooting guides
4. Scripts
5. Spec documents
6. Other docs

### Uncertain Whether to Keep

**Decision framework:**

**Remove if:**
- Instructions for setting up local VM
- Commands specific to Multipass
- IP addresses in connection examples

**Update if:**
- General concept that applies to both
- Command has docker-compose equivalent
- Context needed but outdated

**Keep if:**
- Historical explanation
- Migration guide
- Production Coolify mention (not local VM)

### Breaking Links or Scripts

**Symptom:** Removing content breaks scripts or cross-references

**Solution:**
1. Search for the removed content string
2. Update scripts that referenced it
3. Update internal documentation links
4. Add redirects or notes if needed

---

## Next Steps

After completing this task:
1. Proceed to **Task 1.13: Create Troubleshooting Guide**
2. Codebase is clean of outdated VM references
3. User will do final review in Task 1.6

---

## Reference: Grep Commands Cheat Sheet

```bash
# Find all markdown files with multipass
find . -name "*.md" -not -path "*/node_modules/*" -not -path "*/implementation-2/*" -exec grep -l "multipass" {} \;

# Find all scripts with VM references
find scripts/ -type f -exec grep -l "multipass\|VM" {} \;

# Find all .env examples with IPs
find . -name ".env*" -exec grep -l "192.168" {} \;

# Count VM references (excluding historical)
grep -r "multipass" --include="*.md" . | grep -v implementation-2 | grep -v node_modules | wc -l

# Find VM references in shell scripts
find . -name "*.sh" -exec grep -Hn "multipass" {} \;
```

---

**Task Status:** Ready for execution
