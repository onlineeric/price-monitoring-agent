# Infrastructure Setup Guide: Repository Initialization

**Phase:** 1.1
**Goal:** Initialize a Monorepo structure using `pnpm workspaces` to manage the Frontend, Backend Worker, and Shared Database logic in a single repository.

## Prerequisites
- **Node.js** (v18+ recommended)
- **pnpm** installed globally (`npm install -g pnpm`)
- **Git** initialized

---

## 1. Directory Structure

The project follows a standard Monorepo layout:

```text
my-price-monitor/          (Root)
├── apps/
│   ├── web/               (Next.js App Router - Frontend & API)
│   └── worker/            (Node.js Service - Background Jobs)
├── packages/
│   └── db/                (Shared Drizzle ORM Schema & Config)
├── package.json           (Root Config)
├── pnpm-workspace.yaml    (Workspace Definition)
└── docker-compose.yml     (Local Infrastructure)

```

---

## 2. Implementation Steps

### Step 1: Root Initialization

Initialize the root project and create the directory tree.

```bash
# Initialize root package.json
pnpm init

# Create workspace folders
mkdir -p apps/web apps/worker packages/db

```

### Step 2: Workspace Configuration

Create a file named `pnpm-workspace.yaml` in the root directory to define the workspace scope.

```yaml
packages:
  - "apps/*"
  - "packages/*"

```

### Step 3: Frontend Setup (`apps/web`)

Initialize the Next.js application using the official CLI.

```bash
cd apps
npx create-next-app@latest web
# Select defaults: TypeScript, ESLint, Tailwind CSS, App Router, etc.
cd ..

```

### Step 4: Worker Setup (`apps/worker`)

Initialize a bare-bones Node.js service with TypeScript support.

```bash
cd apps/worker
pnpm init

# Install TypeScript development tools
pnpm add -D typescript tsx @types/node

# Initialize tsconfig.json
npx tsc --init
cd ../..

```

### Step 5: Shared Database Package (`packages/db`)

Initialize the shared library for database logic.

```bash
cd packages/db
pnpm init

```

* **Note:** The `package.json` name in this folder was updated to `@repo/db` to facilitate importing it into other apps.

---

## 3. Verification

To verify the workspace is linked correctly, you can list all projects:

```bash
pnpm -r list

```

**Expected Output:** Should list `web`, `worker`, and `@repo/db`.
