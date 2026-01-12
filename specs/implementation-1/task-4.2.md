# Technical Spec: Phase 4.2 - Email Infrastructure & Settings

**Phase:** 4.2
**Goal:** Set up email infrastructure with Resend and create a digest email template that displays all products with price trends.
**Context:** We're building a digest email system that sends one consolidated email with all monitored products, showing current prices and trends compared to historical averages. This requires creating a settings table for configuration and implementing the email service.

---

## Prerequisites

* **Task 4.1 Enhancement:** Schema updated (alertRules removed, last_success_at/last_failed_at added).
* **Task 4.1:** AI extraction complete.
* **Resend Account:** API key from [resend.com](https://resend.com).

---

## Architecture Context

### Email System Overview

**Digest Email Concept:**
- One email contains ALL products in a table/list format
- Shows current price, last check time, and trend indicators
- Triggered manually (Phase 6.2) or automatically (Phase 6.3)

**Settings System:**
- Global configuration stored in `settings` table
- Key-value store design (general purpose, extensible)
- Email schedule: frequency (daily/weekly), day (for weekly), hour

---

## Step 1: Get Resend API Key (Manual Step)

**User Action:**

1. Sign up at [resend.com](https://resend.com)
2. Create an API key
3. Verify your domain (or use Resend's test domain for development)
4. Add to root `.env` file:

```env
# Resend Email Service
RESEND_API_KEY="re_..."

# Email Configuration
EMAIL_FROM="Price Monitor <alerts@yourdomain.com>"
# Or for testing: "onboarding@resend.dev"

# Alert recipient
ALERT_EMAIL="your-email@example.com"
```

---

## Step 2: Install Dependencies (Manual Step)

**User Action:**

```bash
cd apps/worker

# Install Resend SDK and React Email
pnpm add resend @react-email/components react
pnpm add -D @types/react react-email
```

**Note:** `react-email` is needed for the `npx email dev` preview command in Step 7.3.

---

## Step 3: Database Schema Changes (AI Generation Step)

**Instruction for AI:**

Update the database schema to add the settings table.

### File 3.1: Update `packages/db/src/schema.ts`

**Add `settings` table:**

```typescript
// Settings table - general purpose key-value store
export const settings = pgTable('settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: text('key').notNull().unique(),
  value: text('value').notNull(), // JSON string
  updatedAt: timestamp('updated_at').defaultNow(),
});
```

### File 3.2: Update `packages/db/src/index.ts`

**Add settings export:**

```typescript
export { products, priceRecords, settings, runLogs } from './schema.js';
```

---

## Step 4: Apply Schema Changes to Database (Manual Step)

**User Action:**

This project uses **push-based workflow** (not migration files). Run the following command to apply schema changes directly to your Neon database:

```bash
cd packages/db
pnpm push
```

**What this does:**
- Drizzle compares your updated `schema.ts` with the actual database
- Generates CREATE TABLE statement automatically
- Applies changes: creates `settings` table

**Expected output:** You should see Drizzle show the changes it will apply (CREATE TABLE settings), then prompt you to confirm.

---

## Step 5: Implementation Specifications (AI Generation Step)

**Instruction for AI:**

Generate the following files to implement email infrastructure and settings management.

### File 5.1: `apps/worker/src/services/settingsService.ts`

**Goal:** Create settings management functions for reading and writing configuration.

**Requirements:**

* **Imports:**
  ```typescript
  import { db, settings } from '@price-monitor/db';
  import { eq } from 'drizzle-orm';
  ```

* **Type Definitions:**
  ```typescript
  export interface EmailSchedule {
    frequency: 'daily' | 'weekly';
    dayOfWeek?: number; // 1-7 (1=Monday, 7=Sunday), only for weekly
    hour: number; // 0-23
  }
  ```

* **Get Setting Function:**
  ```typescript
  export async function getSetting(key: string): Promise<string | null> {
    const [result] = await db
      .select()
      .from(settings)
      .where(eq(settings.key, key))
      .limit(1);

    return result?.value || null;
  }
  ```

* **Set Setting Function:**
  ```typescript
  export async function setSetting(key: string, value: string): Promise<void> {
    await db
      .insert(settings)
      .values({ key, value, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: settings.key,
        set: { value, updatedAt: new Date() },
      });
  }
  ```

* **Get Email Schedule Helper:**
  ```typescript
  export async function getEmailSchedule(): Promise<EmailSchedule> {
    const value = await getSetting('email_schedule');

    if (!value) {
      // Default: daily at 9:00 AM
      return { frequency: 'daily', hour: 9 };
    }

    try {
      return JSON.parse(value) as EmailSchedule;
    } catch {
      console.error('[Settings] Failed to parse email_schedule, using default');
      return { frequency: 'daily', hour: 9 };
    }
  }
  ```

* **Set Email Schedule Helper:**
  ```typescript
  export async function setEmailSchedule(schedule: EmailSchedule): Promise<void> {
    await setSetting('email_schedule', JSON.stringify(schedule));
  }
  ```

### File 5.2: `apps/worker/src/emails/PriceDigest.tsx`

**Goal:** Create a React Email template for the digest email.

**Requirements:**

* **Imports:**
  ```typescript
  import {
    Html,
    Head,
    Body,
    Container,
    Section,
    Text,
    Heading,
    Link,
    Img,
    Hr,
    Preview,
    Row,
    Column,
  } from '@react-email/components';
  import * as React from 'react';
  ```

* **Props Interface:**
  ```typescript
  interface ProductDigestItem {
    name: string;
    url: string;
    imageUrl?: string | null;
    currentPrice: number | null;  // In cents
    currency: string | null;
    lastChecked: Date | null;
    lastFailed: Date | null;
    // Trends (percentage change)
    vsLastCheck: number | null;  // e.g., -5.2 means 5.2% decrease
    vs7dAvg: number | null;
    vs30dAvg: number | null;
    vs90dAvg: number | null;
    vs180dAvg: number | null;
  }

  interface PriceDigestProps {
    products: ProductDigestItem[];
    generatedAt: Date;
  }
  ```

* **Helper Functions:**
  ```typescript
  function formatPrice(cents: number | null, currency: string | null): string {
    if (cents === null || currency === null) return 'N/A';
    const amount = cents / 100;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
    }).format(amount);
  }

  function formatTrend(percentage: number | null): string {
    if (percentage === null) return '—';
    const sign = percentage > 0 ? '+' : '';
    return `${sign}${percentage.toFixed(1)}%`;
  }

  function getTrendIcon(percentage: number | null): string {
    if (percentage === null) return '';
    if (percentage > 0) return '↑';
    if (percentage < 0) return '↓';
    return '→';
  }

  function formatDateTime(date: Date | null): string {
    if (!date) return 'Never';
    return new Intl.DateTimeFormat('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  }
  ```

* **Template Design:**
  - Clean, table-based layout
  - Email preview text: "Price Monitor Report - [Date]"
  - Header with title and generation timestamp
  - Table with columns:
    - Product (name + image thumbnail)
    - Current Price
    - Last Checked
    - vs Last
    - vs 7d avg
    - vs 30d avg
    - vs 90d avg
    - vs 180d avg
  - Product name links to URL
  - Failed products show error indicator
  - Footer with app info

* **Export:**
  ```typescript
  export default function PriceDigest({ products, generatedAt }: PriceDigestProps) {
    // Implementation with table layout showing all products
    // Use Row/Column components for table structure
    // Include trend icons and color coding (green for down, red for up)
    // Show "Failed to update since [date]" for failed products
  }
  ```

### File 5.3: `apps/worker/src/services/emailService.ts`

**Goal:** Create email service using Resend to send digest emails.

**Requirements:**

* **Imports:**
  ```typescript
  import { Resend } from 'resend';
  import PriceDigest from '../emails/PriceDigest.js';
  ```

* **Type Imports:**
  ```typescript
  import type { ProductDigestItem } from '../emails/PriceDigest.js';
  ```

* **Resend Client:**
  ```typescript
  const resend = new Resend(process.env.RESEND_API_KEY);
  ```

* **Send Digest Function:**
  ```typescript
  export interface SendDigestParams {
    to: string;
    products: ProductDigestItem[];
  }

  export async function sendDigestEmail(params: SendDigestParams): Promise<boolean> {
    try {
      const generatedAt = new Date();

      const { data, error } = await resend.emails.send({
        from: process.env.EMAIL_FROM || 'Price Monitor <onboarding@resend.dev>',
        to: params.to,
        subject: `Price Monitor Report - ${generatedAt.toLocaleDateString()}`,
        react: PriceDigest({
          products: params.products,
          generatedAt,
        }),
      });

      if (error) {
        console.error('[Email] Failed to send digest:', error);
        return false;
      }

      console.log('[Email] Digest sent successfully:', data?.id);
      return true;
    } catch (error) {
      console.error('[Email] Error sending digest:', error);
      return false;
    }
  }
  ```

---

## Step 6: Initialize Default Settings (Manual Step)

**User Action:**

Add default email schedule to the database using Drizzle Studio:

```bash
cd packages/db
pnpm studio
```

In Drizzle Studio, insert into `settings` table:

**Key:** `email_schedule`
**Value:** `{"frequency":"daily","hour":9}`

**Or via SQL:**

```sql
INSERT INTO settings (key, value)
VALUES ('email_schedule', '{"frequency":"daily","hour":9}');
```

This sets the default to send daily digest at 9:00 AM.

---

## Step 7: Verification (Manual Step)

### 7.1: Verify Schema Changes

```bash
cd packages/db
pnpm studio
```

Check that:
- [x] `settings` table exists
- [x] `email_schedule` setting exists with default value

### 7.2: Test Settings Functions

Create a test script in `apps/worker/tests/test-settings.ts`:

```typescript
import { getEmailSchedule, setEmailSchedule } from '../src/services/settingsService.js';

async function test() {
  // Test read
  const schedule = await getEmailSchedule();
  console.log('Current schedule:', schedule);

  // Test write
  await setEmailSchedule({
    frequency: 'weekly',
    dayOfWeek: 1,
    hour: 10,
  });

  const updated = await getEmailSchedule();
  console.log('Updated schedule:', updated);
}

test();
```

Run with:
```bash
cd apps/worker
npx tsx tests/test-settings.ts
```

### 7.3: Preview Email Template

Preview the email template in development mode:

```bash
cd apps/worker
npx email dev --dir src/emails
```

Open browser at `localhost:3001` to see the email template preview.

**Note:** You'll need to create mock data in the email file for preview purposes.

---

## File Structure After Completion

```
apps/worker/src/
├── config.ts
├── index.ts
├── types/
│   └── scraper.ts
├── utils/
│   └── priceParser.ts
├── emails/
│   └── PriceDigest.tsx         # NEW: Digest email template
├── services/
│   ├── aiExtractor.ts
│   ├── database.ts
│   ├── emailService.ts         # NEW: Resend integration
│   ├── htmlFetcher.ts
│   ├── playwrightFetcher.ts
│   ├── scraper.ts
│   └── settingsService.ts      # NEW: Settings management
├── jobs/
│   └── priceCheck.ts
└── queue/
    └── worker.ts

packages/db/src/
├── schema.ts                    # UPDATED: Added settings table
└── index.ts                     # UPDATED: Export settings
```

---

## Troubleshooting

### Issue: "Missing API Key"

**Cause:** `RESEND_API_KEY` not set.

**Solution:** Add key to `.env` and restart worker.

### Issue: "Domain not verified"

**Cause:** Sending from unverified domain.

**Solution:** Use `onboarding@resend.dev` for testing, or verify your domain in Resend dashboard.

### Issue: Email not received

**Cause:** Email in spam, or wrong recipient.

**Solution:** Check spam folder. Verify `ALERT_EMAIL` is correct. Check Resend dashboard for delivery status.

### Issue: React Email compilation error

**Cause:** Missing React types or incorrect imports.

**Solution:** Ensure `@types/react` is installed and imports use correct paths.

---

## Completion Criteria

Task 4.2 is complete when:

- [ ] `RESEND_API_KEY`, `EMAIL_FROM`, and `ALERT_EMAIL` added to `.env`
- [ ] Resend and React Email packages installed
- [ ] `settings` table created in database
- [ ] `settingsService.ts` implements get/set functions
- [ ] `PriceDigest.tsx` email template created with table layout
- [ ] `emailService.ts` sends digest emails via Resend
- [ ] Default `email_schedule` setting inserted
- [ ] Email template preview works in development
- [ ] Settings can be read and written successfully
- [ ] No TypeScript errors

---

## Notes

- The `settings` table is designed to be general-purpose for future configuration needs
- The digest email template will receive trend data calculated in Phase 6.1
- Email sending will be triggered in Phase 6.2 (manual) and 6.3 (automatic)
- For now, we're just setting up the infrastructure - actual sending happens later
