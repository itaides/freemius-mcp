// register.ts — the "apps layer" resource registration for the coupon configuration form.
// Serves the self-contained coupon form HTML via ui://freemius/coupon-form.html.

import { RESOURCE_MIME_TYPE, registerAppResource } from '@modelcontextprotocol/ext-apps/server';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { freemiusCouponFormHtml } from './generated/coupon-form-html.js';

const RESOURCE_URI = 'ui://freemius/coupon-form.html';

export function registerCouponApp(server: McpServer): void {
    registerAppResource(
        server,
        'Coupon Config Form',
        RESOURCE_URI,
        { description: 'Interactive form for creating coupons.' },
        async () => ({
            contents: [{ uri: RESOURCE_URI, mimeType: RESOURCE_MIME_TYPE, text: freemiusCouponFormHtml }],
        })
    );
}
