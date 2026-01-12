# Technical Spec: Phase 5.3 - Settings Page

**Phase:** 5.3
**Goal:** Create a Settings page for managing email digest schedule configuration using Shadcn UI components.
**Context:** This page allows users to configure when automated digest emails should be sent (daily/weekly, specific time). No authentication is required - all settings are publicly accessible for demo purposes.

---

## Prerequisites

* **Task 5.0:** Dashboard template setup complete.
* **Task 5.1:** Dashboard home page complete.
* **Task 5.2:** Products page complete.
* **Task 4.2:** Email infrastructure and settings table exist.

---

## Architecture Context

### Settings Page Features

**Email Schedule Configuration:**
- Frequency selection: Daily or Weekly (using RadioGroup component)
- Day of week selection: Only shown for weekly (using Select component)
- Hour selection: 24-hour format (using Select component)
- Visual feedback on save success/error (using Sonner toast)
- Display current schedule at bottom

**No Authentication:**
- Settings are publicly accessible
- No login required
- Suitable for demo/portfolio purposes

**User Experience:**
- Clean, simple form layout using Shadcn components
- Proper form validation with React Hook Form + Zod
- Loading states during save
- Clear labels and descriptions
- Note about 30-minute cron window

---

## Step 1: Implementation Specifications (AI Generation Step)

**Instruction for AI:**

Generate the following files to implement the Settings page.

### File 1.1: `apps/web/src/lib/validations/settings.ts`

**Goal:** Zod schema for email schedule validation.

**Requirements:**

```typescript
import { z } from 'zod';

export const emailScheduleSchema = z.object({
  frequency: z.enum(['daily', 'weekly']),
  dayOfWeek: z.number().min(1).max(7).optional(),
  hour: z.number().min(0).max(23),
}).refine(
  (data) => {
    // If frequency is weekly, dayOfWeek must be provided
    if (data.frequency === 'weekly' && !data.dayOfWeek) {
      return false;
    }
    return true;
  },
  {
    message: 'Day of week is required for weekly frequency',
    path: ['dayOfWeek'],
  }
);

export type EmailScheduleInput = z.infer<typeof emailScheduleSchema>;
```

### File 1.2: `apps/web/src/app/api/settings/email-schedule/route.ts`

**Goal:** API endpoint for reading and updating email schedule.

**Requirements:**

* **Imports:**
  ```typescript
  import { NextRequest, NextResponse } from 'next/server';
  import { db, settings } from '@price-monitor/db';
  import { eq } from 'drizzle-orm';
  import { emailScheduleSchema } from '@/lib/validations/settings';
  ```

* **GET Handler (Read Current Schedule):**
  ```typescript
  export async function GET() {
    try {
      const [result] = await db
        .select()
        .from(settings)
        .where(eq(settings.key, 'email_schedule'))
        .limit(1);

      if (!result) {
        // Return default schedule
        return NextResponse.json({
          success: true,
          schedule: {
            frequency: 'daily',
            hour: 9,
          },
        });
      }

      const schedule = JSON.parse(result.value);
      return NextResponse.json({
        success: true,
        schedule,
      });
    } catch (error) {
      console.error('[API] Error fetching email schedule:', error);
      return NextResponse.json(
        {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to fetch email schedule',
        },
        { status: 500 }
      );
    }
  }
  ```

* **POST Handler (Update Schedule):**
  ```typescript
  export async function POST(request: NextRequest) {
    try {
      const body = await request.json();
      const validation = emailScheduleSchema.safeParse(body);

      if (!validation.success) {
        return NextResponse.json(
          {
            success: false,
            error: 'Validation failed',
            details: validation.error.errors,
          },
          { status: 400 }
        );
      }

      const schedule = validation.data;

      // Upsert schedule to database
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
        {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to update email schedule',
        },
        { status: 500 }
      );
    }
  }
  ```

### File 1.3: `apps/web/src/app/(main)/dashboard/settings/page.tsx`

**Goal:** Settings page with email schedule form.

**Requirements:**

```typescript
export default function SettingsPage() {
  return (
    <div className="@container/main flex flex-col gap-4 md:gap-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground">
          Configure email digest schedule and preferences
        </p>
      </div>

      {/* Email Schedule Settings */}
      <EmailScheduleSettings />
    </div>
  );
}
```

**Note:** Import `EmailScheduleSettings` from next file.

### File 1.4: `apps/web/src/app/(main)/dashboard/settings/_components/email-schedule-settings.tsx`

**Goal:** Email schedule configuration form component.

**Requirements:**

* **"use client" directive**

* **Imports:**
  ```typescript
  'use client';

  import { useState, useEffect } from 'react';
  import { useForm } from 'react-hook-form';
  import { zodResolver } from '@hookform/resolvers/zod';
  import { toast } from 'sonner';
  import { Loader2 } from 'lucide-react';

  import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
  import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
  } from '@/components/ui/form';
  import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
  import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
  import { Button } from '@/components/ui/button';
  import { Alert, AlertDescription } from '@/components/ui/alert';
  import { emailScheduleSchema, type EmailScheduleInput } from '@/lib/validations/settings';
  ```

* **Component Implementation:**
  ```typescript
  export function EmailScheduleSettings() {
    const [currentSchedule, setCurrentSchedule] = useState<EmailScheduleInput | null>(null);
    const [isLoadingInitial, setIsLoadingInitial] = useState(true);

    const form = useForm<EmailScheduleInput>({
      resolver: zodResolver(emailScheduleSchema),
      defaultValues: {
        frequency: 'daily',
        hour: 9,
      },
    });

    const frequency = form.watch('frequency');

    // Load current schedule on mount
    useEffect(() => {
      async function loadSchedule() {
        try {
          const response = await fetch('/api/settings/email-schedule');
          const data = await response.json();

          if (data.success && data.schedule) {
            setCurrentSchedule(data.schedule);
            form.reset(data.schedule);
          }
        } catch (error) {
          console.error('Failed to load schedule:', error);
          toast.error('Failed to load current schedule');
        } finally {
          setIsLoadingInitial(false);
        }
      }

      loadSchedule();
    }, [form]);

    const onSubmit = async (data: EmailScheduleInput) => {
      try {
        const response = await fetch('/api/settings/email-schedule', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(data),
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || 'Failed to update schedule');
        }

        setCurrentSchedule(data);
        toast.success('Schedule updated successfully!', {
          description: 'Your email digest schedule has been saved.',
        });
      } catch (error) {
        toast.error('Failed to update schedule', {
          description: error instanceof Error ? error.message : 'Unknown error occurred',
        });
      }
    };

    if (isLoadingInitial) {
      return (
        <Card>
          <CardContent className="flex items-center justify-center p-12">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      );
    }

    return (
      <Card>
        <CardHeader>
          <CardTitle>Email Digest Schedule</CardTitle>
          <CardDescription>
            Configure when you want to receive automated price digest emails.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              {/* Frequency Selection */}
              <FormField
                control={form.control}
                name="frequency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Frequency</FormLabel>
                    <FormControl>
                      <RadioGroup
                        onValueChange={field.onChange}
                        value={field.value}
                        className="flex flex-col space-y-2"
                      >
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="daily" id="daily" />
                          <label htmlFor="daily" className="text-sm font-normal cursor-pointer">
                            Daily - Send digest every day
                          </label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="weekly" id="weekly" />
                          <label htmlFor="weekly" className="text-sm font-normal cursor-pointer">
                            Weekly - Send digest once a week
                          </label>
                        </div>
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Day of Week Selection (only for weekly) */}
              {frequency === 'weekly' && (
                <FormField
                  control={form.control}
                  name="dayOfWeek"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Day of Week</FormLabel>
                      <Select
                        onValueChange={(value) => field.onChange(Number(value))}
                        value={field.value?.toString()}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a day" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="1">Monday</SelectItem>
                          <SelectItem value="2">Tuesday</SelectItem>
                          <SelectItem value="3">Wednesday</SelectItem>
                          <SelectItem value="4">Thursday</SelectItem>
                          <SelectItem value="5">Friday</SelectItem>
                          <SelectItem value="6">Saturday</SelectItem>
                          <SelectItem value="7">Sunday</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        The day of the week to send the digest.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {/* Hour Selection */}
              <FormField
                control={form.control}
                name="hour"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Time (Hour)</FormLabel>
                    <Select
                      onValueChange={(value) => field.onChange(Number(value))}
                      value={field.value.toString()}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="max-h-[300px]">
                        {Array.from({ length: 24 }, (_, i) => i).map((hour) => (
                          <SelectItem key={hour} value={hour.toString()}>
                            {hour.toString().padStart(2, '0')}:00
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      The hour of the day to send the digest (24-hour format).
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Info Alert */}
              <Alert>
                <AlertDescription>
                  The digest will be sent on or after the selected time, typically within 30 minutes
                  (depending on the cron schedule).
                </AlertDescription>
              </Alert>

              {/* Submit Button */}
              <Button
                type="submit"
                disabled={form.formState.isSubmitting}
                size="lg"
              >
                {form.formState.isSubmitting ? (
                  <>
                    <Loader2 className="size-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save Schedule'
                )}
              </Button>
            </form>
          </Form>

          {/* Current Schedule Display */}
          {currentSchedule && (
            <div className="mt-6 pt-6 border-t">
              <h3 className="text-sm font-medium mb-2">Current Schedule</h3>
              <p className="text-sm text-muted-foreground">
                {currentSchedule.frequency === 'daily' ? (
                  <>
                    Daily at {currentSchedule.hour.toString().padStart(2, '0')}:00
                  </>
                ) : (
                  <>
                    Weekly on{' '}
                    {
                      ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][
                        currentSchedule.dayOfWeek || 1
                      ]
                    }{' '}
                    at {currentSchedule.hour.toString().padStart(2, '0')}:00
                  </>
                )}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
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

### 2.2: Verify Settings Page

Open `http://localhost:3000/dashboard/settings` and verify:

- [ ] Page loads without errors
- [ ] "Settings" title displays
- [ ] "Email Digest Schedule" card displays
- [ ] Form loads with current schedule (or defaults)
- [ ] Loading spinner shows briefly while fetching

### 2.3: Test Daily Frequency

1. Select "Daily" radio button
2. Select an hour (e.g., 10:00)
3. Click "Save Schedule"
4. Verify:
   - [ ] Button shows "Saving..." loading state
   - [ ] Success toast appears
   - [ ] "Current Schedule" updates at bottom
   - [ ] Shows "Daily at 10:00"

### 2.4: Test Weekly Frequency

1. Select "Weekly" radio button
2. Verify:
   - [ ] "Day of Week" dropdown appears
3. Select a day (e.g., Monday)
4. Select an hour (e.g., 15:00)
5. Click "Save Schedule"
6. Verify:
   - [ ] Success toast appears
   - [ ] Current schedule updates
   - [ ] Shows "Weekly on Monday at 15:00"

### 2.5: Test Validation

1. Select "Weekly" frequency
2. Don't select a day of week
3. Click "Save Schedule"
4. Verify:
   - [ ] Form validation shows error
   - [ ] Error message appears under Day of Week field

### 2.6: Test API Endpoint Directly

**Get current schedule:**
```powershell
Invoke-WebRequest -Uri "http://localhost:3000/api/settings/email-schedule"
```

**Update schedule (daily):**
```powershell
Invoke-WebRequest -Uri "http://localhost:3000/api/settings/email-schedule" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"frequency":"daily","hour":10}'
```

**Update schedule (weekly):**
```powershell
Invoke-WebRequest -Uri "http://localhost:3000/api/settings/email-schedule" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"frequency":"weekly","dayOfWeek":1,"hour":15}'
```

### 2.7: Test Persistence

1. Set a schedule
2. Refresh the page
3. Verify:
   - [ ] Form loads with saved schedule
   - [ ] Current schedule displays correctly

### 2.8: Test Responsive Layout

Resize browser window and verify:
- [ ] Form remains usable on mobile screens
- [ ] Radio buttons and dropdowns are accessible
- [ ] Card layout adapts to screen size

---

## File Structure After Completion

```
apps/web/src/app/(main)/dashboard/settings/
├── page.tsx                                  # UPDATED: Settings page
└── _components/
    └── email-schedule-settings.tsx           # NEW: Email schedule form

apps/web/src/app/api/settings/
└── email-schedule/
    └── route.ts                              # NEW: GET/POST email schedule

apps/web/src/lib/validations/
└── settings.ts                               # NEW: Zod schema for settings
```

---

## Design Patterns

### Form Layout
- Card component for consistent styling
- Form fields with proper labels and descriptions
- RadioGroup for mutually exclusive options
- Select components for dropdown choices
- Conditional rendering for weekly day selection
- Alert component for informational messages

### State Management
- React Hook Form for form state
- Zod for validation
- Initial data fetch with loading state
- Optimistic UI updates (current schedule display)

### Validation
- Client-side validation with Zod
- Server-side validation with same schema
- Custom refinement for dayOfWeek requirement
- Clear error messages

---

## Styling Notes

**Card Design:**
- Uses template's Card component
- CardHeader with title and description
- CardContent with proper padding
- Border-top separator for current schedule section

**Form Design:**
- Vertical spacing between fields (space-y-6)
- RadioGroup with vertical layout
- Select components with proper sizing
- Button with loading state (spinner icon)

**Typography:**
- Labels: text-sm font-medium
- Descriptions: text-sm text-muted-foreground
- Current schedule: text-sm with muted color

---

## Troubleshooting

### Issue: Day of Week dropdown doesn't appear

**Cause:** Form not re-rendering when frequency changes.

**Solution:** Ensure `const frequency = form.watch('frequency')` is used to react to frequency changes.

### Issue: Schedule not persisting

**Cause:** Database upsert not working or settings table doesn't exist.

**Solution:**
1. Verify settings table exists in database
2. Check Drizzle schema has correct table definition
3. Check API logs for errors

### Issue: Validation errors not showing

**Cause:** FormMessage component not included in FormField.

**Solution:** Ensure each FormField has `<FormMessage />` component.

### Issue: Time zone confusion

**Cause:** Hours are stored in UTC but user expects local time.

**Solution:** (For future enhancement) Add time zone configuration. For now, document that times are in server time zone.

---

## Completion Criteria

Task 5.3 is complete when:

- [ ] Settings page renders without errors
- [ ] Email schedule form displays with current schedule
- [ ] Can select daily or weekly frequency
- [ ] Day of Week dropdown appears only for weekly
- [ ] Hour dropdown shows all 24 hours
- [ ] Form validation works (weekly requires dayOfWeek)
- [ ] Save button shows loading state
- [ ] Success toast appears on save
- [ ] Current schedule displays at bottom
- [ ] Schedule persists across page reloads
- [ ] API endpoints (GET/POST) work correctly
- [ ] No TypeScript errors
- [ ] No console errors
- [ ] Build completes successfully

---

## Performance Notes

- Initial data fetch happens once on mount
- Form state managed client-side (no unnecessary API calls)
- Validation happens before API call (reduces failed requests)
- Toast notifications provide immediate feedback

---

## Future Enhancements (Out of Scope)

- Time zone selection
- Multiple email schedules
- Email recipient configuration
- Schedule history/audit log
- Preview next send time
- Test email button
- Email template preview
- Custom cron expressions for advanced users
- Schedule enable/disable toggle
- Schedule pause/resume functionality
