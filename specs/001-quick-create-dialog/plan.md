# Implementation Plan: Global Quick Create Product Dialog

**Branch**: `001-quick-create-dialog` | **Date**: 2026-03-06 | **Spec**: [/home/onlineeric/repos/price-monitoring-agent/specs/001-quick-create-dialog/spec.md](/home/onlineeric/repos/price-monitoring-agent/specs/001-quick-create-dialog/spec.md)
**Input**: Feature specification from `/specs/001-quick-create-dialog/spec.md`

## Summary

Make the sidebar `Quick Create` action open the existing add-product experience from any dashboard route by moving dialog control into the shared dashboard shell and extracting the product creation form/submission logic into reusable client code. The Products page `Add Product` button and the global sidebar action will both call the same open handler and render the same create-product workflow.

## Technical Context

**Language/Version**: TypeScript 5.9, React 19, Next.js 16  
**Primary Dependencies**: Next.js App Router, React Hook Form, Zod, Sonner, Radix UI dialog primitives, Lucide React  
**Storage**: Existing PostgreSQL product storage via current `/api/products` contract; no schema change  
**Testing**: Biome linting, targeted client-side component/integration coverage to be added for shared dialog controller behavior, documented manual dashboard validation  
**Target Platform**: Web dashboard in modern desktop and mobile browsers  
**Project Type**: Monorepo web application (`apps/web`)  
**Performance Goals**: Dialog opens on first interaction with no route transition and no duplicate modal stack; no regression to existing product creation latency beyond current API roundtrip  
**Constraints**: Reuse the existing create-product contract and UX, keep all changes inside `apps/web`, avoid duplicated form or submission logic, preserve current dashboard layout patterns  
**Scale/Scope**: One shared dashboard create-product flow used by the sidebar action and the Products page trigger across all routes rendered under the dashboard layout

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Architecture Fit**: Pass. The design stays inside `apps/web` by adding a dashboard-scoped client controller/provider and shared product-create UI modules.
- **Typed Maintainability**: Pass. Shared dialog state, form schema, and submission logic will be extracted into explicit TypeScript modules instead of copying route-local logic.
- **Data Safety**: Pass. No persistence or schema changes are planned; product creation continues through the existing `/api/products` endpoint and server-side storage path.
- **Verification Plan**: Pass with condition. Add focused automated coverage for the shared dialog controller/open behavior and preserve manual verification across multiple dashboard routes because this is user-visible global UI behavior.
- **Operational Readiness**: Pass. No environment, worker, queue, or deployment changes are expected; rollback is limited to web UI components.

## Project Structure

### Documentation (this feature)

```text
specs/001-quick-create-dialog/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── quick-create-dialog.md
└── tasks.md
```

### Source Code (repository root)

```text
apps/web/
├── src/app/(main)/dashboard/
│   ├── layout.tsx
│   ├── _components/sidebar/
│   │   ├── app-sidebar.tsx
│   │   └── nav-main.tsx
│   └── products/_components/
│       ├── add-product-button.tsx
│       ├── add-product-dialog.tsx
│       └── [new shared product-create modules]
├── src/components/ui/
└── [tests to be added alongside web app conventions chosen in implementation]
```

**Structure Decision**: Keep the feature within `apps/web` and center the global dialog host in the shared dashboard layout. Extract reusable product-create logic next to the existing Products page components so the route-specific button and sidebar action stay thin.

## Phase 0: Research

1. Confirm the lowest-risk way to open one dialog from any dashboard route without navigating away from the current page.
2. Decide how to share create-product form state/submission logic with the Products page button instead of duplicating dialog internals.
3. Decide the verification strategy for a client-side dashboard-shell interaction in a repo that currently lacks a dedicated frontend test script.

## Phase 1: Design

1. Define the dashboard-scoped UI state model for global product creation.
2. Define the reusable product-create form/submission module boundaries.
3. Define the trigger contract for sidebar `Quick Create` and Products page `Add Product`.
4. Define automated and manual verification coverage.

## Post-Design Constitution Check

- **Architecture Fit**: Pass. Design introduces only dashboard-scoped client modules in `apps/web`.
- **Typed Maintainability**: Pass. Shared controller plus shared form handler removes duplicated create-product logic.
- **Data Safety**: Pass. The API and database path remain unchanged.
- **Verification Plan**: Pass. Plan includes targeted automated coverage for shared dialog orchestration plus manual route checks.
- **Operational Readiness**: Pass. No runtime config changes; failure mode is limited to one UI flow and can be rolled back by reverting web changes.

## Complexity Tracking

No constitution violations identified.
