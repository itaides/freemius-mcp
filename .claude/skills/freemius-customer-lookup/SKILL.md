---
name: freemius-customer-lookup
description: Use when the user wants to look up a Freemius customer/user and see their profile — payments, subscriptions, licenses, plan — by user id (or to find them and summarize their account). Drives the connected `freemius` MCP server (curated get/list tools + the dynamic trio for per-user endpoints). Triggers on "look up Freemius user", "customer details", "what did this user buy", "is this customer active", "find the buyer of payment X".
---

# Freemius Customer Lookup

Assemble a 360° view of a Freemius customer using the connected **`freemius` MCP server**. Read-only.

## Tools (from the `freemius` MCP)

Curated (prefer these):
- `get_user({ id })`, `list_users({ count?, offset? })`
- `get_payment({ id })`, `list_payments()`, `get_subscription({ id })`, `list_subscriptions()`,
  `get_plan({ id })`

Long-tail (for per-user endpoints the curated set doesn't name) — the **dynamic trio**:
- `freemius_search_tools("user")` → discover ops like `users/list-payments`,
  `users/list-subscriptions`, `users/list-licenses`.
- `freemius_describe_tool(operationId)` → its params (the user id path token, e.g. `user_id`).
- `freemius_execute_tool(operationId, { params })` → run it. Reads are always allowed.

## Workflow

1. **Resolve the user id.** If given an id, use it. If given a payment id, `get_payment({id})` and
   read `user_id`. If given an email/name, `list_users` and match (note: only a page is searched —
   say so if not found).
2. **Fetch the profile.** `get_user({ id })` for identity. Then per-user collections via the trio:
   `freemius_execute_tool('users/list-payments', { params: { user_id } })`, and likewise
   `users/list-subscriptions`, `users/list-licenses`. (Use `freemius_describe_tool` first if unsure
   of the exact param name.)
3. **Label plans.** Payments/subscriptions carry `plan_id`; resolve names with `get_plan` /
   `list_plans` so the summary is human-readable.
4. **Summarize:** identity (id, name/email, verified), lifetime spend **per currency** (sum payment
   `gross`, treat `type:'refund'` as negative — never sum across currencies), active subscription(s)
   + plan, and license status. Note anything missing rather than guessing.

## Cautions

- **Read-only by default.** Never attempt a write (cancel/refund) unless the user explicitly asks
  AND write mode is on — and even then prefer the curated `cancel_subscription` (which requires a
  `confirm` echoing the id). If write mode is off, the server refuses with `write_not_allowed`; relay
  that, don't retry.
- Customer records contain **PII** (email, IP, card id). Surface only what the user asked for; don't
  dump raw payment objects unless requested.
