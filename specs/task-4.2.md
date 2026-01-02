# Technical Spec: Phase 4.2 - Alert Evaluation & Email Notifications

**Phase:** 4.2
**Goal:** Implement alert evaluation after price extraction and send email notifications when price drops below target.
**Context:** Users set target prices for products. When the scraped price drops below the target, we send an email notification using Resend and React Email templates.

---

## Prerequisites

* **Task 4.1:** AI extraction complete (full scraper pipeline working).
* **Task 3.3:** Database integration complete (prices saved to DB).
* **Resend Account:** API key from [resend.com](https://resend.com).

---

## Architecture Context

### Alert Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    Price Check Job                           │
├─────────────────────────────────────────────────────────────┤
│  1. Scrape URL (Tier 1 → Tier 2 [Steps 1-3])               │
│  2. Save PriceRecord to DB                                  │
│  3. Check AlertRules for this product        ← NEW          │
│  4. If current_price <= target_price → Send Email ← NEW     │
│  5. Log run status                                          │
└─────────────────────────────────────────────────────────────┘
```

### Data Model Reminder

```typescript
// AlertRule (from schema.ts)
{
  id: UUID,
  productId: UUID,
  targetPrice: number,  // In cents (e.g., 1999 = $19.99)
  active: boolean,
  createdAt: timestamp
}
```

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
```

---

## Step 2: Install Dependencies (Manual Step)

**User Action:**

```bash
cd apps/worker

# Install Resend SDK and React Email
pnpm add resend @react-email/components react
pnpm add -D @types/react
```

---

## Step 3: Implementation Specifications (AI Generation Step)

**Instruction for AI:**

Generate the following files to add alert evaluation and email notifications.

### File 3.1: `apps/worker/src/emails/PriceDropAlert.tsx`

**Goal:** Create a React Email template for price drop notifications.

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
  } from '@react-email/components';
  import * as React from 'react';
  ```

* **Props Interface:**
  ```typescript
  interface PriceDropAlertProps {
    productName: string;
    productUrl: string;
    productImage?: string | null;
    currentPrice: number;    // In cents
    targetPrice: number;     // In cents
    currency: string;
    previousPrice?: number;  // Optional: last recorded price
  }
  ```

* **Template Design:**
  - Clean, simple design
  - Show product name and image (if available)
  - Display current price prominently (formatted, e.g., "$19.99")
  - Show target price for reference
  - Include "View Product" button/link
  - Footer with unsubscribe hint

* **Price Formatting Helper:**
  ```typescript
  function formatPrice(cents: number, currency: string): string {
    const amount = cents / 100;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
    }).format(amount);
  }
  ```

* **Export:**
  ```typescript
  export default function PriceDropAlert(props: PriceDropAlertProps) { ... }
  ```

### File 3.2: `apps/worker/src/services/emailService.ts`

**Goal:** Create an email service using Resend.

**Requirements:**

* **Imports:**
  ```typescript
  import { Resend } from 'resend';
  import PriceDropAlert from '../emails/PriceDropAlert.js';
  ```

* **Resend Client:**
  ```typescript
  const resend = new Resend(process.env.RESEND_API_KEY);
  ```

* **Main Function:**
  ```typescript
  interface SendPriceAlertParams {
    to: string;  // Recipient email
    productName: string;
    productUrl: string;
    productImage?: string | null;
    currentPrice: number;
    targetPrice: number;
    currency: string;
  }

  export async function sendPriceDropAlert(params: SendPriceAlertParams): Promise<boolean>
  ```

* **Logic:**
  1. Render the React Email template
  2. Send via Resend API
  3. Log success/failure
  4. Return boolean indicating success

* **Implementation:**
  ```typescript
  export async function sendPriceDropAlert(params: SendPriceAlertParams): Promise<boolean> {
    try {
      const { data, error } = await resend.emails.send({
        from: process.env.EMAIL_FROM || 'Price Monitor <onboarding@resend.dev>',
        to: params.to,
        subject: `Price Drop Alert: ${params.productName}`,
        react: PriceDropAlert({
          productName: params.productName,
          productUrl: params.productUrl,
          productImage: params.productImage,
          currentPrice: params.currentPrice,
          targetPrice: params.targetPrice,
          currency: params.currency,
        }),
      });

      if (error) {
        console.error('[Email] Failed to send:', error);
        return false;
      }

      console.log('[Email] Sent successfully:', data?.id);
      return true;
    } catch (error) {
      console.error('[Email] Error:', error);
      return false;
    }
  }
  ```

### File 3.3: `apps/worker/src/services/alertService.ts`

**Goal:** Create a service to evaluate alerts and trigger notifications.

**Requirements:**

* **Imports:**
  ```typescript
  import { db, alertRules, products } from '@price-monitor/db';
  import { eq, and } from 'drizzle-orm';
  import { sendPriceDropAlert } from './emailService.js';
  ```

* **Main Function:**
  ```typescript
  interface EvaluateAlertParams {
    productId: string;
    currentPrice: number;  // In cents
    currency: string;
  }

  export async function evaluateAlerts(params: EvaluateAlertParams): Promise<void>
  ```

* **Logic:**
  1. Fetch all active alert rules for the product
  2. For each rule, check if `currentPrice <= targetPrice`
  3. If triggered, send email notification
  4. Log which alerts were triggered

* **Implementation:**
  ```typescript
  export async function evaluateAlerts(params: EvaluateAlertParams): Promise<void> {
    const { productId, currentPrice, currency } = params;

    // Get active alerts for this product
    const alerts = await db
      .select()
      .from(alertRules)
      .where(
        and(
          eq(alertRules.productId, productId),
          eq(alertRules.active, true)
        )
      );

    if (alerts.length === 0) {
      console.log(`[Alert] No active alerts for product ${productId}`);
      return;
    }

    // Get product details for the email
    const [product] = await db
      .select()
      .from(products)
      .where(eq(products.id, productId))
      .limit(1);

    if (!product) {
      console.error(`[Alert] Product not found: ${productId}`);
      return;
    }

    // Evaluate each alert
    for (const alert of alerts) {
      console.log(
        `[Alert] Checking: current=${currentPrice} vs target=${alert.targetPrice}`
      );

      if (currentPrice <= alert.targetPrice) {
        console.log(`[Alert] TRIGGERED! Price ${currentPrice} <= target ${alert.targetPrice}`);

        // TODO: Get user email from alert or product
        // For now, use a hardcoded email or env variable
        const recipientEmail = process.env.ALERT_EMAIL || 'test@example.com';

        await sendPriceDropAlert({
          to: recipientEmail,
          productName: product.name,
          productUrl: product.url,
          productImage: product.imageUrl,
          currentPrice,
          targetPrice: alert.targetPrice,
          currency,
        });

        // Optionally: Deactivate alert after triggering (one-time alerts)
        // await db.update(alertRules)
        //   .set({ active: false })
        //   .where(eq(alertRules.id, alert.id));
      }
    }
  }
  ```

### File 3.4: Update `apps/worker/src/services/database.ts`

**Goal:** Add function to create alert rules.

**Requirements:**

* **New Function:**
  ```typescript
  interface CreateAlertParams {
    productId: string;
    targetPrice: number;  // In cents
  }

  export async function createAlertRule(params: CreateAlertParams): Promise<void> {
    await db.insert(alertRules).values({
      productId: params.productId,
      targetPrice: params.targetPrice,
      active: true,
    });
  }
  ```

### File 3.5: Update `apps/worker/src/jobs/priceCheck.ts`

**Goal:** Integrate alert evaluation into the job processor.

**Requirements:**

* **New Import:**
  ```typescript
  import { evaluateAlerts } from '../services/alertService.js';
  ```

* **Call Alert Evaluation:**
  After successfully saving the price record, call `evaluateAlerts()`:

  ```typescript
  // After savePriceRecord() succeeds:
  if (result.data.price !== null && result.data.currency !== null) {
    try {
      await savePriceRecord({
        productId,
        price: result.data.price,
        currency: result.data.currency,
      });
      await updateProductTimestamp(productId);

      // Evaluate alerts for this product
      await evaluateAlerts({
        productId,
        currentPrice: result.data.price,
        currency: result.data.currency,
      });

      await logRun({ productId, status: 'SUCCESS' });
      console.log(`[${job.id}] Price saved and alerts evaluated`);
    } catch (dbError) {
      // ... error handling
    }
  }
  ```

---

## Step 4: Create Test Alert Rule (Manual Step)

**User Action:**

Create an alert rule in the database using Drizzle Studio.

```bash
cd packages/db
pnpm studio
```

Insert into `alert_rules`:
- `product_id`: Your test product UUID
- `target_price`: Set higher than current price to trigger (e.g., 999999 for testing)
- `active`: `true`

**Or via SQL:**

```sql
INSERT INTO alert_rules (product_id, target_price, active)
VALUES ('your-product-uuid', 999999, true);
```

---

## Step 5: Environment Configuration (Manual Step)

**User Action:**

Add email configuration to `.env`:

```env
# Resend
RESEND_API_KEY="re_..."
EMAIL_FROM="Price Monitor <onboarding@resend.dev>"

# Alert recipient (for testing)
ALERT_EMAIL="your-email@example.com"
```

---

## Step 6: Verification (Manual Step)

### 6.1: Start Services

```bash
# Terminal 1: Redis
docker-compose up -d

# Terminal 2: Worker
cd apps/worker && pnpm dev

# Terminal 3: Web
cd apps/web && pnpm dev
```

### 6.2: Trigger Job for Product with Alert

```powershell
Invoke-WebRequest -Uri "http://localhost:3000/api/debug/trigger" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"productId": "your-product-uuid-with-alert"}'
```

### 6.3: Expected Worker Output

```text
[<job-id>] Processing price check for product: ...
[<job-id>] Scraping URL: https://...
[Scraper] HTML fetcher succeeded
[<job-id>] Scrape successful: { title: '...', price: 5151, currency: 'GBP' }
[<job-id>] Price saved to database
[Alert] Checking: current=5151 vs target=999999
[Alert] TRIGGERED! Price 5151 <= target 999999
[Email] Sent successfully: <email-id>
[<job-id>] Price saved and alerts evaluated
```

### 6.4: Verify Email Received

Check your inbox (and spam folder) for the price drop alert email.

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
│   └── PriceDropAlert.tsx   # NEW: Email template
├── services/
│   ├── aiExtractor.ts
│   ├── alertService.ts      # NEW: Alert evaluation
│   ├── database.ts          # UPDATED: createAlertRule
│   ├── emailService.ts      # NEW: Resend integration
│   ├── htmlFetcher.ts
│   ├── playwrightFetcher.ts
│   └── scraper.ts
├── jobs/
│   └── priceCheck.ts        # UPDATED: Alert integration
└── queue/
    └── worker.ts
```

---

## Email Template Preview

For development, you can preview email templates:

```bash
# In apps/worker
npx email dev --dir src/emails
```

This opens a browser preview of your email templates at `localhost:3001`.

---

## Future Enhancements (Out of Scope)

1. **User-specific emails:** Currently uses a global `ALERT_EMAIL`. In Phase 5, link alerts to user accounts.
2. **Unsubscribe links:** Add unsubscribe functionality.
3. **Alert frequency limits:** Prevent spam by limiting alerts per product per day.
4. **Multiple notification channels:** Slack, Discord, SMS.

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

- [ ] `RESEND_API_KEY` and `EMAIL_FROM` added to `.env`
- [ ] Resend and React Email packages installed
- [ ] `PriceDropAlert.tsx` email template created
- [ ] `emailService.ts` sends emails via Resend
- [ ] `alertService.ts` evaluates alert rules
- [ ] `priceCheck.ts` calls alert evaluation after saving price
- [ ] Test alert rule created in database
- [ ] Price drop triggers email notification
- [ ] Email received in inbox with correct content
