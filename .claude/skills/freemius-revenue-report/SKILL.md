---
name: freemius-revenue-report
description: Use when the user wants Freemius revenue, sales, or "how much did we make / MRR / refunds" figures for the product — for a period, by plan, or by currency. Drives the connected `freemius` MCP server (revenue_summary + list_payments + list_plans) to produce an accurate, per-currency report. Triggers on "Freemius revenue", "how much did we sell", "sales this month/quarter", "refund total", "revenue by plan".
---

# Freemius Revenue Report

Produce a revenue report for the Freemius product using the connected **`freemius` MCP server**.
This is read-only — no write mode needed.

## Tools (from the `freemius` MCP)

- `revenue_summary({ days?, from?, to? })` — bounded, **per-currency** `{ gross, refunds, net, count }`
  over a date window (default last 90 days; `from`/`to` are `'YYYY-MM-DD HH:mm:ss'` UTC).
- `list_payments({ count?, offset? })` / `get_payment({ id })` — individual payments for drill-down.
- `list_plans()` / `get_plan({ id })` — to label a plan id (payments carry `plan_id`).

## Workflow

1. **Resolve the window.** Map the user's phrasing to `revenue_summary` args: "last 90 days" →
   `{}`; "this year" → `{ days: 365 }`; a specific range → `{ from, to }`. There is **no all-time
   mode** — pick a concrete window and say so.
2. **Call `revenue_summary`.** Read the result honestly:
   - It is **grouped by currency** — never add USD + EUR into one number. Report each currency.
   - `net = gross − refunds` per currency. State gross, refunds, and net separately.
   - If `capped: true`, the window had more than the page cap — **say the figure is a lower bound**
     and suggest a narrower window. If `partial: true`, a page failed mid-sweep — **flag it as
     incomplete**, don't present it as final.
3. **Optional breakdown by plan.** If asked "by plan", page `list_payments`, group `gross` by
   `plan_id`, and label ids via `list_plans`. Note this is a client-side rollup over the same window.
4. **Present** a compact table per currency (gross / refunds / net / # payments) + the window. End
   with the one-line caveat below.

## Honesty rules (do not skip)

- **MRR is not available** — `revenue_summary` does payments aggregation, not recurring-revenue. If
  asked for MRR, say it's not yet implemented and offer gross/net over a window instead.
- Always state the **window** and **currency** explicitly. A bare number without them is misleading.
- For full historical analytics, point the user to the **Freemius dashboard** — this tool is a
  bounded, in-session aggregation, not an analytics warehouse.
