# AGENTS.md

How to **operate a Freemius product** through this tool — for any AI agent (or person) using the
`freemius` CLI or the `freemius-mcp` server. This is a **usage** guide. (Building/contributing to the
repo is a different concern — see [`CLAUDE.md`](./CLAUDE.md).)

## What you can do

Operate one Freemius product, either via the `freemius` CLI or the `freemius-mcp` MCP tools — the
operations are identical:

- **Read** subscriptions, users, payments, plans, and coupons.
- **Summarize revenue** (gross / refunds / net) over a date window.
- **Write** (only when enabled): cancel a subscription, create a coupon, or run any product-scope
  operation generically.

## The golden rule — read-only by default

- **Reads always work.** No setup beyond credentials.
- **Writes are refused** unless write mode is on: MCP → `FREEMIUS_MCP_ALLOW_WRITE=1`; CLI → `--write`.
- **Destructive writes** (cancel / delete) *also* require a `confirm` that echoes the target id.
- If a write is refused (`write_not_allowed` or `confirmation_required`), **do not retry blindly** —
  tell the user write mode is off (or that they must confirm the id). They have to opt in.
- **Developer-scope operations are not supported** and return `scope_unsupported` — don't attempt
  plan/pricing writes, bank account, etc.

## MCP tools — which to use, and when

Prefer the **curated** named tool when one fits:

| Tool | Use it to… |
| --- | --- |
| `list_subscriptions` · `get_subscription` | browse / fetch a subscription |
| `list_users` · `get_user` | browse / fetch a user (customer lookup) |
| `list_payments` · `get_payment` | browse / fetch a payment |
| `list_plans` · `get_plan` | browse / fetch a pricing plan (label a `plan_id`) |
| `revenue_summary` | per-currency gross/refunds/net over a window (`days` or `from`/`to`) |
| `cancel_subscription` ⚠️ | cancel a subscription — needs write mode **and** `confirm` = the id |
| `create_coupon` | create a coupon — needs write mode |

For anything the curated tools don't name (the long tail of ~140 operations), use the **dynamic trio**:

1. `freemius_search_tools("keyword")` → find the operation id.
2. `freemius_describe_tool("operation/id")` → see its params (do this before executing if unsure).
3. `freemius_execute_tool("operation/id", { …params }, confirm?)` → run it. Same safety gate applies.

## CLI — common commands

```bash
freemius subscriptions|users|payments|plans  list|get <id>
freemius revenue-summary [--days 90] [--from <ts>] [--to <ts>]
freemius call <operationId> --param k=v --json '{…}'          # any of the 140 ops
freemius --write subscriptions cancel <id> --confirm <id>     # destructive write
freemius --write coupons create --code SAVE20 --discount 20 --discount-type percentage
```

Useful flags: `--profile <name>` (read creds from `~/.config/freemius/config.json`, no env needed),
`--dry-run` (preview a mutation without calling the API), `--json` output is the default.

## Reading results

- **Success** is the data itself; **failure** is `{ "error": { "code", "message" } }`.
- Error codes you'll see: `not_found`, `write_not_allowed`, `confirmation_required`,
  `scope_unsupported`, `invalid_params`, `request_failed`, `revenue_partial`.
- An **empty list is genuinely empty** (a real `[]`), not an error.
- `revenue_summary` is grouped **by currency** — never add currencies together. If `capped` or
  `partial` is set, say the figure is incomplete, don't present it as final. There is **no MRR** and
  no "all-time" — it's a bounded window.

> `revenue_summary` renders as an interactive dashboard in hosts that support MCP Apps; everywhere
> else it returns the same text summary.

## Care

- Records contain **PII** (emails, IPs, card ids). Surface only what the user asked for; don't dump
  raw payment/user objects unless requested.
- For full historical analytics, point the user to the **Freemius dashboard** — this tool does
  bounded, in-session reads, not warehouse-scale reporting.
