# Implementation Plan: Global Product Search Edit Dialog

**Branch**: `001-product-search-edit` | **Date**: 2026-03-07 | **Spec**: [/home/onlineeric/repos/price-monitoring-agent/specs/001-product-search-edit/spec.md](/home/onlineeric/repos/price-monitoring-agent/specs/001-product-search-edit/spec.md)
**Input**: Feature specification from `/specs/001-product-search-edit/spec.md`

## Summary

Replace the dashboard template search results with real product data loaded from the existing `GET /api/products` contract, then route product selection through a dashboard-scoped overlay controller that opens a shared edit-product dialog reused from the Products page. The implementation keeps one active overlay at a time, preserves the current route, and refreshes only when the edit completes on `/dashboard/products`.

## Technical Context

**Language/Version**: TypeScript 5.9, React 19, Next.js 16  
**Primary Dependencies**: Next.js App Router, React Hook Form, Zod, Sonner, Radix UI dialog and command primitives, Lucide React, TanStack Table  
**Storage**: Existing PostgreSQL product records via Drizzle-backed `/api/products` and `/api/products/[id]` routes; no schema change  
**Testing**: Vitest + React Testing Library dashboard tests in `apps/web/src/test/dashboard/`  
**Target Platform**: Web dashboard in modern desktop browsers  
**Project Type**: Monorepo web application feature in `apps/web`  
**Performance Goals**: Search overlay opens immediately and renders loading, empty, or ready states without route navigation; client filtering remains responsive for the current product list size  
**Constraints**: Reuse existing API contracts, preserve existing design-system patterns, avoid stacked dialogs, refresh only on `/dashboard/products`, no new runtime configuration  
**Scale/Scope**: Dashboard routes that render the shared sidebar and top navigation search

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Architecture Fit**: Pass. Changes stay within existing boundaries: `apps/web` for implementation/tests and `specs/001-product-search-edit` for planning artifacts. No new package, app, or runtime is required.
- **Typed Maintainability**: Pass. The design extracts shared edit schema, hook, and dialog modules with explicit TypeScript types and a provider-owned overlay state machine instead of duplicating logic across routes.
- **Data Safety**: Pass. The feature reuses existing `GET /api/products` and `PATCH /api/products/[id]` contracts. No schema or persistence changes are planned, so there is no new Drizzle query work or raw SQL exception.
- **Verification Plan**: Pass. Automated RTL coverage will verify US1 loading/filtering/grouping states, US2 overlay sequencing/shared edit behavior/unavailable-product recovery, and US3 route-aware refresh plus duplicate-open prevention. Manual checks will cover `/dashboard/products` and at least two non-Products dashboard routes.
- **Operational Readiness**: Pass. No env var, worker, queue, or deployment changes are required. Failure modes are limited to recoverable client-side loading and unavailable-product states rendered inside the overlay flow.

## Project Structure

### Documentation (this feature)

```text
specs/001-product-search-edit/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
└── tasks.md
```

### Source Code (repository root)

```text
apps/web/src/app/(main)/dashboard/
├── _components/
│   ├── dashboard-client-shell.tsx
│   ├── product-search/
│   │   ├── global-product-search-dialog-provider.tsx
│   │   ├── product-search-model.ts
│   │   ├── product-search-result-item.tsx
│   │   └── use-global-product-search.ts
│   └── sidebar/
│       └── search-dialog.tsx
├── products/
│   └── _components/
│       ├── edit-product-dialog.tsx
│       ├── product-card-view.tsx
│       ├── product-table-view.tsx
│       └── edit-product/
│           ├── edit-product-form-schema.ts
│           ├── shared-edit-product-dialog.tsx
│           └── use-edit-product.ts
└── ...

apps/web/src/test/dashboard/
├── edit-product-dialog.test.tsx
├── global-product-search-dialog-provider.test.tsx
├── global-product-search-results.test.tsx
└── shared-edit-product-dialog.test.tsx
```

**Structure Decision**: Keep all implementation in `apps/web` by introducing two focused shared areas: `product-search/` for global overlay orchestration and `products/_components/edit-product/` for reusable edit-dialog logic. Tests stay under `apps/web/src/test/dashboard/` to match existing dashboard interaction coverage.

## Phases

### Phase 1: Shared Module Extraction

- Extract the existing edit-product schema/types and submit behavior into reusable modules.
- Introduce a shared edit dialog component with caller-controlled completion callbacks.
- Wrap the Products page entry point so it retains current refresh behavior.

### Phase 2: Global Search Overlay

- Add a dashboard-scoped provider that owns one overlay state machine: `closed`, `search`, or `edit`.
- Load products through `GET /api/products`, normalize them for search results, and expose provider actions to the search dialog.
- Replace template search content with loading, empty, error, and grouped result states.

### Phase 3: Route-Aware Completion

- Open the shared edit dialog from provider-owned selection state.
- Preserve origin pathname and trigger focus.
- Refresh only on `/dashboard/products`; otherwise close the flow without navigation or refresh.

### Phase 4: Verification and Documentation

- Add provider-level and shared-dialog RTL coverage for all three user stories.
- Update quickstart verification notes with automated and manual scenarios, including empty, unavailable-product, and duplicate-trigger handling.

## Story Verification

- **US1 Search products from anywhere**: Automated tests cover product loading, filtering by name and URL, active/inactive grouping, loading state, and empty states. Manual checks verify the header search on `/dashboard/products`, `/dashboard/default`, and one additional dashboard route.
- **US2 Edit a product from search results**: Automated tests cover selecting a product, closing search before edit opens, reusing edit validation/submission behavior, save failure retry, and unavailable-product recovery. Manual checks verify the same shared edit experience opens from a non-Products route.
- **US3 Preserve page context after global edit**: Automated tests cover route-aware success handling, cancel/dismiss behavior, duplicate-open prevention, and focus restoration. Manual checks verify refresh occurs only on `/dashboard/products`.

## Technical Constraints

- Reuse the existing dashboard design system, Radix command/dialog primitives, and API contracts.
- Keep overlay ownership in the provider so dialog sequencing is not split between the sidebar view and downstream edit components.
- Do not introduce new backend endpoints, schema changes, or runtime configuration.
- Preserve accessibility by restoring focus to the originating trigger when the overlay flow ends.

## Complexity Tracking

No constitution violations or justified exceptions are expected for this feature.
