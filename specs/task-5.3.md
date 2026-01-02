# Technical Spec: Phase 5.3 - Settings Management UI

**Phase:** 5.3
**Goal:** Create UI for managing email digest schedule settings (daily/weekly, time selection).
**Context:** Admins need a way to configure when the automated digest email should be sent. This requires a settings UI and API endpoint to read and update the email schedule configuration.

---

## Prerequisites

* **Task 5.2:** Admin API and Basic Auth complete.
* **Task 4.2:** Settings service and email infrastructure complete.

---

## Architecture Context

### Settings UI Features

**Email Schedule Configuration:**
- Frequency selector: Daily or Weekly
- Day selector: Only shown for weekly (Monday-Sunday)
- Hour selector: Hour marks only (00:00, 01:00, ... 23:00)
- Save button (requires Basic Auth)
- Display current schedule

**User Experience:**
- Simple, clear interface
- Shows note: "Email will be sent on or after selected time (within 30 minutes)"
- Validates selections before saving
- Displays success/error messages

---

## Step 1: Implementation Specifications (AI Generation Step)

**Instruction for AI:**

Generate the following files to implement settings management UI.

### File 1.1: `apps/web/src/app/api/settings/email-schedule/route.ts`

**Goal:** Create API endpoint for reading and updating email schedule settings.

**Requirements:**

* **Imports:**
  ```typescript
  import { NextRequest, NextResponse } from 'next/server';
  import { db, settings } from '@price-monitor/db';
  import { eq } from 'drizzle-orm';
  import { basicAuth, unauthorizedResponse } from '@/middleware/basicAuth';
  ```

* **Type Definition:**
  ```typescript
  interface EmailSchedule {
    frequency: 'daily' | 'weekly';
    dayOfWeek?: number; // 1-7 (1=Monday, 7=Sunday)
    hour: number; // 0-23
  }
  ```

* **GET Handler (Public - No Auth):**
  ```typescript
  export async function GET() {
    try {
      const [result] = await db
        .select()
        .from(settings)
        .where(eq(settings.key, 'email_schedule'))
        .limit(1);

      if (!result) {
        // Return default
        return NextResponse.json({
          frequency: 'daily',
          hour: 9,
        });
      }

      const schedule = JSON.parse(result.value) as EmailSchedule;
      return NextResponse.json(schedule);
    } catch (error) {
      console.error('[API] Error fetching email schedule:', error);
      return NextResponse.json(
        { error: 'Failed to fetch email schedule' },
        { status: 500 }
      );
    }
  }
  ```

* **POST Handler (Protected - Requires Auth):**
  ```typescript
  export async function POST(request: NextRequest) {
    if (!basicAuth(request)) {
      return unauthorizedResponse();
    }

    try {
      const body = await request.json();
      const { frequency, dayOfWeek, hour } = body;

      // Validation
      if (!frequency || !['daily', 'weekly'].includes(frequency)) {
        return NextResponse.json(
          { error: 'Invalid frequency. Must be "daily" or "weekly"' },
          { status: 400 }
        );
      }

      if (typeof hour !== 'number' || hour < 0 || hour > 23) {
        return NextResponse.json(
          { error: 'Invalid hour. Must be between 0 and 23' },
          { status: 400 }
        );
      }

      if (frequency === 'weekly') {
        if (typeof dayOfWeek !== 'number' || dayOfWeek < 1 || dayOfWeek > 7) {
          return NextResponse.json(
            { error: 'Invalid dayOfWeek. Must be between 1 (Monday) and 7 (Sunday)' },
            { status: 400 }
          );
        }
      }

      // Build schedule object
      const schedule: EmailSchedule = { frequency, hour };
      if (frequency === 'weekly' && dayOfWeek) {
        schedule.dayOfWeek = dayOfWeek;
      }

      // Save to database
      await db
        .insert(settings)
        .values({
          key: 'email_schedule',
          value: JSON.stringify(schedule),
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: settings.key,
          set: {
            value: JSON.stringify(schedule),
            updatedAt: new Date(),
          },
        });

      return NextResponse.json({
        success: true,
        schedule,
      });
    } catch (error) {
      console.error('[API] Error updating email schedule:', error);
      return NextResponse.json(
        { error: 'Failed to update email schedule' },
        { status: 500 }
      );
    }
  }
  ```

### File 1.2: `apps/web/src/components/EmailScheduleSettings.tsx`

**Goal:** Create UI component for email schedule configuration.

**Requirements:**

* **"use client" directive**

* **Imports:**
  ```typescript
  'use client';

  import { useState, useEffect } from 'react';
  ```

* **Component Implementation:**
  ```typescript
  interface EmailSchedule {
    frequency: 'daily' | 'weekly';
    dayOfWeek?: number;
    hour: number;
  }

  export default function EmailScheduleSettings() {
    const [schedule, setSchedule] = useState<EmailSchedule | null>(null);
    const [frequency, setFrequency] = useState<'daily' | 'weekly'>('daily');
    const [dayOfWeek, setDayOfWeek] = useState<number>(1);
    const [hour, setHour] = useState<number>(9);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');

    // Load current schedule on mount
    useEffect(() => {
      async function loadSchedule() {
        try {
          const response = await fetch('/api/settings/email-schedule');
          const data = await response.json();
          setSchedule(data);
          setFrequency(data.frequency);
          setDayOfWeek(data.dayOfWeek || 1);
          setHour(data.hour);
        } catch (error) {
          console.error('Failed to load schedule:', error);
        }
      }
      loadSchedule();
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      setLoading(true);
      setMessage('');

      try {
        // Get credentials from user
        const username = prompt('Admin username:');
        const password = prompt('Admin password:');

        if (!username || !password) {
          setMessage('Authentication cancelled');
          setLoading(false);
          return;
        }

        const credentials = btoa(`${username}:${password}`);

        const payload: EmailSchedule = { frequency, hour };
        if (frequency === 'weekly') {
          payload.dayOfWeek = dayOfWeek;
        }

        const response = await fetch('/api/settings/email-schedule', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Basic ${credentials}`,
          },
          body: JSON.stringify(payload),
        });

        const data = await response.json();

        if (response.ok) {
          setMessage('✓ Schedule updated successfully!');
          setSchedule(data.schedule);
        } else {
          setMessage(`✗ Error: ${data.error || 'Failed to update schedule'}`);
        }
      } catch (error) {
        setMessage(`✗ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      } finally {
        setLoading(false);
      }
    };

    // Day names
    const dayNames = [
      { value: 1, label: 'Monday' },
      { value: 2, label: 'Tuesday' },
      { value: 3, label: 'Wednesday' },
      { value: 4, label: 'Thursday' },
      { value: 5, label: 'Friday' },
      { value: 6, label: 'Saturday' },
      { value: 7, label: 'Sunday' },
    ];

    // Hour options (0-23)
    const hourOptions = Array.from({ length: 24 }, (_, i) => i);

    if (!schedule) {
      return <div className="text-gray-500">Loading schedule...</div>;
    }

    return (
      <div className="bg-white border rounded-lg p-6 mb-8">
        <h2 className="text-2xl font-bold mb-4">Email Schedule Settings</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Frequency selector */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Frequency
            </label>
            <div className="flex gap-4">
              <label className="flex items-center">
                <input
                  type="radio"
                  value="daily"
                  checked={frequency === 'daily'}
                  onChange={(e) => setFrequency(e.target.value as 'daily' | 'weekly')}
                  className="mr-2"
                />
                Daily
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  value="weekly"
                  checked={frequency === 'weekly'}
                  onChange={(e) => setFrequency(e.target.value as 'daily' | 'weekly')}
                  className="mr-2"
                />
                Weekly
              </label>
            </div>
          </div>

          {/* Day selector (only for weekly) */}
          {frequency === 'weekly' && (
            <div>
              <label className="block text-sm font-medium mb-2">
                Day of Week
              </label>
              <select
                value={dayOfWeek}
                onChange={(e) => setDayOfWeek(Number(e.target.value))}
                className="w-full px-3 py-2 border rounded-md"
              >
                {dayNames.map((day) => (
                  <option key={day.value} value={day.value}>
                    {day.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Hour selector */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Time (Hour)
            </label>
            <select
              value={hour}
              onChange={(e) => setHour(Number(e.target.value))}
              className="w-full px-3 py-2 border rounded-md"
            >
              {hourOptions.map((h) => (
                <option key={h} value={h}>
                  {h.toString().padStart(2, '0')}:00
                </option>
              ))}
            </select>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm text-blue-800">
            ℹ️ Email will be sent on or after selected time (within 30 minutes)
          </div>

          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400"
          >
            {loading ? 'Saving...' : 'Save Schedule'}
          </button>

          {message && (
            <div className={`text-sm ${message.startsWith('✓') ? 'text-green-600' : 'text-red-600'}`}>
              {message}
            </div>
          )}
        </form>

        {/* Current schedule display */}
        <div className="mt-6 pt-6 border-t">
          <h3 className="font-medium mb-2">Current Schedule:</h3>
          <div className="text-sm text-gray-600">
            {schedule.frequency === 'daily' ? (
              <p>Daily at {schedule.hour.toString().padStart(2, '0')}:00</p>
            ) : (
              <p>
                Weekly on {dayNames.find(d => d.value === schedule.dayOfWeek)?.label || 'Monday'} at{' '}
                {schedule.hour.toString().padStart(2, '0')}:00
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }
  ```

### File 1.3: Update `apps/web/src/app/page.tsx`

**Goal:** Add email schedule settings to dashboard.

**Requirements:**

* **Add import:**
  ```typescript
  import EmailScheduleSettings from '@/components/EmailScheduleSettings';
  ```

* **Add EmailScheduleSettings below AdminPanel:**
  ```typescript
  export default async function DashboardPage() {
    const products = await getProductsWithLatestPrice();

    return (
      <main className="min-h-screen p-8">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-4xl font-bold mb-2">Price Monitor</h1>
          <p className="text-gray-600 mb-8">
            Tracking {products.length} product{products.length !== 1 ? 's' : ''}
          </p>

          {/* Admin Panel */}
          <AdminPanel />

          {/* Email Schedule Settings */}
          <EmailScheduleSettings />

          {/* Product Grid */}
          {products.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500">No products being monitored yet.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {products.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          )}
        </div>
      </main>
    );
  }
  ```

---

## Step 2: Verification (Manual Step)

### 2.1: Start Development Server

```bash
cd apps/web
pnpm dev
```

### 2.2: Test Settings UI

1. Open `http://localhost:3000`
2. Scroll to "Email Schedule Settings" section
3. Verify current schedule displays correctly
4. Change frequency from Daily to Weekly
5. Select a day of week
6. Change hour
7. Click "Save Schedule"
8. Enter admin credentials when prompted
9. Verify success message appears
10. Refresh page and verify new schedule is saved

### 2.3: Test API Endpoint Directly

**Get current schedule:**
```powershell
Invoke-WebRequest -Uri "http://localhost:3000/api/settings/email-schedule"
```

**Update schedule (with auth):**
```powershell
$credentials = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("admin:your-password"))

Invoke-WebRequest -Uri "http://localhost:3000/api/settings/email-schedule" `
  -Method POST `
  -Headers @{ Authorization = "Basic $credentials" } `
  -ContentType "application/json" `
  -Body '{"frequency":"weekly","dayOfWeek":1,"hour":10}'
```

### 2.4: Test Validation

Try invalid inputs to verify validation:
- Invalid frequency: `{"frequency":"monthly","hour":9}`
- Invalid hour: `{"frequency":"daily","hour":25}`
- Weekly without dayOfWeek: `{"frequency":"weekly","hour":9}`
- Invalid dayOfWeek: `{"frequency":"weekly","dayOfWeek":8,"hour":9}`

All should return 400 errors with appropriate messages.

---

## File Structure After Completion

```
apps/web/src/
├── app/
│   ├── api/
│   │   ├── products/
│   │   │   ├── route.ts
│   │   │   └── [id]/
│   │   │       └── route.ts
│   │   └── settings/
│   │       └── email-schedule/
│   │           └── route.ts      # NEW: Email schedule API
│   └── page.tsx                  # UPDATED: Added EmailScheduleSettings
├── components/
│   ├── AdminPanel.tsx
│   ├── EmailScheduleSettings.tsx # NEW: Settings UI
│   ├── ProductCard.tsx
│   └── PriceChart.tsx
└── middleware/
    └── basicAuth.ts
```

---

## UI/UX Notes

**Design Decisions:**
- Radio buttons for frequency (Daily/Weekly) - clear, mutually exclusive
- Dropdown for day selection - familiar, prevents invalid input
- Dropdown for hour - shows formatted time, prevents invalid input
- Info box with note about 30-minute window
- Current schedule display for confirmation

**Future Improvements:**
- Time zone selection
- Multiple schedules (e.g., daily + weekly)
- Schedule history/audit log
- Preview next send time

---

## Troubleshooting

### Issue: Schedule not saving

**Cause:** Authentication failure or validation error.

**Solution:** Check browser console for errors. Verify credentials are correct. Check API response for validation errors.

### Issue: Day selector not showing

**Cause:** Frequency not set to "weekly".

**Solution:** Ensure the radio button logic correctly toggles the day selector based on frequency.

### Issue: Schedule shows default after saving

**Cause:** Database update failed or not reading from database.

**Solution:** Check database using Drizzle Studio. Verify `email_schedule` row exists and value is valid JSON.

---

## Completion Criteria

Task 5.3 is complete when:

- [ ] API endpoint for email schedule (GET/POST) created
- [ ] EmailScheduleSettings component renders on dashboard
- [ ] Can view current schedule
- [ ] Can change frequency (daily/weekly)
- [ ] Day selector shows only for weekly
- [ ] Hour selector shows all hours (00:00-23:00)
- [ ] Can save schedule with admin auth
- [ ] Validation prevents invalid inputs
- [ ] Success/error messages display correctly
- [ ] Schedule persists after page refresh
- [ ] No TypeScript errors

---

## Notes

- The schedule is stored in the `settings` table as JSON
- The actual scheduling logic (calculateNextSendTime) will be implemented in Phase 6.3
- This phase only handles the UI and persistence of the schedule configuration
- The worker will read this schedule in Phase 6.3 to determine when to send emails
