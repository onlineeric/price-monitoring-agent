# Feature Specification: Clickable Products in Chat Replies

**Feature Branch**: `009-chat-product-links`

**Created**: 2026-06-16

**Status**: Draft

**Input**: User description: "In the chat, when I get a product — whether from a name search or a semantic search — the reply is pure text. When the assistant finds product(s), it should let me open the product's detail view directly from the reply, instead of forcing me to leave chat and look the product up by hand."

## Clarifications

### Session 2026-06-16

- Q: Which products become clickable cards, and how many? → A: Show the products the search tool returned, capped at 5 visible, with a "+N more matched" note when the result set is larger.
- Q: When a product's detail view is opened from chat, does it keep its action buttons? → A: Reuse the detail view fully, including "Check price now" and "Update product info"; those actions must work independently of the products page, and the open view does not live-update afterward (consistent with the no-auto-refresh rule).
- Q: If the assistant runs more than one search in a single reply, how are the cards shown? → A: Merge all of that reply's searches into a single deduplicated (by product identity) list, capped at 5 total.

## User Scenarios & Testing *(mandatory)*

The chat assistant can already find monitored products and answer questions about
them, but every answer is plain text. The product names it mentions are dead
ends: to see a product's image, price trend, specifications, or source link the
user has to remember the name, leave the chat, and search for it again in the
product list. This feature closes that gap by making the products the assistant
surfaces directly openable from the conversation.

### User Story 1 - Open a product from search-result cards (Priority: P1)

A user asks the chat assistant to find products (for example, "show me the
headphones I'm tracking" or "find products similar to a travel mug"). The
assistant runs a product search and, alongside its written answer, presents the
matching products as a compact, clickable list (each showing at least the
product name and its current price). Clicking one opens the same product detail
view used elsewhere in the app — without leaving the chat page.

**Why this priority**: This is the core value and the most reliable surface. The
clickable list is built from the actual products the assistant retrieved, so the
right product always opens. It delivers the whole "open a product from chat"
outcome on its own and is a strong portfolio demonstration of the chat agent
being wired into the rest of the app.

**Independent Test**: Ask the assistant a query that returns one or more
products; confirm a clickable product list appears with name + price, and that
clicking an entry opens the product detail view for exactly that product, with
the chat conversation preserved underneath.

**Acceptance Scenarios**:

1. **Given** the user asks a question that makes the assistant search products and at least one product matches, **When** the assistant's reply is shown, **Then** the matching products appear as a clickable list showing each product's name and current price.
2. **Given** a clickable product list is shown in a reply, **When** the user clicks one product, **Then** the product detail view opens for that product (image, current price, trend, metadata, specifications, source link) without navigating away from the chat.
3. **Given** the product detail view was opened from chat, **When** the user closes it, **Then** they return to the same chat conversation in the same scroll position, with all prior messages intact.
4. **Given** the assistant searches and finds no matching products, **When** the reply is shown, **Then** no product list appears and the assistant's text explains that nothing matched.

---

### User Story 2 - Open a product from inline mentions in the reply (Priority: P2)

When the assistant names a specific product inside its written answer (for
example, "The cheapest match is the Sony WH-1000XM5 at NZD 585.00"), that product
name is itself clickable and opens the product detail view, so the user can act
on a product the moment it is mentioned in prose — not only from the list at the
end.

**Why this priority**: This makes the reply feel natural and conversational and
reduces friction further, but it builds on top of the reliable card list from
Story 1. If an inline mention ever fails to resolve to a product, Story 1 still
gives the user a working way to open it, so this story is additive rather than
foundational.

**Independent Test**: Ask a question whose answer references a specific product
by name in a sentence; confirm that product name is visibly interactive and that
activating it opens the correct product's detail view.

**Acceptance Scenarios**:

1. **Given** the assistant's written answer refers to a specific product it retrieved, **When** the reply is rendered, **Then** that product reference is visibly interactive (distinct from plain text).
2. **Given** an interactive product reference in the prose, **When** the user activates it, **Then** the product detail view opens for that referenced product.
3. **Given** the assistant references a product it cannot reliably resolve to a tracked product, **When** the reply is rendered, **Then** the reference does not behave as a broken or misleading action (it renders as ordinary, non-misleading text rather than opening the wrong product).

---

### Edge Cases

- **Product removed after the reply**: A product is deleted (or otherwise no longer available) between when the assistant listed it and when the user clicks it. The user gets a clear "this product is no longer available" message instead of a broken or empty detail view.
- **Product still loading details**: A product was found but has no extracted price or metadata yet. Its entry is still openable; the detail view shows the same "not yet available" placeholders it shows everywhere else, not an error.
- **Many results**: A search returns a large number of products. The clickable list shows at most 5 products and indicates how many more matched, so it stays readable and never floods the reply or breaks the chat layout.
- **Streaming in progress**: The assistant is still streaming its answer. Clickable products appear once the underlying search has completed; partial/streaming text never produces a half-formed or mis-targeted clickable product.
- **Repeated / duplicate mentions**: A product is returned by more than one of the reply's searches, or appears both in the prose and in the card list. The merged card list shows each distinct product only once (deduplicated by identity); whichever surface the user activates opens the correct single product, with no duplicate or conflicting detail view.
- **Non-product answers**: The user asks something that does not involve products (or the assistant answers without searching). The reply contains no clickable product surfaces and looks exactly as it does today.
- **Keyboard and assistive tech**: Every clickable product surface is reachable and operable by keyboard and announced meaningfully to assistive technology.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: When the chat assistant retrieves one or more products in service of an answer, the reply MUST present those products as a clickable list built from the products the search returned, each entry showing at least the product name and its current price (or a clear placeholder when no price is known).
- **FR-002**: Activating a product in the clickable list MUST open the product detail view for exactly that product, reusing the same detail experience available elsewhere in the app (image, current price, trend, rich metadata, specifications list, source link, and the "Check price now" / "Update product info" actions). Those actions MUST function when the view is opened from the chat page, independent of the products list page.
- **FR-003**: Opening and closing a product's detail view MUST keep the user on the chat page with the conversation and scroll position preserved.
- **FR-004**: When the assistant names a retrieved product within its written answer, that mention MUST be rendered as an interactive element that opens the same detail view for that product.
- **FR-005**: An inline product mention that cannot be reliably matched to a tracked product MUST degrade to ordinary, non-misleading text rather than opening an incorrect product or appearing broken.
- **FR-006**: The detail view opened from chat MUST reflect current stored data for the product at the moment it is opened, including current price, price history/trend, and the latest metadata.
- **FR-007**: If a product is no longer available when the user tries to open it, the system MUST show a clear, non-technical "no longer available" message and leave the conversation usable.
- **FR-008**: Replies that do not involve products MUST be visually and behaviorally unchanged from today (no empty list, no spurious interactive elements).
- **FR-009**: A reply MUST present a single clickable product list. When the reply involved more than one search, their results MUST be merged and deduplicated by product identity into that one list. The list MUST show at most 5 products; when more than 5 distinct products matched across the reply's searches, it MUST indicate how many additional products matched (a "+N more matched" affordance) without rendering them all, so the reply stays readable and never breaks the chat layout.
- **FR-010**: All clickable product surfaces (list entries and inline mentions) MUST be operable by keyboard and exposed meaningfully to assistive technology.
- **FR-011**: The feature MUST cover products surfaced by both name-based product search and meaning-based (semantic) product search.

### Key Entities *(include if feature involves data)*

- **Retrieved product reference**: The minimal product identity the assistant surfaces in a reply — a stable product identifier plus display fields (name, current price). It is what a clickable surface resolves against when opening the detail view.
- **Product detail view**: The existing in-app, on-demand presentation of a single product's image, current price, trend, rich metadata, specification list, and source link. This feature reuses it as the open target; it is not redefined here.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For 100% of chat replies in which the assistant retrieves at least one product, a clickable product surface is presented (list and/or inline) without the user taking any extra step.
- **SC-002**: A user can go from "assistant mentions a product" to "viewing that product's full detail" in a single action (one click/activation), with no manual re-search.
- **SC-003**: When a product surfaced in chat is clicked, the detail view that opens corresponds to the correct product in 100% of cases for the structured list surface.
- **SC-004**: Chat replies that do not involve products show zero clickable product surfaces — i.e., no regression to the existing plain-text chat experience.
- **SC-005**: Every clickable product surface can be reached and activated using only the keyboard.
- **SC-006**: Opening and closing a product detail view from chat never loses or reorders the existing conversation.

## Assumptions

- The existing reusable product detail view is the intended target experience opened from the chat page, including its "Check price now" / "Update product info" actions (no new detail screen and no read-only variant is introduced); making those actions work outside the products page is in scope.
- The chat assistant already retrieves products with a stable identifier and display fields when it performs a search; surfacing those is sufficient — the feature does not change what the assistant is allowed to search for or talk about.
- "Open the product" means open the in-app detail view (keyed on the product's identity), distinct from the product's external source page, which the detail view itself already links to.
- Hydration of a product's detail is on demand at click time (consistent with the project rule of not silently auto-refreshing visible lists); nothing in chat polls or background-refreshes product data.
- The structured (list) surface is the source of truth for correctness; the inline-prose surface is a convenience layer that must fail safe rather than mislead.
- Scope is limited to the dashboard chat page and the two existing product search capabilities; no changes to email digests, the product list pages, or the assistant's allowed topic domain.
