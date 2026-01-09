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
