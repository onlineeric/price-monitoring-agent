# Implementation Plan: Global Product Search Edit Dialog

**Branch**: `001-product-search-edit` | **Date**: 2026-03-07 | **Spec**: [/home/onlineeric/repos/price-monitoring-agent/specs/001-product-search-edit/spec.md](/home/onlineeric/repos/price-monitoring-agent/specs/001-product-search-edit/spec.md)
**Input**: Feature specification from `/specs/001-product-search-edit/spec.md`

## Summary

Replace the dashboard template search results with real product results and route product selection into one shared edit-product flow that can open from any dashboard page. The design should move global search/edit orchestration into the shared dashboard shell, extract the current Products-page edit dialog into reusable modules, and keep route-aware refresh behavior aligned with the existing quick-create provider pattern.

## Technical Context

**Language/Version**: TypeScript 5.9, React 19, Next.js 16  
**Primary Dependencies**: Next.js App Router, React Hook Form, Zod, Sonner, Radix UI dialog and command primitives, Lucide React, date-fns, TanStack Table  
**Storage**: Existing PostgreSQL product records via Drizzle-backed `/api/products` and `/api/products/[id]` routes; no schema change  
**Testing**: Biome linting, Vitest with React Testing Library in `apps/web`, plus manual dashboard validation across multiple routes  
**Target Platform**: Web dashboard in modern desktop and mobile browsers  
**Project Type**: Monorepo web application (`apps/web`)  
**Performance Goals**: Search dialog opens without route navigation, filters product results interactively, and opens a single edit dialog without stacked overlays or noticeable UI regression versus the current dashboard shell behavior  
**Constraints**: Reuse the existing edit-product contract and validation, keep changes inside `apps/web` and `specs/`, preserve current dashboard shell patterns, refresh only on `/dashboard/products`, and prevent duplicate search/edit dialog instances  
**Scale/Scope**: One global search-and-edit flow available from every route under the dashboard layout, backed by the existing product list and edit API

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Architecture Fit**: Pass. The feature stays within `apps/web` and `specs/` by extending the shared dashboard shell, sidebar search UI, and reusable product-edit modules.
- **Typed Maintainability**: Pass. The plan extracts explicit TypeScript types and shared client modules instead of keeping edit behavior duplicated in card and table views.
- **Data Safety**: Pass. Existing Drizzle-backed product routes remain the persistence boundary; no schema or raw SQL changes are required.
- **Verification Plan**: Pass with condition. Add automated coverage for search result loading/filtering, shared edit-dialog orchestration, duplicate-open protection, and route-specific refresh behavior, with manual validation on Products plus non-Products routes.
- **Operational Readiness**: Pass. No environment, worker, queue, or deployment changes are expected; rollback is limited to the web UI/search-edit flow.

## Project Structure

### Documentation (this feature)

```text
specs/001-product-search-edit/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── product-search-edit.md
└── tasks.md
```

### Source Code (repository root)

```text
apps/web/
├── src/app/(main)/dashboard/
│   ├── _components/dashboard-client-shell.tsx
│   ├── _components/sidebar/search-dialog.tsx
│   ├── _components/product-create/product-create-dialog-provider.tsx
│   ├── _components/[new global product search/edit provider modules]
│   └── products/_components/
│       ├── edit-product-dialog.tsx
│       ├── product-card-view.tsx
│       ├── product-table-view.tsx
│       ├── products-view.tsx
│       └── [new shared product edit modules if extracted]
├── src/app/api/products/route.ts
├── src/app/api/products/[id]/route.ts
└── src/test/dashboard/
    └── [new provider and search/edit flow tests]
```

**Structure Decision**: Keep the global orchestration in the shared dashboard client shell, where the current search trigger already lives and the quick-create provider pattern already exists. Extract reusable product-edit behavior near the existing Products page components so the search flow and Products page actions both call the same dialog logic.

## Phase 0: Research

1. Confirm the lowest-risk way to replace template search results with real product records while preserving the existing command-dialog interaction.
2. Decide how to share the Products-page edit experience without duplicating refresh, toast, validation, and error logic across search, card, and table entry points.
3. Decide how to preserve page context and duplicate-open protection when moving from search dialog to edit dialog.
4. Define the automated and manual verification strategy for a global dashboard-shell search/edit interaction.

## Phase 1: Design

1. Define the dashboard-scoped state model for one global search dialog and one shared edit dialog.
2. Define the client product-result shape used by the search dialog, including ordering and empty/error states.
3. Define the shared edit-product module boundaries and the trigger contract for Products page actions versus global search selection.
4. Define route-aware completion behavior, including refresh only on `/dashboard/products` and no flow restart after save/cancel.
5. Define automated tests and manual validation coverage.

## Post-Design Constitution Check

- **Architecture Fit**: Pass. The design adds dashboard-scoped client orchestration and shared product-edit UI only within `apps/web`.
- **Typed Maintainability**: Pass. Shared provider/controller and reusable edit modules remove duplicated dialog behavior from separate product views.
- **Data Safety**: Pass. Product retrieval and updates continue through the existing typed API routes and database schema.
- **Verification Plan**: Pass. The design includes focused Vitest coverage for orchestration and route behavior, plus manual multi-route checks.
- **Operational Readiness**: Pass. No runtime configuration changes are introduced; failure scope is isolated to one dashboard UI workflow and is easy to roll back.

## Complexity Tracking

No constitution violations identified.
