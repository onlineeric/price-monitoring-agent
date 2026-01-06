# Technical Spec: Phase 5.0 - Dashboard Template Setup & Migration

**Phase:** 5.0
**Goal:** Replace the basic `apps/web` with the professional dashboard template, adapt it to our monorepo, and migrate existing functionality.
**Context:** We are using the [next-shadcn-admin-dashboard](https://github.com/arhamkhnz/next-shadcn-admin-dashboard) template as the foundation for our Price Monitor dashboard. This provides us with a professional UI framework with sidebar navigation, light/dark mode, Shadcn UI components, and modern patterns out of the box.

---

## Prerequisites

* **Task 4.2:** Email infrastructure complete (existing `apps/web` has API routes we need to preserve).
* **Database:** All database tables exist and are accessible.
* **Template:** Dashboard template cloned to `apps/dashboard_template` folder.

---

## Architecture Context

### Why This Template?

The template provides:
- **Professional UI**: Polished, modern design with attention to detail
- **Shadcn UI**: Full set of accessible, customizable components
- **Next.js 16**: Latest features with App Router and React 19
- **Sidebar Navigation**: Perfect for multi-page dashboard
- **Light/Dark Mode**: Built-in theme switching
- **Form Infrastructure**: React Hook Form + Zod validation ready
- **Data Tables**: TanStack Table integration
- **State Management**: Zustand for client-side state
- **Responsive**: Mobile-friendly layouts

### What We're Keeping from Current `apps/web`

1. **API Routes**: `/api/debug/trigger`, `/api/cron/*`
2. **Database Connection**: `@price-monitor/db` package integration
3. **Environment Variables**: Connection to Neon, Redis, etc.
4. **Monorepo Structure**: PNPM workspaces, package name `@price-monitor/web`

### What We're Replacing

1. **UI Components**: Replace basic HTML/Tailwind with Shadcn UI
2. **Layout**: Replace simple page layout with sidebar navigation
3. **Forms**: Replace basic forms with React Hook Form + Zod
4. **Styling**: Adopt template's Tailwind v4 configuration

---

## Step 1: Clone Template (Manual Step - ALREADY DONE)

**User Action:**

You've already completed this step by cloning the template to `apps/dashboard_template`.

For future reference, the command was:
```bash
cd apps
git clone https://github.com/arhamkhnz/next-shadcn-admin-dashboard.git dashboard_template
cd dashboard_template
rm -rf .git
```

**Note:** The `dashboard_template` folder serves as a reference during implementation. It can be removed after Phase 5 is complete, or kept for future reference.

---

## Step 2: Backup Current `apps/web` (Manual Step)

**User Action:**

Before replacing, backup the current `apps/web` folder:

```bash
# From repository root
cd apps
mv web web_backup
```

**Important:** Do not delete `web_backup` until you've verified everything works in the new setup.

---

## Step 3: Copy Template to `apps/web` (Manual Step)

**User Action:**

```bash
# From repository root
cd apps
cp -r dashboard_template web
```

---

## Step 4: Implementation Specifications (AI Generation Step)

**Instruction for AI:**

Generate the following file changes to adapt the template to our monorepo.

### File 4.1: Update `apps/web/package.json`

**Goal:** Rename package and ensure compatibility with monorepo.

**Requirements:**

Update the package name and verify dependencies:

```json
{
  "name": "@price-monitor/web",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "biome lint",
    "format": "biome format --write",
    "check": "biome check",
    "check:fix": "biome check --write"
  },
  "dependencies": {
    "@price-monitor/db": "workspace:*",
    // ... rest of template dependencies (keep all existing)
  }
}
```

**Key Changes:**
- Update `"name"` to `"@price-monitor/web"`
- Add `"@price-monitor/db": "workspace:*"` to dependencies
- Keep all other dependencies from template

### File 4.2: Update `apps/web/src/config/app-config.ts`

**Goal:** Update app name and metadata for Price Monitor.

**Requirements:**

```typescript
import packageJson from "../../package.json";

const currentYear = new Date().getFullYear();

export const APP_CONFIG = {
  name: "Price Monitor",
  version: packageJson.version,
  copyright: `© ${currentYear}, Price Monitor.`,
  meta: {
    title: "Price Monitor - AI-Powered Price Tracking Dashboard",
    description:
      "Monitor product prices from any URL, track price history, and receive automated email alerts when prices drop. Built with Next.js, AI extraction, and modern web technologies.",
  },
};
```

### File 4.3: Update `apps/web/src/navigation/sidebar/sidebar-items.ts`

**Goal:** Configure sidebar navigation for Price Monitor pages.

**Requirements:**

Replace the sidebar items with our app structure:

```typescript
import {
  LayoutDashboard,
  type LucideIcon,
  Package,
  Settings,
} from "lucide-react";

export interface NavSubItem {
  title: string;
  url: string;
  icon?: LucideIcon;
  comingSoon?: boolean;
  newTab?: boolean;
  isNew?: boolean;
}

export interface NavMainItem {
  title: string;
  url: string;
  icon?: LucideIcon;
  subItems?: NavSubItem[];
  comingSoon?: boolean;
  newTab?: boolean;
  isNew?: boolean;
}

export interface NavGroup {
  id: number;
  label?: string;
  items: NavMainItem[];
}

export const sidebarItems: NavGroup[] = [
  {
    id: 1,
    label: "Main",
    items: [
      {
        title: "Dashboard",
        url: "/dashboard",
        icon: LayoutDashboard,
      },
      {
        title: "Products",
        url: "/dashboard/products",
        icon: Package,
      },
      {
        title: "Settings",
        url: "/dashboard/settings",
        icon: Settings,
      },
    ],
  },
];
```

**Key Changes:**
- Remove all template dashboard examples (Default, CRM, Finance, etc.)
- Keep only our three pages: Dashboard, Products, Settings
- Use appropriate Lucide icons

### File 4.4: Create `apps/web/src/app/(main)/dashboard/page.tsx`

**Goal:** Create placeholder for main dashboard page.

**Requirements:**

```typescript
export default function DashboardPage() {
  return (
    <div className="@container/main flex flex-col gap-4 md:gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Price Monitor Dashboard</h1>
          <p className="text-muted-foreground">
            Track product prices and monitor trends
          </p>
        </div>
      </div>

      {/* Placeholder - Task 5.1 will implement this */}
      <div className="rounded-lg border border-dashed p-8 text-center">
        <p className="text-muted-foreground">
          Dashboard home page will be implemented in Task 5.1
        </p>
      </div>
    </div>
  );
}
```

### File 4.5: Create `apps/web/src/app/(main)/dashboard/products/page.tsx`

**Goal:** Create placeholder for products page.

**Requirements:**

```typescript
export default function ProductsPage() {
  return (
    <div className="@container/main flex flex-col gap-4 md:gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Products</h1>
          <p className="text-muted-foreground">
            Manage your monitored products
          </p>
        </div>
      </div>

      {/* Placeholder - Task 5.2 will implement this */}
      <div className="rounded-lg border border-dashed p-8 text-center">
        <p className="text-muted-foreground">
          Products page will be implemented in Task 5.2
        </p>
      </div>
    </div>
  );
}
```

### File 4.6: Create `apps/web/src/app/(main)/dashboard/settings/page.tsx`

**Goal:** Create placeholder for settings page.

**Requirements:**

```typescript
export default function SettingsPage() {
  return (
    <div className="@container/main flex flex-col gap-4 md:gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Settings</h1>
          <p className="text-muted-foreground">
            Configure email schedules and preferences
          </p>
        </div>
      </div>

      {/* Placeholder - Task 5.3 will implement this */}
      <div className="rounded-lg border border-dashed p-8 text-center">
        <p className="text-muted-foreground">
          Settings page will be implemented in Task 5.3
        </p>
      </div>
    </div>
  );
}
```

### File 4.7: Migrate API Route - Copy `apps/web_backup/src/app/api/debug/trigger/route.ts`

**Goal:** Preserve existing API routes.

**Requirements:**

Copy the existing API route from backup:

```bash
# Manual step - copy the entire api folder structure
cp -r apps/web_backup/src/app/api apps/web/src/app/
```

**Verify these routes exist after copying:**
- `/api/debug/trigger` - Manual job trigger
- `/api/cron/*` - Any cron endpoints if they exist

### File 4.8: Update `apps/web/src/app/layout.tsx`

**Goal:** Update root layout metadata.

**Requirements:**

Update the metadata in the root layout:

```typescript
import type { Metadata } from "next";
import { APP_CONFIG } from "@/config/app-config";
import { GeistSans } from "geist/font/sans";
import { ThemeProvider } from "next-themes";

import { Toaster } from "@/components/ui/sonner";
import { PreferencesProvider } from "@/stores/preferences/preferences-provider";

import "@/styles/globals.css";

export const metadata: Metadata = {
  title: APP_CONFIG.meta.title,
  description: APP_CONFIG.meta.description,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={GeistSans.className}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <PreferencesProvider>{children}</PreferencesProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
```

### File 4.9: Remove Template Example Pages (Manual Cleanup)

**Goal:** Clean up unused template pages to avoid confusion.

**Requirements:**

Delete these folders from `apps/web/src/app/(main)/dashboard/`:
- `default/` - Template's default dashboard
- `crm/` - Template's CRM dashboard
- `finance/` - Template's finance dashboard
- `coming-soon/` - Template's placeholder page

Delete these folders from `apps/web/src/app/(main)/`:
- `auth/` - Template's auth pages (we're not using authentication)
- `unauthorized/` - Not needed

**Bash commands:**
```bash
cd apps/web/src/app/(main)/dashboard
rm -rf default crm finance coming-soon

cd ../
rm -rf auth unauthorized
```

### File 4.10: Update Root `package.json` (if needed)

**Goal:** Ensure workspace references are correct.

**Requirements:**

Verify the root `package.json` has correct workspace definition:

```json
{
  "workspaces": [
    "apps/*",
    "packages/*"
  ]
}
```

This should already be correct, but verify it includes `apps/*`.

### File 4.11: Create `.env` Reference in `apps/web`

**Goal:** Ensure Next.js can load environment variables from root.

**Requirements:**

The template likely already handles this via `next.config.mjs`, but verify it looks like this:

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  // ... other config
};

export default nextConfig;
```

Next.js automatically loads `.env` files from the project root when using a monorepo.

---

## Step 5: Install Dependencies (Manual Step)

**User Action:**

```bash
# From repository root
pnpm install
```

This will install all template dependencies plus our `@price-monitor/db` package.

---

## Step 6: Verification (Manual Step)

### 6.1: Start Development Server

```bash
cd apps/web
pnpm dev
```

### 6.2: Verify Navigation

Open `http://localhost:3000` and check:

- [ ] Dashboard loads without errors
- [ ] Sidebar shows "Dashboard", "Products", "Settings" items
- [ ] Clicking each nav item navigates to placeholder pages
- [ ] Light/dark mode toggle works
- [ ] Sidebar collapse/expand works
- [ ] App name shows "Price Monitor" in header

### 6.3: Verify Database Connection

Create a test API route to verify database access:

**Create:** `apps/web/src/app/api/test-db/route.ts`

```typescript
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
```

**Test:** Visit `http://localhost:3000/api/test-db`

Expected: JSON response showing database connection works.

### 6.4: Verify Existing API Routes

Test that migrated routes still work:

```powershell
# Test trigger endpoint
Invoke-WebRequest -Uri "http://localhost:3000/api/debug/trigger" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"url":"https://example.com/test"}'
```

Expected: Job enqueued successfully (or appropriate error if worker not running).

### 6.5: Check for Build Errors

```bash
cd apps/web
pnpm build
```

Expected: Build completes successfully with no errors.

---

## File Structure After Completion

```
apps/
├── web/                              # Replaced with template
│   ├── src/
│   │   ├── app/
│   │   │   ├── (main)/
│   │   │   │   └── dashboard/
│   │   │   │       ├── layout.tsx    # Template's sidebar layout
│   │   │   │       ├── page.tsx      # NEW: Dashboard home (placeholder)
│   │   │   │       ├── products/
│   │   │   │       │   └── page.tsx  # NEW: Products page (placeholder)
│   │   │   │       ├── settings/
│   │   │   │       │   └── page.tsx  # NEW: Settings page (placeholder)
│   │   │   │       └── _components/  # Template components
│   │   │   ├── api/
│   │   │   │   ├── debug/
│   │   │   │   │   └── trigger/
│   │   │   │   │       └── route.ts  # MIGRATED: Existing API route
│   │   │   │   └── test-db/
│   │   │   │       └── route.ts      # NEW: Test database connection
│   │   │   ├── layout.tsx            # UPDATED: Root layout with metadata
│   │   │   └── globals.css           # Template styles
│   │   ├── components/
│   │   │   ├── ui/                   # Shadcn UI components (from template)
│   │   │   └── data-table/           # TanStack Table setup (from template)
│   │   ├── config/
│   │   │   └── app-config.ts         # UPDATED: App name and metadata
│   │   ├── navigation/
│   │   │   └── sidebar/
│   │   │       └── sidebar-items.ts  # UPDATED: Our navigation structure
│   │   ├── lib/                      # Template utilities
│   │   ├── hooks/                    # Template hooks
│   │   └── stores/                   # Zustand stores (from template)
│   ├── package.json                  # UPDATED: Package name and dependencies
│   ├── next.config.mjs               # Template Next.js config
│   ├── tsconfig.json                 # Template TypeScript config
│   ├── tailwind.config.ts            # Template Tailwind v4 config
│   ├── biome.json                    # Template linting config
│   └── components.json               # Shadcn UI config
├── web_backup/                       # OLD: Backup of original web app
└── dashboard_template/               # REFERENCE: Original template (can remove later)
```

---

## Troubleshooting

### Issue: "Module not found: @price-monitor/db"

**Cause:** Dependencies not installed or workspace link broken.

**Solution:**
```bash
# From repository root
pnpm install
```

### Issue: Database connection fails

**Cause:** Environment variables not loaded.

**Solution:** Ensure `.env` file exists in repository root with `DATABASE_URL` set.

### Issue: Build fails with TypeScript errors

**Cause:** Template TypeScript config may conflict with existing types.

**Solution:** Check `tsconfig.json` in `apps/web` and ensure it includes paths:
```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

### Issue: Sidebar navigation doesn't work

**Cause:** Route structure doesn't match sidebar items configuration.

**Solution:** Verify folder structure matches URLs in `sidebar-items.ts`:
- `/dashboard` → `apps/web/src/app/(main)/dashboard/page.tsx`
- `/dashboard/products` → `apps/web/src/app/(main)/dashboard/products/page.tsx`
- `/dashboard/settings` → `apps/web/src/app/(main)/dashboard/settings/page.tsx`

### Issue: API routes return 404

**Cause:** API routes not migrated correctly.

**Solution:** Check that `apps/web/src/app/api/` folder exists with all routes from `web_backup`.

---

## Completion Criteria

Task 5.0 is complete when:

- [ ] Template copied to `apps/web`
- [ ] Package name updated to `@price-monitor/web`
- [ ] `@price-monitor/db` dependency added and working
- [ ] App name changed to "Price Monitor"
- [ ] Sidebar navigation configured with 3 pages
- [ ] Placeholder pages created for Dashboard, Products, Settings
- [ ] Existing API routes migrated and functional
- [ ] Database connection verified (test endpoint works)
- [ ] Template example pages removed
- [ ] Development server runs without errors
- [ ] Build completes successfully
- [ ] Light/dark mode toggle works
- [ ] Sidebar collapse/expand works

---

## Next Steps

After completing Task 5.0:
- **Task 5.1:** Implement Dashboard home page with stats and manual trigger button
- **Task 5.2:** Implement Products page with card/table views and CRUD operations
- **Task 5.3:** Implement Settings page with email schedule configuration

---

## Notes

- The `dashboard_template` folder can be kept as a reference or deleted after Phase 5 is complete.
- The `web_backup` folder should be kept until all features are verified working in the new setup.
- All template example pages (CRM, Finance, etc.) are removed since we only need our 3 custom pages.
- Authentication pages removed since we're using public access for demo purposes.
- Template's layout, theme system, and component library are preserved and reused.
