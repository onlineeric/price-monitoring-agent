<!--
Sync Impact Report
- Version change: 0.0.0 -> 1.0.0
- Modified principles:
  - Template placeholder -> I. Monorepo Architecture Fidelity
  - Template placeholder -> II. Typed, Explicit, Maintainable Code
  - Template placeholder -> III. Safe Data Access and Canonical Models
  - Template placeholder -> IV. Independent, Risk-Proportional Verification
  - Template placeholder -> V. Operational Resilience by Default
- Added sections:
  - Delivery Constraints
  - Workflow and Review Gates
- Removed sections:
  - None
- Templates requiring updates:
  - ✅ updated: .specify/templates/plan-template.md
  - ✅ updated: .specify/templates/spec-template.md
  - ✅ updated: .specify/templates/tasks-template.md
  - ⚠ pending: .specify/templates/commands/*.md (directory not present in this repository)
- Follow-up TODOs:
  - None
-->
# Price Monitoring Agent Constitution

## Core Principles

### I. Monorepo Architecture Fidelity
All changes MUST fit the established monorepo architecture: `apps/web` for the
Next.js dashboard and API surface, `apps/worker` for BullMQ-driven background
processing, `packages/db` for shared Drizzle schema and database access, and
`specs/` for implementation artifacts. New code MUST extend an existing
boundary unless a plan explicitly justifies a new package, app, or runtime.
This keeps feature work discoverable and prevents architecture drift.

### II. Typed, Explicit, Maintainable Code
Production code MUST be TypeScript-first, small in scope, and explicit in
behavior. Functions, modules, and components MUST have clear responsibilities,
human-readable naming, and types that document intent. Structured data MUST be
parsed with purpose-built libraries rather than ad hoc regex, and reusable logic
MUST be extracted when duplication appears. Clever but opaque patterns are not
acceptable because maintainability is a core product requirement.

### III. Safe Data Access and Canonical Models
Database work MUST use the Drizzle query builder API and shared schema models in
`packages/db`; raw SQL via `db.execute()` is prohibited unless no query-builder
equivalent exists and the plan records the exception. Prices MUST remain stored
as integer cents and product URLs remain the natural identity boundary unless a
documented migration changes that rule. Any feature that touches persistence,
queue payloads, or extraction outputs MUST preserve type safety and backward
compatibility for existing records and jobs.

### IV. Independent, Risk-Proportional Verification
Every feature specification MUST define independently testable user stories, and
every implementation plan MUST state how each story will be verified before
work begins. Verification depth MUST match risk: persistence changes,
extraction logic, scheduling, queue flows, and user-visible business logic
require automated coverage or a documented reason why a lower-cost check is
sufficient. Work is not complete until the relevant verification has been run or
the blocker has been recorded explicitly.

### V. Operational Resilience by Default
Changes MUST preserve safe runtime behavior for both local development and
production deployment. Environment variables, scheduler behavior, retry/error
handling, structured logging, graceful shutdown, and deployment assumptions MUST
be documented whenever they are introduced or changed. Features that can affect
worker scheduling, extraction reliability, email delivery, or production
startup MUST include observability or diagnostics that make failures actionable.

## Delivery Constraints

- Plans and specs MUST state the affected app or package boundaries, storage
  impact, queue/scheduler impact, environment/config changes, and rollback or
  safety considerations when relevant.
- Feature work MUST prefer existing, battle-tested dependencies with active
  maintenance and TypeScript support over bespoke implementations.
- Frontend work MUST preserve the existing design system and Next.js patterns
  unless the feature explicitly calls for a broader design change.
- Documentation for operators and developers MUST be updated when runtime
  behavior, setup steps, or deployment expectations change.

## Workflow and Review Gates

- The Constitution Check in each plan MUST confirm architecture fit, typed
  maintainability, Drizzle-compliant data access, verification strategy, and
  operational readiness before design proceeds.
- Specifications MUST capture user stories in priority order, measurable
  success criteria, edge cases, and technical or operational constraints that
  materially affect implementation.
- Tasks MUST remain grouped by user story, identify shared foundational work
  separately, and include explicit verification, observability, and
  documentation tasks whenever the change warrants them.
- Code review and self-review MUST reject changes that violate these principles
  unless the deviation is documented in the plan's Complexity Tracking section
  and approved as an intentional exception.

## Governance

This constitution overrides conflicting local process guidance for feature
planning, specification, and execution. Amendments MUST update this file and
any affected templates in `.specify/templates/` within the same change so the
workflow stays internally consistent.

Versioning policy for this constitution follows semantic versioning:
- MAJOR for removing a principle or redefining governance in a way that changes
  existing obligations.
- MINOR for adding a new principle, gate, or mandatory section.
- PATCH for clarifications, wording improvements, and non-semantic cleanup.

Compliance review is mandatory at plan creation, task generation, implementation,
and review time. Any approved exception MUST record the violated principle, why
it is necessary, the simpler alternative that was rejected, and any mitigation
or follow-up work.

**Version**: 1.0.0 | **Ratified**: 2026-03-06 | **Last Amended**: 2026-03-06
