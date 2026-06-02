// users command handlers (docs/specs §6). Curated reads via the SDK's typed user service.

import type { Command } from 'commander';
import type { Freemius, UserEntity } from '@freemius/sdk';
import type { FreemiusContext } from '../../core/freemius.js';
import { rawRequest, isOkStatus } from '../../core/raw-client.js';
import { toGetResult, type GetResult } from '../../core/reads.js';

// NOTE: the SDK's user service appends a `fields=…` query param that returns HTTP 500 on the live
// API, so we read users via the raw client instead (no fields param). Verified against sdk 0.3.0.

export async function getUser(client: Freemius, id: string): Promise<GetResult<UserEntity>> {
    const result = await rawRequest<UserEntity>(client, 'GET', '/products/{product_id}/users/{user_id}.json', {
        path: { product_id: client.api.productId, user_id: id },
    });

    const user = isOkStatus(result.status) && result.data?.id != null ? result.data : null;

    return toGetResult(user, id);
}

export interface ListUsersOptions {
    count?: number;
    offset?: number;
}

export async function listUsers(client: Freemius, options: ListUsersOptions = {}): Promise<UserEntity[]> {
    const result = await rawRequest<{ users?: UserEntity[] }>(client, 'GET', '/products/{product_id}/users.json', {
        path: { product_id: client.api.productId },
        query: { count: options.count, offset: options.offset },
    });

    if (!isOkStatus(result.status) || !Array.isArray(result.data?.users)) {
        return [];
    }

    return result.data.users;
}

export function registerUsers(program: Command, resolve: () => FreemiusContext): void {
    const users = program.command('users').description('User reads');

    users
        .command('get')
        .argument('<id>', 'user id')
        .description('Get a user by id')
        .action(async (id: string) => {
            const result = await getUser(resolve().client, id);

            if (!result.found) {
                console.log(JSON.stringify({ error: 'not_found', resource: 'user', id: result.id }));
                process.exitCode = 1;
                return;
            }

            console.log(JSON.stringify(result.data, null, 2));
        });

    users
        .command('list')
        .description('List users')
        .option('--count <n>', 'page size (max 50)', (v) => Number.parseInt(v, 10))
        .option('--offset <n>', 'page offset', (v) => Number.parseInt(v, 10))
        .action(async (opts: ListUsersOptions) => {
            console.log(JSON.stringify(await listUsers(resolve().client, opts), null, 2));
        });
}
