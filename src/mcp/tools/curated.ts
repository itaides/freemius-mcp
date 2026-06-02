// curated.ts — ~16 first-class named tools (docs/specs §7), each with tight zod inputs + MCP
// annotations (readOnlyHint / destructiveHint / idempotentHint). Writes registered only when enabled.

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export interface ToolOptions {
    writeEnabled: boolean;
}

// TODO(docs/specs §7): list_subscriptions, get_subscription, cancel_subscription (write), list_licenses,
// get_license, activate_license (write), deactivate_license (write), get_user, list_users, list_installs,
// list_payments, revenue_summary, list_plans, get_plan, list_coupons, create_coupon (write).
export function registerCuratedTools(_server: McpServer, _opts: ToolOptions): void {
    // not implemented yet
}
