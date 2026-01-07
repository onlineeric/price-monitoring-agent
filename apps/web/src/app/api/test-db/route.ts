import { NextResponse } from 'next/server';
import { db, products } from '@price-monitor/db';

export async function GET() {
  try {
    const allProducts = await db.select().from(products).limit(5);
    return NextResponse.json({
      success: true,
      count: allProducts.length,
      products: allProducts,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
