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
