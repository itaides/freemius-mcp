// execute.ts — generic runner for the long tail (docs/specs §5):
//   1. look up op in catalog; reject developer-scope ops (§3)
//   2. validate params against generated validators (§9)
//   3. enforce guards — fail-closed write gate (§7)
//   4. call raw-client with the TEMPLATE path + { path, query } params
//   5. map { error: { code, message } } → FreemiusApiError (raw path only)
//   6. paginate only when requested, with a hard page cap (§9)

import type { GuardContext } from './guards.js';

export interface ExecuteResult {
    data: unknown;
    partial?: boolean;
}

// TODO(docs/specs §5): implement the six-step runner.
export async function execute(
    _operationId: string,
    _params: Record<string, unknown>,
    _ctx: GuardContext
): Promise<ExecuteResult> {
    throw new Error('execute.execute: not implemented — see docs/specs §5');
}
