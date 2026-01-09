import { NextRequest, NextResponse } from 'next/server';
import { priceQueue } from '@/lib/queue';

// Note: Authentication intentionally removed in this phase.
// Proper authentication will be added app-wide in a future phase.

export async function POST(request: NextRequest) {
  try {
    // Enqueue digest job
    const job = await priceQueue.add('send-digest', {
      triggeredBy: 'manual',
      triggeredAt: new Date().toISOString(),
    });

    console.log('[API] Digest job enqueued:', job.id);

    return NextResponse.json({
      success: true,
      jobId: job.id,
      message: 'Digest email process started',
    });
  } catch (error) {
    console.error('[API] Error triggering digest:', error);
    return NextResponse.json(
      { error: 'Failed to trigger digest' },
      { status: 500 }
    );
  }
}
