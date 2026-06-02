// coupons command handlers (docs/specs §6). Coupons have NO SDK service, so writes go through the
// raw client (the §5 escape hatch). `create` is a product-scope, NON-destructive write: it requires
// write mode (§7) but no confirm echo (nothing is overwritten or destroyed).

import type { Command } from 'commander';
import type { Freemius } from '@freemius/sdk';
import type { FreemiusContext } from '../../core/freemius.js';
import { rawRequest, isOkStatus } from '../../core/raw-client.js';
import { assertWriteEnabled } from '../../core/guards.js';

export type CouponRow = { id: number | string; [key: string]: unknown };

export interface CreateCouponInput {
    code: string;
    discount: number;
    discount_type: string;
    plans?: string[];
    user_type?: string;
    redemptions_limit?: number;
    has_renewals_discount?: boolean;
    has_addons_discount?: boolean;
}

export type CreateCouponResult = { created: true; data: CouponRow } | { created: false; status: number };

export async function createCoupon(client: Freemius, input: CreateCouponInput): Promise<CreateCouponResult> {
    // Pass through only the fields that were supplied (the API rejects unexpected nulls on some fields).
    const body: Record<string, unknown> = { code: input.code, discount: input.discount, discount_type: input.discount_type };
    if (input.plans !== undefined) body.plans = input.plans;
    if (input.user_type !== undefined) body.user_type = input.user_type;
    if (input.redemptions_limit !== undefined) body.redemptions_limit = input.redemptions_limit;
    if (input.has_renewals_discount !== undefined) body.has_renewals_discount = input.has_renewals_discount;
    if (input.has_addons_discount !== undefined) body.has_addons_discount = input.has_addons_discount;

    const result = await rawRequest<CouponRow>(client, 'POST', '/products/{product_id}/coupons.json', {
        path: { product_id: client.api.productId },
        body,
    });

    if (!isOkStatus(result.status) || result.data?.id == null) {
        return { created: false, status: result.status };
    }

    return { created: true, data: result.data };
}

export function registerCoupons(program: Command, resolve: () => FreemiusContext): void {
    const coupons = program.command('coupons').description('Coupon reads and mutations');

    coupons
        .command('create')
        .description('Create a coupon (requires --write)')
        .requiredOption('--code <code>', 'coupon code')
        .requiredOption('--discount <n>', 'discount amount', (v) => Number.parseFloat(v))
        .requiredOption('--discount-type <type>', "discount type ('percentage' or 'dollar')")
        .option('--plans <ids>', 'comma-separated plan ids the coupon applies to', (v) => v.split(',').map((s) => s.trim()))
        .action(
            async (
                opts: { code: string; discount: number; discountType: string; plans?: string[] },
                command: Command
            ) => {
                try {
                    assertWriteEnabled(Boolean(command.optsWithGlobals().write));
                } catch (error) {
                    const err = error as Error;
                    console.log(JSON.stringify({ error: err.name, message: err.message }));
                    process.exitCode = 1;
                    return;
                }

                const result = await createCoupon(resolve().client, {
                    code: opts.code,
                    discount: opts.discount,
                    discount_type: opts.discountType,
                    plans: opts.plans,
                });

                if (!result.created) {
                    console.log(JSON.stringify({ error: 'create_failed', resource: 'coupon', status: result.status }));
                    process.exitCode = 1;
                    return;
                }

                console.log(JSON.stringify(result.data, null, 2));
            }
        );
}
