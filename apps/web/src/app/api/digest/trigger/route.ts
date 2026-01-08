import { NextResponse } from 'next/server';
import { priceQueue } from '@/lib/queue';

export async function POST() {
  try {
    // Enqueue digest job
    const job = await priceQueue.add('send-digest', {
      triggeredBy: 'manual',
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      jobId: job.id,
      message: 'Digest job enqueued successfully',
    });
  } catch (error) {
    console.error('[API] Error enqueueing digest job:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to enqueue digest job',
      },
      { status: 500 }
    );
  }
}
