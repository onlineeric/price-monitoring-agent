import { NextRequest, NextResponse } from 'next/server';
import { priceQueue } from '@/lib/queue';
import { basicAuth, unauthorizedResponse } from '@/middleware/basicAuth';

export async function POST(request: NextRequest) {
  // Require authentication
  if (!basicAuth(request)) {
    return unauthorizedResponse();
  }

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
