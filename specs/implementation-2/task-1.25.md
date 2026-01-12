# Task 1.25: End-to-End Testing

**Type:** Manual
**Performer:** User
**Phase:** 1 - Local VM + CICD

---

## What

Perform comprehensive end-to-end testing of the entire system running in the containerized environment on local VM.

---

## Objective

This is the final validation for Phase 1. It ensures:
- Complete user flow works in containers
- Manual price checks function correctly
- Worker processes jobs successfully
- Database operations work
- Scheduled digest email system works
- BullMQ Repeatable Jobs are functioning
- No regressions from Implementation 1

**This confirms the system is production-ready.**

---

## How to Do

Test the following scenarios in order:

1. **UI Access:** Open web UI, verify dashboard loads
2. **Add Product:** Add a product via UI with real e-commerce URL
3. **Manual Price Check:** Trigger manual price check, verify job enqueued
4. **Worker Processing:** Check worker logs, verify job processed and price extracted
5. **Database Verification:** Check PostgreSQL for price record
6. **Scheduled Digest:** Update email schedule settings, wait or manually trigger, verify email sent
7. **BullMQ Repeatable Jobs:** Check worker logs for schedule registration, verify cron pattern, test schedule update

Document any issues, differences from hybrid dev environment, or unexpected behavior.

---

## Expected Results

**Success Criteria:**
- ✅ Web UI accessible and loads correctly
- ✅ Product can be added via UI
- ✅ Manual price check button works
- ✅ Worker receives and processes jobs
- ✅ Price successfully extracted from URL
- ✅ Price record saved to PostgreSQL database
- ✅ Email schedule settings can be updated
- ✅ Scheduled digest email is sent
- ✅ Worker logs show scheduler started
- ✅ BullMQ repeatable job registered
- ✅ Cron pattern correct in logs
- ✅ Schedule changes detected when settings updated
- ✅ No critical errors in logs
- ✅ No regressions from Implementation 1 functionality

**How to Verify:**
- Open browser → access web UI → dashboard visible
- Add product → product appears in list
- Click price check → worker logs show job received
- Worker logs show "Price extracted: $XX.XX"
- Query database → price record exists
- Check email inbox → digest email received
- Worker logs → "Registered repeatable job with pattern: 0 9 * * *" (or similar)
- Update schedule → wait 5 minutes → worker logs show "Schedule updated"

**Document Results:**
- Note any errors or warnings
- Compare with local dev behavior
- List any features not working as expected
- Record performance observations (speed, resource usage)
