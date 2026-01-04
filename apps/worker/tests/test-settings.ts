import { config } from 'dotenv';
config({ path: '../../../.env' }); // Load from monorepo root (relative to apps/worker)
import { getEmailSchedule, setEmailSchedule } from '../src/services/settingsService.js';

async function test() {
  // Test read
  const schedule = await getEmailSchedule();
  console.log('Current schedule:', schedule);

  // Test write
  await setEmailSchedule({
    frequency: 'daily',
    hour: 9,
  });

//   await setEmailSchedule({
//     frequency: 'weekly',
//     dayOfWeek: 1,
//     hour: 10,
//   });
  
  const updated = await getEmailSchedule();
  console.log('Updated schedule:', updated);
}

test();