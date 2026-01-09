import { NextRequest, NextResponse } from 'next/server';
import { db, products } from '@price-monitor/db';
import { eq, desc } from 'drizzle-orm';
import { priceQueue } from '@/lib/queue';

export async function GET() {
  try {
    const allProducts = await db
      .select()
      .from(products)
      .orderBy(desc(products.createdAt));

    return NextResponse.json({
      success: true,
      products: allProducts,
    });
  } catch (error) {
    console.error('[API] Error fetching products:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch products',
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url, name } = body;

    // Validate required fields
    if (!url || typeof url !== 'string') {
      return NextResponse.json(
        { success: false, error: 'URL is required' },
        { status: 400 }
      );
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid URL format' },
        { status: 400 }
      );
    }

    // Check if product with this URL already exists
    const [existing] = await db
      .select()
      .from(products)
      .where(eq(products.url, url))
      .limit(1);

    if (existing) {
      return NextResponse.json(
        {
          success: false,
          error: 'A product with this URL already exists',
          product: existing,
        },
        { status: 409 }
      );
    }

    // Create product
    // If no name provided, leave it null - worker will extract title from URL
    const [newProduct] = await db
      .insert(products)
      .values({
        url,
        name: name || null,
        active: true,
      })
      .returning();

    // Trigger price check job to extract title and first price
    try {
      await priceQueue.add('check-price', {
        url: newProduct.url,
        triggeredAt: new Date(),
      });
    } catch (queueError) {
      console.error('[API] Failed to enqueue price check job:', queueError);

      // Rollback: delete the product since we can't monitor it
      await db.delete(products).where(eq(products.id, newProduct.id));

      return NextResponse.json(
        {
          success: false,
          error: 'Failed to start price monitoring. Please try again later.',
        },
        { status: 503 }
      );
    }

    return NextResponse.json({
      success: true,
      product: newProduct,
    });
  } catch (error) {
    console.error('[API] Error creating product:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create product',
      },
      { status: 500 }
    );
  }
}
