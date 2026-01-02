# Technical Spec: Phase 5.2 - Admin Product Management

**Phase:** 5.2
**Goal:** Create admin UI and API endpoints to add, edit, and delete products with Basic Auth protection.
**Context:** Admin users need a way to manage products (add new URLs to monitor, edit product details, delete products). This requires Basic Auth middleware to protect write operations.

---

## Prerequisites

* **Task 5.1:** Public dashboard complete.
* **Database:** Products table exists.

---

## Architecture Context

### Admin Features

**Protected Operations:**
- Add new product (provide URL, system auto-fetches details)
- Edit product details (name, active status)
- Delete product (cascade deletes price records)

**Authentication:**
- Basic Auth (simple username/password)
- Protects API routes only (not UI for now)
- Credentials stored in environment variables

---

## Step 1: Configure Basic Auth Credentials (Manual Step)

**User Action:**

Add admin credentials to root `.env` file:

```env
# Basic Auth for Admin API
ADMIN_USERNAME="admin"
ADMIN_PASSWORD="your-secure-password-here"
```

**Important:** Use a strong password in production. This is stored in plaintext in `.env`, so never commit `.env` to git.

---

## Step 2: Implementation Specifications (AI Generation Step)

**Instruction for AI:**

Generate the following files to implement admin product management.

### File 2.1: `apps/web/src/middleware/basicAuth.ts`

**Goal:** Create Basic Auth middleware to protect API routes.

**Requirements:**

* **Imports:**
  ```typescript
  import { NextRequest, NextResponse } from 'next/server';
  ```

* **Basic Auth Helper:**
  ```typescript
  export function basicAuth(request: NextRequest): boolean {
    const authHeader = request.headers.get('authorization');

    if (!authHeader || !authHeader.startsWith('Basic ')) {
      return false;
    }

    // Decode Base64 credentials
    const base64Credentials = authHeader.split(' ')[1];
    const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
    const [username, password] = credentials.split(':');

    // Check against environment variables
    const validUsername = process.env.ADMIN_USERNAME || 'admin';
    const validPassword = process.env.ADMIN_PASSWORD || '';

    return username === validUsername && password === validPassword;
  }
  ```

* **Unauthorized Response Helper:**
  ```typescript
  export function unauthorizedResponse(): NextResponse {
    return new NextResponse('Unauthorized', {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Basic realm="Admin Area"',
      },
    });
  }
  ```

### File 2.2: `apps/web/src/app/api/products/route.ts`

**Goal:** Create API endpoints for listing and adding products.

**Requirements:**

* **Imports:**
  ```typescript
  import { NextRequest, NextResponse } from 'next/server';
  import { db, products } from '@price-monitor/db';
  import { eq } from 'drizzle-orm';
  import { basicAuth, unauthorizedResponse } from '@/middleware/basicAuth';
  ```

* **GET Handler (Public - No Auth):**
  ```typescript
  export async function GET() {
    try {
      const allProducts = await db
        .select()
        .from(products)
        .orderBy(products.createdAt);

      return NextResponse.json({ products: allProducts });
    } catch (error) {
      console.error('[API] Error fetching products:', error);
      return NextResponse.json(
        { error: 'Failed to fetch products' },
        { status: 500 }
      );
    }
  }
  ```

* **POST Handler (Protected - Requires Auth):**
  ```typescript
  export async function POST(request: NextRequest) {
    // Check authentication
    if (!basicAuth(request)) {
      return unauthorizedResponse();
    }

    try {
      const body = await request.json();
      const { url, name } = body;

      if (!url || typeof url !== 'string') {
        return NextResponse.json(
          { error: 'URL is required' },
          { status: 400 }
        );
      }

      // Check if product already exists
      const [existing] = await db
        .select()
        .from(products)
        .where(eq(products.url, url))
        .limit(1);

      if (existing) {
        return NextResponse.json(
          { error: 'Product with this URL already exists', product: existing },
          { status: 409 }
        );
      }

      // Create product
      const [newProduct] = await db
        .insert(products)
        .values({
          url,
          name: name || 'Untitled Product',
          active: true,
        })
        .returning();

      return NextResponse.json({
        success: true,
        product: newProduct,
      });
    } catch (error) {
      console.error('[API] Error creating product:', error);
      return NextResponse.json(
        { error: 'Failed to create product' },
        { status: 500 }
      );
    }
  }
  ```

### File 2.3: `apps/web/src/app/api/products/[id]/route.ts`

**Goal:** Create API endpoints for updating and deleting individual products.

**Requirements:**

* **Imports:**
  ```typescript
  import { NextRequest, NextResponse } from 'next/server';
  import { db, products } from '@price-monitor/db';
  import { eq } from 'drizzle-orm';
  import { basicAuth, unauthorizedResponse } from '@/middleware/basicAuth';
  ```

* **PATCH Handler (Protected - Update Product):**
  ```typescript
  export async function PATCH(
    request: NextRequest,
    { params }: { params: { id: string } }
  ) {
    if (!basicAuth(request)) {
      return unauthorizedResponse();
    }

    try {
      const body = await request.json();
      const { name, active } = body;

      const updateData: Partial<{
        name: string;
        active: boolean;
        updatedAt: Date;
      }> = { updatedAt: new Date() };

      if (name !== undefined) updateData.name = name;
      if (active !== undefined) updateData.active = active;

      const [updated] = await db
        .update(products)
        .set(updateData)
        .where(eq(products.id, params.id))
        .returning();

      if (!updated) {
        return NextResponse.json(
          { error: 'Product not found' },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        product: updated,
      });
    } catch (error) {
      console.error('[API] Error updating product:', error);
      return NextResponse.json(
        { error: 'Failed to update product' },
        { status: 500 }
      );
    }
  }
  ```

* **DELETE Handler (Protected - Delete Product):**
  ```typescript
  export async function DELETE(
    request: NextRequest,
    { params }: { params: { id: string } }
  ) {
    if (!basicAuth(request)) {
      return unauthorizedResponse();
    }

    try {
      const [deleted] = await db
        .delete(products)
        .where(eq(products.id, params.id))
        .returning();

      if (!deleted) {
        return NextResponse.json(
          { error: 'Product not found' },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        message: 'Product deleted',
      });
    } catch (error) {
      console.error('[API] Error deleting product:', error);
      return NextResponse.json(
        { error: 'Failed to delete product' },
        { status: 500 }
      );
    }
  }
  ```

### File 2.4: `apps/web/src/components/AdminPanel.tsx`

**Goal:** Create a simple admin UI for product management.

**Requirements:**

* **"use client" directive** (for interactive forms)

* **Imports:**
  ```typescript
  'use client';

  import { useState } from 'react';
  ```

* **Component Implementation:**
  ```typescript
  export default function AdminPanel() {
    const [url, setUrl] = useState('');
    const [name, setName] = useState('');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      setLoading(true);
      setMessage('');

      try {
        // Get credentials from user (browser will cache after first input)
        const username = prompt('Admin username:');
        const password = prompt('Admin password:');

        if (!username || !password) {
          setMessage('Authentication cancelled');
          setLoading(false);
          return;
        }

        const credentials = btoa(`${username}:${password}`);

        const response = await fetch('/api/products', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Basic ${credentials}`,
          },
          body: JSON.stringify({ url, name }),
        });

        const data = await response.json();

        if (response.ok) {
          setMessage(`✓ Product added successfully!`);
          setUrl('');
          setName('');
          // Refresh page to show new product
          window.location.reload();
        } else {
          setMessage(`✗ Error: ${data.error || 'Failed to add product'}`);
        }
      } catch (error) {
        setMessage(`✗ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      } finally {
        setLoading(false);
      }
    };

    return (
      <div className="bg-white border rounded-lg p-6 mb-8">
        <h2 className="text-2xl font-bold mb-4">Add New Product</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">
              Product URL *
            </label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
              placeholder="https://example.com/product"
              className="w-full px-3 py-2 border rounded-md"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Product Name (optional)
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Leave empty to auto-detect"
              className="w-full px-3 py-2 border rounded-md"
            />
          </div>

          <button
            type="submit"
            disabled={loading || !url}
            className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400"
          >
            {loading ? 'Adding...' : 'Add Product'}
          </button>

          {message && (
            <div className={`text-sm ${message.startsWith('✓') ? 'text-green-600' : 'text-red-600'}`}>
              {message}
            </div>
          )}
        </form>

        <p className="text-sm text-gray-500 mt-4">
          Note: You'll be prompted for admin credentials when submitting.
        </p>
      </div>
    );
  }
  ```

### File 2.5: Update `apps/web/src/app/page.tsx`

**Goal:** Add admin panel to dashboard.

**Requirements:**

* **Add import:**
  ```typescript
  import AdminPanel from '@/components/AdminPanel';
  ```

* **Add AdminPanel above product grid:**
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

## Step 3: Verification (Manual Step)

### 3.1: Start Development Server

```bash
cd apps/web
pnpm dev
```

### 3.2: Test Adding a Product

1. Open `http://localhost:3000`
2. Fill in the "Add New Product" form
3. Click "Add Product"
4. Enter admin credentials when prompted
5. Verify product is added and page refreshes

### 3.3: Test API Endpoints Directly

**Get all products (no auth required):**
```powershell
Invoke-WebRequest -Uri "http://localhost:3000/api/products"
```

**Add product (with auth):**
```powershell
$credentials = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("admin:your-password"))

Invoke-WebRequest -Uri "http://localhost:3000/api/products" `
  -Method POST `
  -Headers @{ Authorization = "Basic $credentials" } `
  -ContentType "application/json" `
  -Body '{"url":"https://example.com/test","name":"Test Product"}'
```

**Update product (with auth):**
```powershell
$productId = "your-product-uuid"

Invoke-WebRequest -Uri "http://localhost:3000/api/products/$productId" `
  -Method PATCH `
  -Headers @{ Authorization = "Basic $credentials" } `
  -ContentType "application/json" `
  -Body '{"name":"Updated Name","active":false}'
```

**Delete product (with auth):**
```powershell
Invoke-WebRequest -Uri "http://localhost:3000/api/products/$productId" `
  -Method DELETE `
  -Headers @{ Authorization = "Basic $credentials" }
```

### 3.4: Test Authentication

Verify that:
- [x] Requests without auth header return 401
- [x] Requests with wrong credentials return 401
- [x] Requests with correct credentials succeed

---

## File Structure After Completion

```
apps/web/src/
├── app/
│   ├── api/
│   │   └── products/
│   │       ├── route.ts          # NEW: GET/POST products
│   │       └── [id]/
│   │           └── route.ts      # NEW: PATCH/DELETE product
│   └── page.tsx                  # UPDATED: Added AdminPanel
├── components/
│   ├── AdminPanel.tsx            # NEW: Admin UI
│   ├── ProductCard.tsx
│   └── PriceChart.tsx
└── middleware/
    └── basicAuth.ts              # NEW: Auth middleware
```

---

## Security Notes

**Current Implementation:**
- Basic Auth with credentials in `.env`
- Credentials sent over HTTP in development
- Browser prompts for credentials on each request

**For Production:**
- Use HTTPS only (Vercel provides this automatically)
- Consider using session-based auth or JWT
- Never commit `.env` file
- Use strong passwords

**Limitations:**
- No user management (single admin account)
- No session persistence (prompts each time)
- Basic Auth is visible in network requests

---

## Troubleshooting

### Issue: "Unauthorized" even with correct credentials

**Cause:** Base64 encoding issue or typo in credentials.

**Solution:** Double-check `ADMIN_USERNAME` and `ADMIN_PASSWORD` in `.env`. Restart Next.js server.

### Issue: Browser doesn't prompt for credentials

**Cause:** Browser cached old credentials.

**Solution:** Clear browser cache or use incognito mode.

### Issue: Product not appearing after adding

**Cause:** Page not refreshing properly.

**Solution:** The code includes `window.location.reload()`. If it doesn't work, manually refresh the page.

---

## Completion Criteria

Task 5.2 is complete when:

- [ ] `ADMIN_USERNAME` and `ADMIN_PASSWORD` added to `.env`
- [ ] Basic Auth middleware created
- [ ] API endpoints for products (GET, POST, PATCH, DELETE) working
- [ ] AdminPanel component renders on dashboard
- [ ] Can add new product via UI
- [ ] Can update product via API
- [ ] Can delete product via API
- [ ] Authentication properly protects write operations
- [ ] Unauthorized requests return 401
- [ ] No TypeScript errors

---

## Future Enhancements (Out of Scope)

- Session-based authentication
- Multi-user support with roles
- Edit/delete buttons in UI (currently API only)
- Bulk operations (add multiple products)
- Product import from CSV
- OAuth integration
