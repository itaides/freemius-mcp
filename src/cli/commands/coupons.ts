// coupons command handlers (docs/specs §6). Coupons have NO SDK service, so writes go through the
// raw client (the §5 escape hatch). `create` is a product-scope, NON-destructive write: it requires
// write mode (§7) but no confirm echo (nothing is overwritten or destroyed).

import type { Freemius } from '@freemius/sdk';
import type { Command } from 'commander';
import { errorEnvelope } from '../../core/format.js';
import type { FreemiusContext } from '../../core/freemius.js';
import { assertWriteEnabled } from '../../core/guards.js';
import { isOkStatus, rawRequest } from '../../core/raw-client.js';
import { err, ok, type Result } from '../../core/result.js';
import { handledByDryRun } from '../cli-helpers.js';

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

export async function createCoupon(client: Freemius, input: CreateCouponInput): Promise<Result<CouponRow>> {
    // Pass through only the fields that were supplied (the API rejects unexpected nulls on some fields).
    const body: Record<string, unknown> = {
        code: input.code,
        discount: input.discount,
        discount_type: input.discount_type,
    };
    if (input.plans !== undefined) body.plans = input.plans.join(',');
    if (input.user_type !== undefined) body.user_type = input.user_type;
    if (input.redemptions_limit !== undefined) body.redemptions_limit = input.redemptions_limit;
    if (input.has_renewals_discount !== undefined) body.has_renewals_discount = input.has_renewals_discount;
    if (input.has_addons_discount !== undefined) body.has_addons_discount = input.has_addons_discount;

    const result = await rawRequest<CouponRow>(client, 'POST', '/products/{product_id}/coupons.json', {
        path: { product_id: client.api.productId },
        body,
    });

    if (!isOkStatus(result.status) || result.data?.id == null) {
        let message = 'coupon could not be created';
        if (result.error && typeof result.error === 'object') {
            const errObj = result.error as Record<string, unknown>;
            const innerError = errObj.error as Record<string, unknown> | undefined;
            if (innerError && typeof innerError.message === 'string') {
                message = innerError.message;
            } else if (typeof errObj.message === 'string') {
                message = errObj.message;
            }
        }
        return err('create_failed', message, result.status);
    }

    return ok(result.data);
}

export function registerCoupons(program: Command, resolve: () => FreemiusContext): void {
    const coupons =
        program.commands.find((c) => c.name() === 'coupons') ??
        program.command('coupons').description('Coupon reads and mutations');

    coupons
        .command('create')
        .description('Create a coupon (requires --write)')
        .requiredOption('--code <code>', 'coupon code')
        .requiredOption('--discount <n>', 'discount amount', (v) => Number.parseFloat(v))
        .requiredOption('--discount-type <type>', "discount type ('percentage' or 'dollar')")
        .option('--plans <ids>', 'comma-separated plan ids the coupon applies to', (v) =>
            v.split(',').map((s) => s.trim())
        )
        .action(
            async (
                opts: { code: string; discount: number; discountType: string; plans?: string[] },
                command: Command
            ) => {
                if (
                    handledByDryRun(command, {
                        action: 'create_coupon',
                        code: opts.code,
                        discount: opts.discount,
                        discount_type: opts.discountType,
                    })
                ) {
                    return;
                }
                try {
                    assertWriteEnabled(Boolean(command.optsWithGlobals().write));
                } catch (error) {
                    console.log(JSON.stringify(errorEnvelope(error)));
                    process.exitCode = 1;
                    return;
                }

                const result = await createCoupon(resolve().client, {
                    code: opts.code,
                    discount: opts.discount,
                    discount_type: opts.discountType,
                    plans: opts.plans,
                });

                if (!result.ok) {
                    console.log(JSON.stringify({ error: result.error }));
                    process.exitCode = 1;
                    return;
                }

                console.log(JSON.stringify(result.data, null, 2));
            }
        );
}
