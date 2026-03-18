# Send report to email idea

We need to implement a new send report to email page.
On left panel, add a new menu item "Send Report to Emails".
On the page, preview the email report content, allow input email addresses separated by comma, and send button.
This page only read current product info from database, construct the email content preview from current product info, not involve to update product price.

## refactor idea
The current product price workflow can only update all products' price, then send report to email.
There are no function to send report to email without updating prices.
We need to refactor current logic, so that email sending is decoupled from price updates, and need to ensure not breaking existing functionality.
So we can call the new function to send report to email without updating prices in our new send report to email page.

### Current behavior (now):
1) Manual product check (`POST /api/products/:id/check-price`) enqueues `check-price` with product URL.
2) Manual digest (`POST /api/digest/trigger`) enqueues `send-digest`, which currently creates a flow of:
   - parent: `send-digest-flow`
   - children: one `check-price` job per active product.
3) `check-price` jobs scrape each product and save price data (create/find product, insert price record, update timestamps).
4) Only after all `check-price` jobs complete, `onDigestFlowComplete` runs and sends the digest email.
5) Therefore, there is currently no email-only path; price refresh and email are always tied together.

### Refactor requirements:
- Split into two independent workflows:
  A) `updatePrices` job/service: run checks + persist price records only.
  B) `sendPriceReportEmail` job/service: read latest trend data from DB and send email only.
- Keep existing `PriceDigest` email template and sender settings (`RESEND`, `ALERT_EMAIL`, `EMAIL_FROM`).
- Ensure existing manual/scheduled digest still works by composing A then B.
- Add a new endpoint or job trigger to run B only (send report without updating prices).
- Keep behavior unchanged for the existing “check all & send” path, but provide a separate “send report only” option.

## Preview email report
This is an investigation how to use the same email component to power both preview and send.
Do not ask Resend to generate the preview for our app, we will render the email component in our app.

  1. Move the shared digest code out of the worker-only path.
     Put these in a shared server-safe module/package:

  - the React Email component from apps/worker/src/emails/PriceDigest.tsx
  - the digest data builder currently assembled in apps/worker/src/jobs/sendDigest.ts:74

  2. Add HTML rendering for the email.
     Install @react-email/render in the app that will serve the preview.
     Your Next.js server route should do:

  - load the exact digest data
  - render <PriceDigest ... /> to HTML
  - return that HTML

  3. Create a preview API route in Next.js.
     Example shape:

  - GET /api/digest/preview or POST /api/digest/preview
  - server-side only
  - response: { subject, html, generatedAt }

  4. Show the preview inside your web app.
     Best simple option:

  - render an iframe
  - set srcDoc={html}
    This isolates email HTML/CSS better than injecting it into the page directly.

  5. Keep send separate.
     After the user reviews the preview and clicks Send:

  - call a send API route
  - that route rebuilds the same digest payload
  - send with Resend using the same component or the already-rendered HTML

  6. Avoid preview/send mismatch.
     If “preview exactly what will be sent” matters, snapshot the payload used for preview:

  - store { products, generatedAt, subject } temporarily
  - send from that snapshot after confirmation
    Otherwise preview and send can differ slightly if prices change between those two actions.

  7. Recommended structure for this repo.

  - Shared email template module
  - Shared digest data builder service
  - apps/web preview route
  - apps/web send route
  - Worker can keep using the same shared template/builder for scheduled sends

  Official references:

  - Resend send API: https://resend.com/docs/api-reference/emails/send-email
  - Resend templates/dashboard preview workflow: https://resend.com/docs/dashboard/templates/introduction
  - React Email render utility: https://react.email/docs/utilities/render
